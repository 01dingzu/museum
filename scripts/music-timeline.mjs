// music-timeline.mjs — 音乐乐器馆：乐谱展品采集 + 年份回填 + 时间轴标签
//
// 两个模式：
//   node scripts/music-timeline.mjs scores   采集公版乐谱展品（Wikidata 有 P18 的音乐作品）
//   node scripts/music-timeline.mjs years    给现有乐器展品回填 P571（发明/问世年份）
//   node scripts/music-timeline.mjs          两个都跑
//
// 输出：public/data/music.json（原地合并，按 id 去重）

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'public', 'data', 'music.json')
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = { 'User-Agent': 'museum-music-backfill/1.0 (personal project)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

const bv = (b) => b?.value || ''
const yearOfTime = (tv) => {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(tv)
  if (!m) return null
  const y = parseInt(m[2], 10)
  return m[1] === '-' ? -y : y
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

// 音乐时代（与 src/data/musicLanes.ts 保持一致）
export function musicEraOf(year) {
  if (year == null) return ''
  if (year < 1500) return '古代与中世纪'
  if (year < 1600) return '文艺复兴'
  if (year < 1750) return '巴洛克'
  if (year < 1820) return '古典主义'
  if (year < 1900) return '浪漫主义'
  if (year < 1950) return '近现代'
  return '当代'
}

// ================= 乐谱采集 =================
// 有 P18 的音乐作品（标题页/首页乐谱扫描，P18 必为 Commons 公版资源）。
// 版权约束：只收「作曲家逝世于 1936 年前」的作品（life+70 已过保护期，公版乐谱）；
// 知名度约束：sitelinks > 5（过滤长尾条目）。
// 体裁根类用 label 匹配（musical work；musical composition 的 label 无命中）。
function scoresQuery(classLabel, limit = 900) {
  return `SELECT DISTINCT ?item ?itemLabel ?img ?date ?composerLabel WHERE {
    ?cls rdfs:label "${classLabel}"@en .
    ?item wdt:P31/wdt:P279* ?cls .
    ?item wdt:P18 ?img .
    ?item wdt:P86 ?composer .
    ?composer wdt:P570 ?death .
    FILTER(YEAR(?death) < 1936)
    ?composer rdfs:label ?composerLabel . FILTER(LANG(?composerLabel) = "en")
    ?item wikibase:sitelinks ?sl .
    FILTER(?sl > 5)
    OPTIONAL { ?item wdt:P577 ?date }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
  } LIMIT ${limit}`
}

async function collectScores() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  // 清掉上一轮误采的现代歌曲（作曲家未过保护期的 music-score-* 条目），幂等重采
  const before = items.length
  const cleaned = items.filter((e) => !/^music-score-Q/.test(e.id))
  if (cleaned.length !== before) {
    log(`清除误采乐谱条目 ${before - cleaned.length} 件（公版约束重采）`)
    items.length = 0
    items.push(...cleaned)
  }
  const ids = new Set(items.map((e) => e.id))
  let added = 0

  for (const cls of ['musical work']) {
    let rows = []
    try {
      rows = await runSparql(scoresQuery(cls))
    } catch (err) {
      log(`体裁「${cls}」查询失败：${err.message}`)
      continue
    }
    for (const b of rows) {
      const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
      const id = `music-score-${qid}`
      if (ids.has(id)) continue
      const name = bv(b.itemLabel) || qid
      const year = yearOfTime(bv(b.date))
      const img = bv(b.img)
      if (!img) continue
      const composer = bv(b.composerLabel)
      const desc = composer
        ? `《${name}》——${composer} 的音乐作品。图为公版乐谱影像（标题页或首页）。`
        : `《${name}》。图为公版乐谱影像（标题页或首页）。`
      items.push({
        id,
        hall: 'music',
        categoryId: 'scores',
        name,
        origin: composer || '',
        era: musicEraOf(year),
        date: year == null ? '' : `${year}`,
        year: year ?? undefined,
        location: '',
        collection: 'Wikidata / Wikimedia Commons',
        dimensions: '',
        material: '',
        description: desc,
        tags: ['乐谱', '音乐作品', composer].filter(Boolean),
        icon: '🎼',
        imageUrl: proxiedUrl(img, 600),
        imageLarge: proxiedUrl(img, 1200),
        source: 'Wikidata',
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      })
      ids.add(id)
      added++
    }
    log(`体裁「${cls}」命中 ${rows.length}，新增 ${added}`)
    await sleep(1500)
  }

  writeFileSync(FILE, JSON.stringify(items), 'utf8')
  log(`乐谱采集完成：${items.length - added} + ${added} = ${items.length} 件`)
}

// ================= 年份回填 =================
// 现有 music-wiki-Q* 展品批量查 P571（inception：发明/问世时间）
async function backfillYears() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  const targets = items.filter(
    (e) => /^music-wiki-Q\d+$/.test(e.id) && e.year == null,
  )
  log(`待回填年份：${targets.length} 件`)
  const qidOf = (e) => e.id.replace('music-wiki-', '')
  let filled = 0

  const BATCH = 400
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const values = batch.map((e) => `wd:${qidOf(e)}`).join(' ')
    const query = `SELECT ?item ?date WHERE {
      VALUES ?item { ${values} }
      ?item (wdt:P571|wdt:P580|wdt:P577|wdt:P585) ?date .
    }`
    let rows = []
    try {
      rows = await runSparql(query)
    } catch (err) {
      log(`批次 ${i / BATCH + 1} 失败：${err.message}`)
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
      const y = byQid.get(qidOf(e))
      if (y == null) continue
      e.year = y
      e.date = y < 0 ? `公元前 ${-y}` : `${y}`
      e.era = musicEraOf(y)
      filled++
    }
    log(`批次 ${i / BATCH + 1}/${Math.ceil(targets.length / BATCH)}：回填 ${byQid.size} 件（累计 ${filled}）`)
    await sleep(1200)
  }

  writeFileSync(FILE, JSON.stringify(items), 'utf8')
  log(`年份回填完成：${filled}/${targets.length} 件获得年份`)
}

// ================= 主流程 =================
const mode = process.argv[2] || 'all'
if (mode === 'scores') {
  await collectScores()
} else if (mode === 'years') {
  await backfillYears()
} else {
  await collectScores()
  await backfillYears()
}
log('DONE')
