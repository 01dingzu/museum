// collect-literature-wd.mjs — 文学馆第二路采集：Wikidata SPARQL 批量
// DBpedia 类目直挂数量太少（~200），此脚本用 Wikidata 按「体裁类」批量拉
// 有 P18（Commons 图片）的作品与作家，合并进 literature.json 并按名称去重。
//
// 用法：node scripts/collect-literature-wd.mjs
// 输出：public/data/literature.json（合并）

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'literature.json')
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = { 'User-Agent': 'museum-collector/1.0 (educational, non-commercial research)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function proxiedUrl(filenameOrUrl, width) {
  let name = String(filenameOrUrl || '')
  // P18 经 SPARQL 返回的是完整 URL（Special:FilePath 形态），需先归一化取出文件名
  if (/^https?:/i.test(name)) {
    const norm = name.replace(/%3A/gi, ':').replace(/%2F/gi, '/')
    let idx = norm.lastIndexOf('Special:FilePath/')
    if (idx < 0) idx = norm.lastIndexOf('/File:')
    if (idx < 0) return ''
    name = norm.slice(idx).replace(/^Special:FilePath\//i, '').replace(/^\/File:/i, '')
    try {
      name = decodeURIComponent(name)
    } catch { /* 已是明文 */ }
  }
  const safe = name.replace(/ /g, '_')
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(safe)}?width=${width}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
}

async function runSparql(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(SPARQL, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
        body: query,
      })
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 500) {
        await sleep(8000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(5000 * (i + 1))
    }
  }
  return []
}

const bv = (b) => b?.value || ''
const yearOfTime = (tv) => {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(tv)
  if (!m) return null
  const y = parseInt(m[2], 10)
  return m[1] === '-' ? -y : y
}

// 类目 → 体裁类标签（SPARQL 内按 label 匹配，避免硬编码 Q-id 记错）
const CATS = {
  novel: { icon: '📖', label: '小说', classLabels: ['novel'] },
  poetry: { icon: '🕊️', label: '诗歌', classLabels: ['poem'] },
  drama: { icon: '🎭', label: '戏剧', classLabels: ['play'] },
  tale: { icon: '🧚', label: '童话与短篇', classLabels: ['short story', 'fairy tale'] },
  epic: { icon: '📜', label: '史诗与神话', classLabels: ['epic poem', 'epic poetry'] },
  writer: { icon: '✍️', label: '作家', classLabels: [] },
}

// 职业（作家路）
const WRITER_OCC_LABELS = ['novelist', 'poet', 'playwright', 'essayist', 'writer']

const LABEL_SERVICE = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }'

function worksQuery(classLabel, limit = 1200) {
  return `SELECT DISTINCT ?item ?itemLabel ?img ?date WHERE {
    ?cls rdfs:label "${classLabel}"@en .
    ?item wdt:P31/wdt:P279* ?cls .
    ?item wdt:P18 ?img .
    OPTIONAL { ?item wdt:P577 ?date }
    ${LABEL_SERVICE}
  } LIMIT ${limit}`
}

function writersQuery(limit = 1200) {
  const occs = WRITER_OCC_LABELS.map((l) => `"${l}"@en`).join(', ')
  return `SELECT DISTINCT ?item ?itemLabel ?img ?birth WHERE {
    ?item wdt:P106 ?occ .
    ?occ rdfs:label ?occLabel .
    FILTER(?occLabel IN (${occs}))
    ?item wdt:P18 ?img .
    ?item wdt:P569 ?birth .
    FILTER(YEAR(?birth) < 1920)
    ${LABEL_SERVICE}
  } LIMIT ${limit}`
}

function eraOf(year) {
  if (year === null) return ''
  if (year < 476) return '古代'
  if (year < 1450) return '中世纪'
  if (year < 1600) return '文艺复兴'
  if (year < 1790) return '近代早期'
  if (year < 1830) return '浪漫主义'
  if (year < 1900) return '现实主义'
  if (year < 1945) return '现代'
  return '当代'
}

function mapWork(b, categoryId) {
  const cat = CATS[categoryId]
  const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
  const name = bv(b.itemLabel) || qid
  const year = yearOfTime(bv(b.date))
  const img = bv(b.img)
  return {
    id: `lit-wiki-${qid}`,
    hall: 'literature',
    categoryId,
    name,
    origin: '',
    era: eraOf(year),
    date: year == null ? '' : `${year}`,
    year: year ?? undefined,
    location: '',
    collection: 'Wikidata / Wikimedia Commons',
    dimensions: '',
    material: '',
    description: `${name}（${cat.label}）。公版文学作品。`,
    tags: [cat.label],
    icon: cat.icon,
    imageUrl: proxiedUrl(img, 600),
    imageLarge: proxiedUrl(img, 1200),
    source: 'Wikidata',
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
  }
}

function mapWriter(b) {
  const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
  const name = bv(b.itemLabel) || qid
  const year = yearOfTime(bv(b.birth))
  const img = bv(b.img)
  return {
    id: `lit-wiki-${qid}`,
    hall: 'literature',
    categoryId: 'writer',
    name,
    origin: '',
    era: eraOf(year),
    date: year == null ? '' : `${year}–`,
    year: undefined,
    location: '',
    collection: 'Wikidata / Wikimedia Commons',
    dimensions: '',
    material: '',
    description: `${name}（作家，${year ?? ''}— ）。`,
    tags: ['作家'],
    icon: '✍️',
    imageUrl: proxiedUrl(img, 600),
    imageLarge: proxiedUrl(img, 1200),
    source: 'Wikidata',
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
  }
}

async function main() {
  const existing = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  const names = new Set(existing.map((e) => e.name.toLowerCase()))
  const ids = new Set(existing.map((e) => e.id))
  const added = []
  let failed = 0

  for (const [categoryId, cat] of Object.entries(CATS)) {
    for (const cls of cat.classLabels) {
      try {
        const rows = await runSparql(worksQuery(cls))
        let n = 0
        for (const b of rows) {
          const item = mapWork(b, categoryId)
          if (ids.has(item.id)) continue
          if (names.has(item.name.toLowerCase())) continue
          ids.add(item.id)
          names.add(item.name.toLowerCase())
          added.push(item)
          n++
        }
        console.error(`  [${categoryId}] 体裁「${cls}」+${n}`)
      } catch (err) {
        failed++
        console.error(`  [${categoryId}] 体裁「${cls}」失败：${err.message}`)
      }
      await sleep(1500)
    }
  }

  // 作家
  try {
    const rows = await runSparql(writersQuery())
    let n = 0
    for (const b of rows) {
      const item = mapWriter(b)
      if (ids.has(item.id)) continue
      if (names.has(item.name.toLowerCase())) continue
      ids.add(item.id)
      names.add(item.name.toLowerCase())
      added.push(item)
      n++
    }
    console.error(`  [writer] 作家 +${n}`)
  } catch (err) {
    failed++
    console.error(`  [writer] 作家查询失败：${err.message}`)
  }

  const merged = [...added, ...existing]
  await writeFile(OUT_FILE, JSON.stringify(merged), 'utf8')
  const stat = {}
  for (const e of merged) stat[e.categoryId] = (stat[e.categoryId] || 0) + 1
  console.error(`\n✅ 文学馆合并完成：原有 ${existing.length} + 新增 ${added.length} = 合计 ${merged.length} 件`)
  console.error('  ' + Object.entries(stat).map(([k, v]) => `${k}=${v}`).join(', '))
  if (failed > 0) console.error(`  ⚠️ ${failed} 个查询失败`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
