// collect-nomisma.mjs — 采集 Nomisma 古代钱币实物（免 key，CC-BY）
// 数据源：https://nomisma.org/query （钱币学 LOD 枢纽，聚合 ANS/PAS/大英等机构实物硬币）
// 输出：追加到 public/data/finance.json（ancient-coins 分类）
//
// 用法：node scripts/collect-nomisma.mjs [--limit N]
//
// 说明：Nomisma 的 NumismaticObject（实物硬币）约 10.5 万件带图（foaf:depiction）。
// 这里按面额（denomination）采样，归入金融馆「古代钱币」分类。

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'finance.json')
const SPARQL = 'https://nomisma.org/query'
const UA = 'museum-collector/1.0 (educational, non-commercial research; https://example.com)'

const PREFIX = `PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX nm: <http://nomisma.org/id/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dcterms: <http://purl.org/dc/terms/>`

// 按面额采样（denomination id → 面额中文名 + 数量）
const DENOMS = [
  { id: 'denarius', label: '第纳里乌斯（Denarius）', limit: 700 },
  { id: 'sestertius', label: '塞斯特提乌斯（Sestertius）', limit: 500 },
  { id: 'aureus', label: '奥雷乌斯金币（Aureus）', limit: 400 },
  { id: 'as', label: '阿斯（As）', limit: 400 },
  { id: 'antoninianus', label: '安东尼尼安（Antoninianus）', limit: 350 },
  { id: 'tetradrachm', label: '四德拉克马（Tetradrachm）', limit: 400 },
  { id: 'stater', label: '斯塔特（Stater）', limit: 350 },
  { id: 'quarter-stater', label: '四分之一斯塔特', limit: 200 },
  { id: 'dupondius', label: '杜蓬狄乌斯（Dupondius）', limit: 300 },
  { id: 'siliqua', label: '西利夸（Siliqua）', limit: 300 },
]

// 仅保留「可访问」的图源域名（实测：大英博物馆 + 高卢罗马博物馆 200 image/jpeg；
// 其余 finds.org.uk 已 404、nrs.harvard.edu 是 URN 解析器 405、artic.edu IIIF 403）
const GOOD_HOSTS = ['britishmuseum.org', 'galloromeinsmuseum.be']

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function bv(b) {
  return b?.value || ''
}

function buildSparql(denomId, limit) {
  const hostFilter = GOOD_HOSTS.map((h) => `CONTAINS(STR(?img), "${h}")`).join(' || ')
  return `${PREFIX}
SELECT ?c ?img ?auth ?alabel WHERE {
  ?c a nmo:NumismaticObject ;
     foaf:depiction ?img ;
     nmo:hasTypeSeriesItem ?t .
  ?t nmo:hasDenomination nm:${denomId} .
  FILTER(${hostFilter})
  OPTIONAL { ?t nmo:hasAuthority ?auth . ?auth skos:prefLabel ?alabel FILTER(langMatches(lang(?alabel), "en")) }
} LIMIT ${limit}`
}

async function runSparql(sparql, retries = 4) {
  const url = `${SPARQL}?query=${encodeURIComponent(sparql)}`
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
      })
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        await sleep(2500 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const cleaned = text.replace(/[\u0000-\u001f]/g, ' ')
      const j = JSON.parse(cleaned)
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1800 * (i + 1))
    }
  }
  throw new Error('重试耗尽')
}

function httpsize(u) {
  if (!u) return ''
  return u.replace(/^http:/, 'https:')
}

function mapRow(b, denom) {
  const img = httpsize(bv(b.img))
  const auth = bv(b.alabel) || '古代铸币'
  const uri = bv(b.c)
  // 图片文件名作为 id 兜底
  const slug = img.split('/').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 30) || uri.split('/').pop()
  return {
    id: `finance-nomisma-${denom.id}-${slug}`,
    hall: 'finance',
    categoryId: 'ancient-coins',
    name: `${denom.label} · ${auth}`,
    origin: auth,
    era: '古代',
    date: '',
    location: '',
    collection: 'Nomisma 钱币学数据库',
    dimensions: '',
    material: '',
    description: `古代${denom.label}钱币，发行于${auth}。来自 Nomisma 钱币学开放数据（CC-BY）。`,
    tags: ['古代钱币', denom.label],
    icon: '🪙',
    imageUrl: img.replace('/large_', '/small_'),
    imageLarge: img,
    source: 'Nomisma',
    sourceUrl: uri || 'https://nomisma.org/',
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  let limit = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[++i], 10)
  }
  return { limit }
}

async function main() {
  const { limit } = parseArgs()
  const all = []
  const seen = new Set()

  for (const denom of DENOMS) {
    const lim = limit ?? denom.limit
    let rows
    try {
      rows = await runSparql(buildSparql(denom.id, lim))
    } catch (err) {
      console.error(`  [${denom.id}] 查询失败：${err.message}，跳过`)
      await sleep(800)
      continue
    }
    let added = 0
    for (const b of rows) {
      const uri = bv(b.c)
      if (seen.has(uri)) continue
      seen.add(uri)
      all.push(mapRow(b, denom))
      added++
    }
    console.error(`  [${denom.id}] ${denom.label} → +${added}（累计 ${all.length}）`)
    await sleep(1500) // 礼貌限速
  }

  console.error(`\n✅ Nomisma 采集完成：${all.length} 件古代钱币实物`)

  // 替换模式：剔除旧的 Nomisma 采集（finance-nomisma-*），保留策展精品与 Wikidata 部分，再并入新采集
  let existing = []
  try {
    existing = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  } catch (_e) {
    console.error('  （finance.json 不存在，将新建）')
  }
  const kept = existing.filter((e) => !String(e.id || '').startsWith('finance-nomisma-'))
  const merged = [...kept, ...all]
  await writeFile(OUT_FILE, JSON.stringify(merged), 'utf8')
  console.error(`  已写入 ${OUT_FILE}（保留 ${kept.length} + 新增 ${all.length} = ${merged.length}）`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
