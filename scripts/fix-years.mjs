// fix-years.mjs — 修复 yearOfTime 正则 bug 造成的三馆年份缺失
// bug：旧正则 /^([+-])(\d{4,})-/ 要求符号前缀，SPARQL JSON 返回 "1850-01-01T..." 无符号 → 全部解析失败。
// 本脚本对 music / literature / anime 三馆的 Q-id 展品批量查 (P577|P571|P585|P580) 并回填 year/date/era。
// 用法：node scripts/fix-years.mjs [music|literature|anime|all]

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = { 'User-Agent': 'museum-year-fixer/1.0 (personal project)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 修复后的正则：符号可选
function yearOfTime(tv) {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(String(tv))
  if (!m) return null
  const y = parseInt(m[2], 10)
  return m[1] === '-' ? -y : y
}

async function runSparql(query, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(SPARQL, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
        body: query,
      })
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503) {
        await sleep(6000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(4000 * (i + 1))
    }
  }
  return []
}

const bv = (b) => b?.value || ''

function musicEraOf(y) {
  if (y == null) return ''
  if (y < 1500) return '古代与中世纪'
  if (y < 1600) return '文艺复兴'
  if (y < 1750) return '巴洛克'
  if (y < 1820) return '古典主义'
  if (y < 1900) return '浪漫主义'
  if (y < 1950) return '近现代'
  return '当代'
}

function litEraOf(y) {
  if (y == null) return ''
  if (y < 476) return '古代'
  if (y < 1450) return '中世纪'
  if (y < 1600) return '文艺复兴'
  if (y < 1790) return '近代早期'
  if (y < 1830) return '浪漫主义'
  if (y < 1900) return '现实主义'
  if (y < 1945) return '现代'
  return '当代'
}

function animeEraOf(y) {
  if (y == null) return ''
  if (y < 0) return '古代'
  if (y < 1868) return '近世'
  if (y < 1946) return '近代'
  return '现代'
}

// 各馆配置：文件、Q-id 正则、era 函数
const HALLS = {
  music: {
    file: path.join(__dirname, '..', 'public', 'data', 'music.json'),
    qidRe: /^music-(wiki|score)-Q\d+$/,
    qidOf: (id) => id.replace(/^music-(wiki|score)-/, ''),
    eraOf: musicEraOf,
  },
  literature: {
    file: path.join(__dirname, '..', 'public', 'data', 'literature.json'),
    qidRe: /^lit-wiki-Q\d+$/,
    qidOf: (id) => id.replace(/^lit-wiki-/, ''),
    eraOf: litEraOf,
  },
  anime: {
    file: path.join(__dirname, '..', 'public', 'data', 'anime.json'),
    qidRe: /^anime-wiki-Q\d+$/,
    qidOf: (id) => id.replace(/^anime-wiki-/, ''),
    eraOf: animeEraOf,
  },
}

async function fixHall(hallId) {
  const cfg = HALLS[hallId]
  const items = JSON.parse(readFileSync(cfg.file, 'utf8'))
  const targets = items.filter((e) => cfg.qidRe.test(e.id) && e.year == null)
  console.error(`[${hallId}] 待修复年份：${targets.length} 件`)
  let filled = 0

  const BATCH = 400
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const values = batch.map((e) => `wd:${cfg.qidOf(e.id)}`).join(' ')
    const query = `SELECT ?item ?date WHERE { VALUES ?item { ${values} } ?item (wdt:P577|wdt:P571|wdt:P585|wdt:P580) ?date . }`
    let rows = []
    try {
      rows = await runSparql(query)
    } catch (err) {
      console.error(`  批次 ${i / BATCH + 1} 失败：${err.message}`)
      continue
    }
    const byQid = new Map()
    for (const b of rows) {
      const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
      const y = yearOfTime(bv(b.date))
      if (y == null) continue
      if (!byQid.has(qid) || y < byQid.get(qid)) byQid.set(qid, y)
    }
    for (const e of batch) {
      const y = byQid.get(cfg.qidOf(e.id))
      if (y == null) continue
      e.year = y
      e.date = y < 0 ? `公元前 ${-y}` : `${y}`
      e.era = cfg.eraOf(y)
      filled++
    }
    console.error(`  批次 ${i / BATCH + 1}/${Math.ceil(targets.length / BATCH)}：本批 ${byQid.size} 件（累计 ${filled}）`)
    await sleep(1500)
  }

  writeFileSync(cfg.file, JSON.stringify(items), 'utf8')
  console.error(`[${hallId}] ✅ 修复 ${filled}/${targets.length} 件，总计 ${items.filter((e) => e.year != null).length} 件有年份`)
}

const which = process.argv[2] || 'all'
const halls = which === 'all' ? ['music', 'literature', 'anime'] : [which]
for (const h of halls) {
  await fixHall(h)
}
