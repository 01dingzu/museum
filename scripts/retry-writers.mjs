// retry-writers.mjs — 文学馆作家批量采集重试（collect-literature-wd 的作家查询 504 超时）
// 拆成单个职业小查询，逐个跑；幂等（按 id/名称去重）
// 用法：node scripts/retry-writers.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'literature.json')
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = { 'User-Agent': 'museum-collector/1.0 (educational, non-commercial research)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bv = (b) => b?.value || ''
const yearOfTime = (tv) => {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(tv)
  if (!m) return null
  return m[1] === '-' ? -parseInt(m[2], 10) : parseInt(m[2], 10)
}

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
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        await sleep(10000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(8000 * (i + 1))
    }
  }
  return []
}

const OCCS = ['novelist', 'poet', 'playwright', 'essayist']

function writersQuery(occ, limit = 450) {
  return `SELECT DISTINCT ?item ?itemLabel ?img ?birth WHERE {
    ?item wdt:P106 ?occ .
    ?occ rdfs:label "${occ}"@en .
    ?item wdt:P18 ?img .
    ?item wdt:P569 ?birth .
    FILTER(YEAR(?birth) < 1920)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
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

async function main() {
  const existing = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  const names = new Set(existing.map((e) => e.name.toLowerCase()))
  const ids = new Set(existing.map((e) => e.id))
  let added = 0

  for (const occ of OCCS) {
    try {
      const rows = await runSparql(writersQuery(occ))
      let n = 0
      for (const b of rows) {
        const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
        const id = `lit-wiki-${qid}`
        if (ids.has(id)) continue
        const name = bv(b.itemLabel) || qid
        if (names.has(name.toLowerCase())) continue
        const year = yearOfTime(bv(b.birth))
        const img = bv(b.img)
        if (!img) continue
        existing.push({
          id,
          hall: 'literature',
          categoryId: 'writer',
          name,
          origin: '',
          era: eraOf(year),
          date: year == null ? '' : `${year}–`,
          location: '',
          collection: 'Wikidata / Wikimedia Commons',
          dimensions: '',
          material: '',
          description: `${name}（作家，${year ?? '?'}— ）。`,
          tags: ['作家', occ],
          icon: '✍️',
          imageUrl: proxiedUrl(img, 600),
          imageLarge: proxiedUrl(img, 1200),
          source: 'Wikidata',
          sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        })
        ids.add(id)
        names.add(name.toLowerCase())
        n++
      }
      console.error(`  [${occ}] +${n}`)
      added += n
    } catch (err) {
      console.error(`  [${occ}] 失败：${err.message}`)
    }
    await sleep(2000)
  }

  await writeFile(OUT_FILE, JSON.stringify(existing), 'utf8')
  console.error(`✅ 作家重试完成：新增 ${added}，文学馆合计 ${existing.length} 件`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
