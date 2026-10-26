/**
 * gen-specials.mjs — 生成三个特别展区的数据文件 + X1 去伪标记
 *
 * 输入:  public/data/{industry,art,antiquity}.json, manifest.json
 * 输出:  public/data/specials/
 *   industrial-revolution.json  工业革命主轴（19 件精品，四线）
 *   artists.json                艺术家长厅索引（解析 tags 中 "by X"）
 *   antiquity-timeline.json     古物年表（轻量条目，年份区间取中点）
 *   directory-flags.json        X1 去伪标记（目录型条目 id 清单）
 *
 * 运行: node scripts/gen-specials.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const OUT = join(DATA, 'specials')
mkdirSync(OUT, { recursive: true })

const load = f => JSON.parse(readFileSync(join(DATA, f), 'utf8'))
const values = j => (Array.isArray(j) ? j : Object.values(j))

/* ---------- 1. 工业革命主轴 ---------- */

const LANE_MAP = {
  'industry-curated-spinning-jenny': 'power',
  'industry-curated-watt-steam-engine': 'power',
  'industry-curated-faraday-generator': 'power',
  'industry-curated-bessemer-converter': 'power',
  'industry-curated-otto-engine': 'power',
  'industry-curated-edison-light-bulb': 'power',
  'industry-curated-tesla-coil': 'power',
  'industry-curated-rocket-locomotive': 'transport',
  'industry-curated-benz-patent-motorwagen': 'transport',
  'industry-curated-wright-flyer': 'transport',
  'industry-curated-ford-model-t': 'transport',
  'industry-curated-morse-telegraph': 'information',
  'industry-curated-bell-telephone': 'information',
  'industry-curated-edison-phonograph': 'information',
  'industry-curated-marconi-radio': 'information',
  'industry-curated-eniac': 'computing',
  'industry-curated-sputnik-1': 'computing',
  'industry-curated-apollo-guidance-computer': 'computing',
  'industry-curated-ibm-pc': 'computing',
}

const LANES = [
  { id: 'power', name: '动力与能源', color: '#c2571f', icon: '⚙️' },
  { id: 'transport', name: '交通与移动', color: '#1f6fc2', icon: '🚂' },
  { id: 'information', name: '信息与传播', color: '#7a1fb8', icon: '📡' },
  { id: 'computing', name: '计算与太空', color: '#0f8a5f', icon: '🛰️' },
]

const parseYear = label => {
  const m = String(label).match(/(\d{3,4})\s*年/)
  return m ? parseInt(m[1], 10) : null
}

function genIndustrialRevolution() {
  const industry = values(load('industry.json'))
  const curated = industry.filter(x => LANE_MAP[x.id])
  const lanes = LANES.map(l => ({
    ...l,
    nodes: curated
      .filter(x => LANE_MAP[x.id] === l.id)
      .map(x => ({
        id: x.id,
        name: x.name,
        year: parseYear(x.date),
        dateLabel: x.date,
        era: x.era,
        imageUrl: x.imageUrl,
      }))
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
  }))
  const total = lanes.reduce((s, l) => s + l.nodes.length, 0)
  const years = lanes.flatMap(l => l.nodes.map(n => n.year)).filter(Boolean)
  const out = {
    title: '革命主轴',
    subtitle: '1764–1981：四条线如何把世界拧成现代的样子',
    lanes,
    range: [Math.min(...years), Math.max(...years)],
  }
  writeFileSync(join(OUT, 'industrial-revolution.json'), JSON.stringify(out, null, 1))
  console.log(`industrial-revolution.json  ${total} nodes, ${lanes.length} lanes, ${years[0]}–${years.at(-1)}`)
  return total
}

/* ---------- 2. 艺术家长厅 ---------- */

const ARTIST_CN = {
  'Albrecht Dürer': '阿尔布雷希特·丢勒',
  'James Ensor': '詹姆斯·恩索尔',
  'Pietro Perugino': '彼得罗·佩鲁吉诺',
  'Diego Velázquez': '委拉斯开兹',
  'James Tissot': '雅姆·蒂索',
  Raphael: '拉斐尔',
  'Jacques-Louis David': '雅克-路易·大卫',
  'Katsushika Hokusai': '葛饰北斋',
  'Gustave Le Gray': '古斯塔夫·勒·格雷',
  'Francisco de Goya': '戈雅',
  Caravaggio: '卡拉瓦乔',
  'Edvard Munch': '蒙克',
  Rembrandt: '伦勃朗',
  'Vincent van Gogh': '梵高',
  'Sandro Botticelli': '波提切利',
  'Johannes Vermeer': '维米尔',
  'Peter Paul Rubens': '鲁本斯',
  'Claude Monet': '莫奈',
  'Paul Cézanne': '塞尚',
  Michelangelo: '米开朗基罗',
  'Pierre-Auguste Renoir': '雷诺阿',
  'Édouard Manet': '马奈',
}

function extractArtist(tags) {
  for (const t of tags || []) {
    const m = t.match(/by ([A-ZÀ-Þ][^,]+?)(?:,| from|, now| \(|$)/)
    if (m) return m[1].trim()
  }
  return null
}

function genArtists() {
  const art = values(load('art.json'))
  const map = new Map()
  for (const x of art) {
    const a = extractArtist(x.tags)
    if (!a) continue
    if (!map.has(a)) map.set(a, [])
    map.get(a).push({
      id: x.id,
      name: x.name,
      imageUrl: x.imageUrl,
    })
  }
  const artists = [...map.entries()]
    .filter(([, works]) => works.length >= 10)
    .map(([name, works]) => ({
      name,
      cn: ARTIST_CN[name] || null,
      count: works.length,
      works: works.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count)
  const out = {
    title: '艺术家长厅',
    subtitle: `藏品中 48 位作品超过 10 件的艺术家——每个人就是一间厅`,
    artists,
  }
  writeFileSync(join(OUT, 'artists.json'), JSON.stringify(out, null, 1))
  console.log(`artists.json  ${artists.length} artists, ${artists.reduce((s, a) => s + a.count, 0)} works`)
  return artists.length
}

/* ---------- 3. 古物年表 ---------- */

/** 解析混杂的中英日期，返回 {year, span} 或 null。B.C. 为负。区间取中点。 */
function parseAntiquityYear(raw) {
  if (!raw) return null
  const s = String(raw).replace(/,/g, '').replace(/\s+/g, ' ').trim()

  // 中文：约公元前 1323 年 / 公元前 196 年 / 约公元 1250–1500 年 / 公元 683 年
  let m = s.match(/(约)?公元前 (\d{1,4})(?:[–—-] ?(\d{1,4}))? 年/)
  if (m) {
    const a = -parseInt(m[2], 10)
    const b = m[3] ? -parseInt(m[3], 10) : a
    return { year: Math.round((a + b) / 2), span: a !== b }
  }
  m = s.match(/(约)?公元 (\d{1,4})(?:[–—-] ?(\d{1,4}))? 年/)
  if (m) {
    const a = parseInt(m[2], 10)
    const b = m[3] ? parseInt(m[3], 10) : a
    return { year: Math.round((a + b) / 2), span: a !== b }
  }
  // 中文世纪：约公元前 5 世纪 → 前 450 左右
  m = s.match(/公元前 (\d{1,2}) 世纪/)
  if (m) return { year: -(parseInt(m[1], 10) - 1) * 100 - 50, span: true }
  m = s.match(/公元 (\d{1,2}) 世纪/)
  if (m) return { year: (parseInt(m[1], 10) - 1) * 100 + 50, span: true }

  // 英文世纪：19th century / early 19th century / 8th–mid-16th century / 3rd century CE
  m = s.match(/(early |mid-|late )?(\d{1,2})(?:st|nd|rd|th)(?:[–—-](?:(early |mid-|late ))?(\d{1,2})(?:st|nd|rd|th))? century/i)
  if (m) {
    const pt = o => (o === 'early ' ? 12 : o === 'mid-' ? 50 : o === 'late ' ? 75 : 50)
    const c1 = parseInt(m[2], 10) - 1
    const y1 = c1 * 100 + pt(m[1])
    const c2 = m[4] ? parseInt(m[4], 10) - 1 : c1
    const y2 = m[4] ? c2 * 100 + pt(m[3]) : y1
    const year = Math.round((y1 + y2) / 2)
    return { year, span: y1 !== y2 }
  }

  // 英文：ca. 3100–2649 B.C. / ca. 1981–1640 B.C. / 270 B.C.–A.D. 320 / ca. 4500–4000 B.C.
  const nums = [...s.matchAll(/(\d{1,5})/g)].map(x => parseInt(x[1], 10))
  const isBC = /B\.?\s?C\.?/i.test(s)
  const hasAD = /A\.?\s?D\.?/i.test(s)
  if (nums.length && (isBC || hasAD)) {
    const mid = Math.round((nums[0] + nums[nums.length - 1]) / 2)
    // 混合区间（如 270 B.C.–A.D. 320）中 B.C. 部分应为负
    const year = isBC && !hasAD ? -mid : mid
    return { year, span: nums.length > 1 && nums[0] !== nums[nums.length - 1] }
  }
  return null
}

function genAntiquityTimeline() {
  const anti = values(load('antiquity.json'))
  const items = []
  let failed = 0
  for (const x of anti) {
    const p = parseAntiquityYear(x.date)
    if (!p) { failed++; continue }
    items.push({
      id: x.id,
      name: x.name,
      year: p.year,
      span: p.span,
      dateLabel: x.date,
      era: x.era || '',
      categoryId: x.categoryId,
      imageUrl: x.imageUrl,
    })
  }
  items.sort((a, b) => a.year - b.year)
  const out = { title: '年表长廊', subtitle: '3,000+ 件古物按年代排开：从史前到近代', items, failed }
  writeFileSync(join(OUT, 'antiquity-timeline.json'), JSON.stringify(out))
  const buckets = {}
  for (const it of items) {
    const k = it.year < 0 ? `前${Math.ceil(-it.year / 500) * 500}` : `${Math.floor(it.year / 100)}世纪`
    buckets[k] = (buckets[k] || 0) + 1
  }
  console.log(`antiquity-timeline.json  ${items.length} items (解析失败 ${failed}), earliest ${items[0]?.year}, latest ${items.at(-1)?.year}`)
  console.log('  分桶抽查:', Object.entries(buckets).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(', '))
  return items.length
}

/* ---------- 4. X1 去伪标记 ---------- */

function genDirectoryFlags() {
  const flags = { industry: [], art: [] }
  const industry = values(load('industry.json'))
  const RE_DIRECTORY = /streetlight|satellite|space probe|space observatory|cargo spacecraft|spacecraft manufactured|escort carrier|-class escort|train service|train in India|weather satellite|reconnaissance satellite/i
  for (const x of industry) {
    if ((x.tags || []).some(t => RE_DIRECTORY.test(t))) flags.industry.push(x.id)
  }
  const art = values(load('art.json'))
  for (const x of art) {
    if (/^Q\d+$/.test(x.name || '')) { flags.art.push(x.id); continue }
    if ((x.tags || []).some(t => /photograph by John Thomas/i.test(t))) flags.art.push(x.id)
  }
  writeFileSync(join(OUT, 'directory-flags.json'), JSON.stringify(flags))
  console.log(`directory-flags.json  industry: ${flags.industry.length}, art: ${flags.art.length}`)
  return flags
}

/* ---------- run ---------- */

const n1 = genIndustrialRevolution()
const n2 = genArtists()
const n3 = genAntiquityTimeline()
genDirectoryFlags()
console.log(`\nOK  ${n1} + ${n2} + ${n3}`)
