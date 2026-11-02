// enrich-industry.mjs — 补采工业馆「产业时间轴」薄弱泳道的里程碑概念展品
// 背景：现有 4,047 件以博物馆实物为主，纺织(3)/冶金(3) 泳道太空；
// 本脚本用 Wikidata 搜索定位经典机器概念（珍妮纺纱机、搅炼法、平炉……），
// 取 P571 年份 + P18 图片，与现有展品合并去重。
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const FILE = new URL('../public/data/industry.json', import.meta.url)
const LOG = new URL('./industry-timeline.log', import.meta.url)
const log = (msg) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] [enrich] ${msg}`
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const UA = { 'User-Agent': 'museum-industry-backfill/1.0 (personal project)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 种子清单：search = Wikidata 搜索词；year = P571 缺失时的兜底年份
const SEEDS = [
  // ---- 纺织产业 ----
  { slug: 'flying-shuttle', search: 'flying shuttle', zh: '飞梭', year: 1733, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '约翰·凯伊发明飞梭，一名织工即可完成投梭，织布效率翻倍，被视为纺织机械化的先声。',
    tags: ['飞梭', '织布', '凯伊'] },
  { slug: 'spinning-jenny', search: 'spinning jenny', zh: '珍妮纺纱机', year: 1764, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '哈格里夫斯发明的多锭手摇纺纱机，一人可同时纺八根纱，普遍被视为工业革命的开端。',
    tags: ['纺纱机', '哈格里夫斯', '工业革命起点'] },
  { slug: 'water-frame', search: 'water frame', zh: '水力纺纱机', year: 1769, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '阿克莱特发明的水力驱动纺纱机，需要集中厂房与工人协作，直接催生了近代工厂制度。',
    tags: ['水力纺纱', '阿克莱特', '工厂制度'] },
  { slug: 'spinning-mule', search: 'spinning mule', zh: '走锭纺纱机', year: 1779, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '克朗普顿融合珍妮机与水力机之长的骡机，纺出既细又韧的棉纱，称雄十九世纪纱厂。',
    tags: ['走锭纺纱', '克朗普顿'] },
  { slug: 'power-loom', search: 'power loom', zh: '动力织机', year: 1785, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '卡特赖特发明的动力织机，使织布环节彻底机械化，纺织业成为第一个完整工业化的产业。',
    tags: ['动力织机', '卡特赖特'] },
  { slug: 'cotton-gin', search: 'cotton gin', zh: '轧棉机', year: 1793, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '惠特尼发明的锯齿轧棉机，将轧棉效率提升数十倍，重塑全球棉花经济与产业链。',
    tags: ['轧棉机', '惠特尼', '棉花经济'] },
  { slug: 'jacquard-loom', search: 'Jacquard loom', zh: '提花织机', year: 1804, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '贾卡发明的打孔卡控制提花机，可自动织出复杂图案——打孔卡编程思想直接启发了早期计算机。',
    tags: ['提花机', '贾卡', '打孔卡'] },
  { slug: 'sewing-machine', search: 'sewing machine', zh: '缝纫机', year: 1846, industry: 'textile', icon: '🧵', cat: 'industrial-revolution',
    desc: '从豪的专利到胜家的脚踏缝纫机，成衣生产走向大众化，家庭缝纫也随之普及。',
    tags: ['缝纫机', '胜家', '成衣'] },

  // ---- 钢铁与冶金 ----
  { slug: 'blast-furnace', search: 'blast furnace', zh: '高炉', year: 1709, industry: 'metallurgy', icon: '🔩', cat: 'industrial-revolution',
    desc: '达比以焦炭替代木炭鼓风炼铁，突破燃料瓶颈；高炉连续作业至今仍是炼铁的心脏。',
    tags: ['高炉', '焦炭炼铁', '达比'] },
  { slug: 'crucible-steel', search: 'crucible steel', zh: '坩埚钢', year: 1740, industry: 'metallurgy', icon: '🔩', cat: 'industrial-revolution',
    desc: '亨茨曼发明坩埚炼钢法，首次稳定获得均匀的优质钢材，供钟表与刀具业使用。',
    tags: ['坩埚钢', '亨茨曼'] },
  { slug: 'puddling-furnace', search: 'puddling furnace', zh: '搅炼炉', year: 1784, industry: 'metallurgy', icon: '🔩', cat: 'industrial-revolution',
    desc: '科特发明的反射炉搅炼法，用搅动氧化除去生铁中的碳，大规模生产可锻熟铁。',
    tags: ['搅炼法', '科特', '熟铁'] },
  { slug: 'bessemer-process', search: 'Bessemer process', zh: '贝塞麦炼钢法', year: 1856, industry: 'metallurgy', icon: '🔩', cat: 'power-machinery',
    desc: '贝塞麦转炉以空气吹炼铁水，几分钟炼出一炉钢，钢价暴跌，钢轨与钢船时代到来。',
    tags: ['转炉炼钢', '贝塞麦'] },
  { slug: 'open-hearth-furnace', search: 'open hearth furnace', zh: '平炉', year: 1868, industry: 'metallurgy', icon: '🔩', cat: 'power-machinery',
    desc: '西门子—马丁平炉可熔炼废钢与生铁，钢质均匀可控，统治二十世纪上半叶的炼钢业。',
    tags: ['平炉', '西门子', '马丁'] },
  { slug: 'electric-arc-furnace', search: 'electric arc furnace', zh: '电弧炉', year: 1903, industry: 'metallurgy', icon: '🔩', cat: 'energy-electric',
    desc: '电弧炉以石墨电极电弧熔化废钢，是电炉炼钢与现代特种钢冶炼的核心设备。',
    tags: ['电弧炉', '电炉炼钢', '废钢'] },
  { slug: 'basic-oxygen-furnace', search: 'basic oxygen steelmaking', zh: '氧气顶吹转炉', year: 1952, industry: 'metallurgy', icon: '🔩', cat: 'power-machinery',
    desc: '林茨—多纳维茨法（LD 转炉）用纯氧顶吹替代空气，炼钢更快更净，成为现代主流炼钢工艺。',
    tags: ['LD 转炉', '氧气炼钢'] },
]

function proxiedUrl(filename, width) {
  const safe = String(filename).replace(/ /g, '_')
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(safe)}?width=${width}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
}

async function searchEntity(term) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=3&language=en&search=' +
    encodeURIComponent(term)
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.search?.[0]?.id || null
}

function yearFromClaims(claims) {
  const cs = claims?.P571
  if (!Array.isArray(cs)) return null
  let min = null
  for (const c of cs) {
    const tv = c?.mainsnak?.datavalue?.value?.time
    const m = tv && /^([+-])(\d{4,})-/.exec(tv)
    if (m) {
      const y = parseInt(m[2], 10)
      const v = m[1] === '-' ? -y : y
      if (min == null || v < min) min = v
    }
  }
  return min
}

function imageFromClaims(claims) {
  const cs = claims?.P18
  if (!Array.isArray(cs)) return null
  const v = cs[0]?.mainsnak?.datavalue?.value
  return v || null
}

// ---- 主流程 ----
const items = JSON.parse(readFileSync(FILE, 'utf8'))
const existingNames = new Set(items.map((e) => e.name))
const existingIds = new Set(items.map((e) => e.id))

// 1) 搜索定位 Q-id
const qids = []
for (const s of SEEDS) {
  if (existingIds.has(`industry-seed-${s.slug}`)) {
    log(`跳过（已存在）：${s.zh}`)
    qids.push(null)
    continue
  }
  let qid = null
  for (let attempt = 0; attempt < 3 && !qid; attempt++) {
    try {
      qid = await searchEntity(s.search)
    } catch (err) {
      log(`  搜索「${s.search}」失败：${err.message}，重试`)
      await sleep(5000 * (attempt + 1))
    }
  }
  log(`搜索「${s.search}」→ ${qid ?? '未命中'}（${s.zh}）`)
  qids.push(qid)
  await sleep(700)
}

// 2) 批量取 claims
const wanted = qids.filter(Boolean)
const claimsMap = new Map()
for (let i = 0; i < wanted.length; i += 40) {
  const batch = wanted.slice(i, i + 40)
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' +
    batch.join('|')
  let data = null
  for (let attempt = 0; attempt < 3 && !data; attempt++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch (err) {
      log(`  实体批 ${i / 40 + 1} 失败：${err.message}，重试`)
      await sleep(5000 * (attempt + 1))
    }
  }
  if (data) {
    for (const [qid, ent] of Object.entries(data.entities || {})) {
      claimsMap.set(qid, ent.claims || {})
    }
  }
  await sleep(800)
}

// 3) 组装展品
let added = 0
for (const [idx, s] of SEEDS.entries()) {
  const qid = qids[idx]
  const id = `industry-seed-${s.slug}`
  if (existingIds.has(id)) continue
  if (existingNames.has(s.zh)) {
    log(`跳过（重名）：${s.zh}`)
    continue
  }
  const claims = qid ? claimsMap.get(qid) : null
  const year = (claims && yearFromClaims(claims)) ?? s.year
  const img = (claims && imageFromClaims(claims)) || null
  const item = {
    id,
    hall: 'industry',
    categoryId: s.cat,
    industryId: s.industry,
    name: s.zh,
    origin: '',
    era: '',
    date: year < 0 ? `公元前 ${-year} 年` : `${year} 年`,
    year,
    location: '',
    collection: 'Wikidata / Wikimedia Commons',
    description: s.desc,
    tags: s.tags,
    icon: s.icon,
    imageUrl: img ? proxiedUrl(img, 600) : undefined,
    imageLarge: img ? proxiedUrl(img, 1200) : undefined,
    source: 'Wikidata',
    sourceUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : undefined,
  }
  if (!img) {
    log(`  ⚠️ ${s.zh} 无 P18 图片（qid=${qid}）`)
    delete item.imageUrl
    delete item.imageLarge
    delete item.sourceUrl
  }
  items.push(item)
  existingIds.add(id)
  added++
  log(`  + ${s.zh}（${year} 年，${img ? '有图' : '无图'}）`)
}

writeFileSync(FILE, JSON.stringify(items, null, 2) + '\n', 'utf8')
log(`补采完成：新增 ${added} 件，工业馆总计 ${items.length} 件`)
