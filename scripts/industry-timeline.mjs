// 工业馆「产业时间轴」数据准备（多模式，幂等可重跑）：
//   node scripts/industry-timeline.mjs sparql   —— SPARQL 批量回填 year（首选，400 件/次）
//   node scripts/industry-timeline.mjs years    —— wbgetentities 逐批回填（备选）
//   node scripts/industry-timeline.mjs classify —— 给每件展品打 industryId
//   node scripts/industry-timeline.mjs          —— sparql + classify
// 说明：本地 wikidata.org 当前可直连；分类映射与前端 src/data/industries.ts 保持一致。
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { industryOf, parseDateField } from './lib/industry-rules.mjs'

const FILE = new URL('../public/data/industry.json', import.meta.url)
const LOG = new URL('./industry-timeline.log', import.meta.url)
const log = (msg) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const UA = { 'User-Agent': 'museum-industry-backfill/1.0 (personal project)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 年份解析 ----------
function yearFromTime(tv) {
  if (!tv) return null
  const m = /^([+-])(\d{4,})-/.exec(tv)
  if (!m) return null
  const y = parseInt(m[2], 10)
  if (!Number.isFinite(y) || y > 2100) return null
  return m[1] === '-' ? -y : y
}

// Wikidata 日期属性优先级：P571 起源 > P1619 正式启用 > P580 开始 > P585 时点 > P577 发表 > P1249 最早记录 > P576 废止
const DATE_PROPS = ['P571', 'P1619', 'P580', 'P585', 'P577', 'P1249', 'P576']
const API = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids='

function yearFromClaims(claims) {
  if (!claims) return null
  for (const prop of DATE_PROPS) {
    const cs = claims[prop]
    if (!Array.isArray(cs)) continue
    let min = null
    for (const c of cs) {
      const v = c?.mainsnak?.datavalue?.value?.time
      const y = yearFromTime(v)
      if (y != null && (min == null || y < min)) min = y
    }
    if (min != null) return min
  }
  return null
}

// ---------- SPARQL 批量年份回填（比 wbgetentities 快且不易被限流） ----------
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'

async function sparqlYears() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  const need = items.filter((e) => e.year == null && /^industry-wiki-(Q\d+)$/.test(e.id))
  log(`SPARQL 年份查询：${need.length} 件待查`)
  const byId = new Map(need.map((e) => [e.id, e]))
  let filled = 0
  for (let i = 0; i < need.length; i += 400) {
    const chunk = need.slice(i, i + 400)
    const values = chunk.map((e) => 'wd:' + e.id.replace('industry-wiki-', '')).join(' ')
    const query = `SELECT ?item (MIN(?y) AS ?year) WHERE {
  VALUES ?item { ${values} }
  { ?item wdt:P571 ?d } UNION { ?item wdt:P1619 ?d } UNION { ?item wdt:P580 ?d }
  UNION { ?item wdt:P585 ?d } UNION { ?item wdt:P577 ?d } UNION { ?item wdt:P1249 ?d }
  UNION { ?item wdt:P576 ?d }
  BIND(YEAR(?d) AS ?y)
} GROUP BY ?item`
    let data = null
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      try {
        // POST 提交避免 URL 过长（HTTP 431）
        const res = await fetch(SPARQL_ENDPOINT, {
          method: 'POST',
          headers: {
            ...UA,
            Accept: 'application/sparql-results+json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ query, format: 'json' }).toString(),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      } catch (err) {
        const wait = 15000 * (attempt + 1)
        log(`  SPARQL 批 ${i / 400 + 1} 失败：${err.message}，等待 ${wait / 1000}s`)
        await sleep(wait)
      }
    }
    if (!data) {
      log(`  SPARQL 批 ${i / 400 + 1} 彻底失败，跳过`)
      continue
    }
    for (const row of data.results?.bindings || []) {
      const uri = row.item?.value || ''
      const qid = uri.split('/').pop()
      const item = byId.get('industry-wiki-' + qid)
      const y = row.year ? parseInt(row.year.value, 10) : null
      if (item && y != null && Number.isFinite(y)) {
        item.year = y
        if (!item.date) item.date = y < 0 ? `公元前 ${-y} 年` : `${y} 年`
        filled++
      }
    }
    log(`  SPARQL 进度 ${Math.min(i + 400, need.length)}/${need.length}，本轮补到 ${filled} 件`)
    await sleep(2000)
  }
  const withYear = items.filter((e) => e.year != null).length
  log(`SPARQL 年份查询完成：本轮补 ${filled} 件，总计 ${withYear}/${items.length} 有年份`)
  writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8')
}

// ---------- wbgetentities 逐批年份回填（备选） ----------
async function backfillYears() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  let have = 0
  let need = []
  for (const e of items) {
    if (e.year == null) {
      const y = parseDateField(e.date)
      if (y != null) e.year = y
    }
    if (e.year != null) have++
    else if (/^industry-wiki-(Q\d+)$/.test(e.id)) need.push(e)
  }
  log(`年份回填：现有 ${have}/${items.length}，待查 Wikidata ${need.length} 件`)

  const byId = new Map(need.map((e) => [e.id, e]))
  const qids = need.map((e) => e.id.replace('industry-wiki-', ''))
  let fetched = 0
  let filled = 0
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50)
    let data = null
    for (let attempt = 0; attempt < 5 && !data; attempt++) {
      try {
        const res = await fetch(API + batch.join('|'), { headers: UA })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      } catch (err) {
        const is429 = err.message.includes('429')
        const wait = is429 ? 20000 * (attempt + 1) : 2500 * (attempt + 1)
        log(`  批次 ${i / 50 + 1} 失败（第 ${attempt + 1} 次）：${err.message}，等待 ${wait / 1000}s`)
        await sleep(wait)
      }
    }
    if (!data) {
      log(`  批次 ${i / 50 + 1} 彻底失败，跳过（${batch.length} 件）`)
      continue
    }
    for (const [qid, ent] of Object.entries(data.entities || {})) {
      const item = byId.get('industry-wiki-' + qid)
      if (!item) continue
      const y = yearFromClaims(ent.claims)
      if (y != null) {
        item.year = y
        if (!item.date) item.date = y < 0 ? `公元前 ${-y} 年` : `${y} 年`
        filled++
      }
    }
    fetched += batch.length
    if ((i / 50) % 10 === 0 || i + 50 >= qids.length) {
      log(`  进度 ${Math.min(fetched, qids.length)}/${qids.length}，已补到年份 ${filled} 件`)
    }
    await sleep(1500)
  }
  log(`年份回填完成：总计 ${have + filled}/${items.length} 件有年份`)
  writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8')
  return { total: items.length, withYear: have + filled, filled }
}

// ---------- 从名称/描述提取显式年份（「built in 1888」类；标注为「约」） ----------
function regexYears() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  let filled = 0
  for (const e of items) {
    if (e.year != null) continue
    const text = [e.name, e.description, ...(e.tags || [])].join(' ')
    // 1500–2029 的四位年份，词边界排除型号长数字（如 P5200095）
    const m = /\b(1[5-9]\d{2}|20[0-2]\d)\b/.exec(text)
    if (m) {
      const y = parseInt(m[1], 10)
      e.year = y
      if (!e.date) e.date = `约 ${y} 年`
      filled++
    }
  }
  const withYear = items.filter((e) => e.year != null).length
  log(`文本年份提取：补 ${filled} 件，总计 ${withYear}/${items.length} 有年份`)
  writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8')
}

// ---------- 产业打标（顺带从 date 补齐 year，幂等） ----------
function classify() {
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  const stat = new Map()
  for (const e of items) {
    if (e.year == null) {
      const y = parseDateField(e.date)
      if (y != null) e.year = y
    }
    // 全量重算（规则已覆盖中英文关键词；seed 展品由关键词正确命中）
    const ind = industryOf(e)
    e.industryId = ind
    stat.set(ind, (stat.get(ind) || 0) + 1)
  }
  writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8')
  const lines = [...stat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`)
  log(`产业打标完成：\n${lines.join('\n')}`)
}

const mode = process.argv[2] || 'all'
if (mode === 'classify') {
  classify()
} else if (mode === 'sparql') {
  await sparqlYears()
} else if (mode === 'regex') {
  regexYears()
} else if (mode === 'years') {
  const r = await backfillYears()
  log(`DONE total=${r.total} withYear=${r.withYear}`)
} else {
  await sparqlYears()
  regexYears()
  classify()
  const items = JSON.parse(readFileSync(FILE, 'utf8'))
  log(`DONE total=${items.length} withYear=${items.filter((e) => e.year != null).length}`)
}
