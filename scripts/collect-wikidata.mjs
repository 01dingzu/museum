// collect-wikidata.mjs — 采集维基数据（Wikidata）自然史/科技/金融条目（免 key）
// 用法：
//   node scripts/collect-wikidata.mjs --hall nature [--limit N]   # 自然科学馆
//   node scripts/collect-wikidata.mjs --hall industry [--limit N] # 工业科学馆
//   node scripts/collect-wikidata.mjs --hall finance [--limit N]  # 金融博物馆
//   node scripts/collect-wikidata.mjs --hall art [--limit N]      # 美术馆
//   node scripts/collect-wikidata.mjs --hall music [--limit N]    # 音乐乐器馆
//
// 数据源：https://query.wikidata.org/sparql （CC0 结构化数据 + Wikimedia Commons 图片）
// 输出：public/data/{hall}.json
//
// 注意：Wikidata 查询用「小分类单元」避免传递闭包超时（动物界/植物界整体会 60s 超时）。

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const SPARQL = 'https://query.wikidata.org/sparql'
const UA = 'museum-collector/1.0 (educational, non-commercial research)'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Wikimedia thumb 直链：上传到 upload.wikimedia.org，路径 hash 用 SHA-1
// 绕开 Special:FilePath 302 跳转，并强制指定 width 缩略图
// 规则：对「空格变下划线」的 filename 做 SHA-1，取 hash[0] 和 hash[0:2] 作为目录
function sha1Hex(s) { return crypto.createHash('sha1').update(s).digest('hex') }
function thumbUrl(filename, width) {
  const safe = filename.replace(/ /g, '_')
  const h = sha1Hex(safe)
  const enc = encodeURIComponent(safe)
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.substring(0, 2)}/${enc}/${width}px-${enc}`
}

function imageUrl(raw, width) {
  if (!raw) return ''
  // 已是 URL：取 pathname 后的 filename，构造直链
  // 是字符串（File: 后面的标题）：直接当 filename 用
  let filename
  if (raw.startsWith('http')) {
    try {
      const u = new URL(raw)
      // Special:FilePath/XXX?width=NNN → 提取 XXX
      const m = u.pathname.match(/Special:FilePath\/(.+)/)
      filename = m ? decodeURIComponent(m[1]) : decodeURIComponent(u.pathname.split('/').pop() || '')
    } catch (e) {
      return ''
    }
  } else {
    filename = raw
  }
  if (!filename) return ''
  return thumbUrl(filename, width)
}

// 类别名 → 一组查询（每条一个 where + limit）
const NATURE = {
  paleontology: {
    icon: '🦖',
    queries: [
      { where: '?item wdt:P171* wd:Q430 . ?item wdt:P105 wd:Q7432 .', limit: 800 }, // 恐龙种
      { where: '?item wdt:P171* wd:Q36715 . ?item wdt:P18 ?image0 .', limit: 120 }, // 猛犸/史前象
      { where: '?item wdt:P171* wd:Q179204 . ?item wdt:P105 wd:Q7432 .', limit: 300 }, // 翼龙
      { where: '?item wdt:P171* wd:Q269195 . ?item wdt:P105 wd:Q7432 .', limit: 250 }, // 蛇颈龙
    ],
  },
  'minerals-gems': {
    icon: '💎',
    queries: [{ where: '?item wdt:P279* wd:Q7946 .', limit: 600 }], // 矿物（子类）
  },
  meteorites: {
    icon: '☄️',
    queries: [{ where: '?item wdt:P31 wd:Q60186 .', limit: 300 }], // 陨石
  },
  botany: {
    icon: '🌿',
    queries: [
      { where: '?item wdt:P171* wd:Q25308 . ?item wdt:P105 wd:Q7432 .', limit: 400 }, // 兰科
      { where: '?item wdt:P171* wd:Q14560 . ?item wdt:P105 wd:Q7432 .', limit: 200 }, // 仙人掌科
      { where: '?item wdt:P171* wd:Q34687 . ?item wdt:P105 wd:Q7432 .', limit: 200 }, // 蔷薇科
    ],
  },
  zoology: {
    icon: '🦋',
    queries: [
      { where: '?item wdt:P171* wd:Q7377 . ?item wdt:P105 wd:Q7432 .', limit: 700 }, // 哺乳动物
      { where: '?item wdt:P171* wd:Q5113 . ?item wdt:P105 wd:Q7432 .', limit: 700 }, // 鸟类
      { where: '?item wdt:P171* wd:Q10811 . ?item wdt:P105 wd:Q7432 .', limit: 400 }, // 爬行动物
      { where: '?item wdt:P171* wd:Q152 . ?item wdt:P105 wd:Q7432 .', limit: 400 }, // 鱼类
      { where: '?item wdt:P171* wd:Q10908 . ?item wdt:P105 wd:Q7432 .', limit: 400 }, // 两栖动物
    ],
  },
  insects: {
    icon: '🐛',
    // 膜翅目/双翅目物种量适中，目级闭包可稳定跑通；
    // 鳞翅目/鞘翅目物种 30 万+，目级闭包会 504 超时，拆到科级采集
    queries: [
      { where: '?item wdt:P171* wd:Q22651 . ?item wdt:P105 wd:Q7432 .', limit: 500 }, // 膜翅目（蜂/蚁）
      { where: '?item wdt:P171* wd:Q25312 . ?item wdt:P105 wd:Q7432 .', limit: 500 }, // 双翅目（蚊/蝇）
      { where: '?item wdt:P171* wd:Q59905 . ?item wdt:P105 wd:Q7432 .', limit: 300 }, // 凤蝶科
      { where: '?item wdt:P171* wd:Q156449 . ?item wdt:P105 wd:Q7432 .', limit: 300 }, // 蛱蝶科
      { where: '?item wdt:P171* wd:Q41559 . ?item wdt:P105 wd:Q7432 .', limit: 200 }, // 粉蝶科
      { where: '?item wdt:P171* wd:Q25327 . ?item wdt:P105 wd:Q7432 .', limit: 300 }, // 瓢虫科
      { where: '?item wdt:P171* wd:Q208786 . ?item wdt:P105 wd:Q7432 .', limit: 200 }, // 锹形虫科
    ],
  },
  'marine-invertebrates': {
    icon: '🐚',
    queries: [
      { where: '?item wdt:P171* wd:Q25326 . ?item wdt:P105 wd:Q7432 .', limit: 400 }, // 软体动物
      { where: '?item wdt:P171* wd:Q44631 . ?item wdt:P105 wd:Q7432 .', limit: 250 }, // 棘皮动物
      { where: '?item wdt:P171* wd:Q25364 . ?item wdt:P105 wd:Q7432 .', limit: 250 }, // 甲壳动物
    ],
  },
  anthropology: {
    icon: '🦴',
    queries: [
      { where: '?item wdt:P171* wd:Q171283 . ?item wdt:P18 ?image0 .', limit: 60 }, // 人属 Homo
      { where: '?item wdt:P171* wd:Q103237 . ?item wdt:P18 ?image0 .', limit: 60 }, // 南方古猿属 Australopithecus
    ],
  },
}

const INDUSTRY = {
  'industrial-revolution': {
    icon: '🏭',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q12760 .', limit: 250 }], // 蒸汽机
  },
  'power-machinery': {
    icon: '⚙️',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q44167 .', limit: 400 }], // 发动机
  },
  transport: {
    icon: '🚂',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q1420 .', limit: 300 }, // 汽车
      { where: '?item wdt:P31/wdt:P279* wd:Q11436 .', limit: 250 }, // 飞机
      { where: '?item wdt:P31/wdt:P279* wd:Q11446 .', limit: 200 }, // 船舶
      { where: '?item wdt:P31/wdt:P279* wd:Q870 .', limit: 200 }, // 火车
      { where: '?item wdt:P31/wdt:P279* wd:Q11442 .', limit: 150 }, // 自行车
    ],
  },
  communication: {
    icon: '📡',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q11035 .', limit: 150 }, // 电话
      { where: '?item wdt:P31/wdt:P279* wd:Q159391 .', limit: 150 }, // 无线电接收机
    ],
  },
  'energy-electric': {
    icon: '⚡',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q131502 .', limit: 250 }, // 发电机
      { where: '?item wdt:P31/wdt:P279* wd:Q267298 .', limit: 250 }, // 电池
      { where: '?item wdt:P31/wdt:P279* wd:Q1138737 .', limit: 200 }, // 电灯
      { where: '?item wdt:P31/wdt:P279* wd:Q72313 .', limit: 50 }, // 电动机
    ],
  },
  'computing-space': {
    icon: '🚀',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q40218 .', limit: 300 }, // 航天器
      { where: '?item wdt:P31/wdt:P279* wd:Q68 .', limit: 300 }, // 计算机
    ],
  },
  robotics: {
    icon: '🤖',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q11012 .', limit: 400 }], // 机器人
  },
  timekeeping: {
    icon: '🕰️',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q376 .', limit: 800 }], // 钟表
  },
  optics: {
    icon: '🔭',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q4213 .', limit: 400 }, // 望远镜
      { where: '?item wdt:P31/wdt:P279* wd:Q196538 .', limit: 100 }, // 显微镜
      { where: '?item wdt:P31/wdt:P279* wd:Q15328 .', limit: 130 }, // 相机
    ],
  },
}

const FINANCE = {
  'ancient-coins': {
    icon: '🪙',
    queries: [
      { where: '?item wdt:P31 wd:Q41207 .', limit: 500 }, // 硬币（实例）
      { where: '?item wdt:P31/wdt:P279* wd:Q41207 .', limit: 500 }, // 硬币（子类）
    ],
  },
  currency: {
    icon: '💰',
    queries: [{ where: '?item wdt:P31 wd:Q8142 .', limit: 500 }], // 货币/通货
  },
  banknotes: {
    icon: '💵',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q47433 .', limit: 300 }], // 纸币
  },
  'medals-orders': {
    icon: '🏅',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q193622 .', limit: 500 }, // 勋章
      { where: '?item wdt:P31/wdt:P279* wd:Q131647 .', limit: 500 }, // 奖章
    ],
  },
  commemorative: {
    icon: '🎖️',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q855973 .', limit: 400 }, // 纪念币
      { where: '?item wdt:P31/wdt:P279* wd:Q860641 .', limit: 150 }, // 金币
      { where: '?item wdt:P31/wdt:P279* wd:Q610038 .', limit: 100 }, // 银币
    ],
  },
  'financial-tools': {
    icon: '⚖️',
    queries: [
      { where: '?item wdt:P31/wdt:P279* wd:Q12806 .', limit: 50 }, // 算盘
      { where: '?item wdt:P31/wdt:P279* wd:Q134566 .', limit: 100 }, // 秤
      { where: '?item wdt:P31/wdt:P279* wd:Q235041 .', limit: 50 }, // 收银机
      { where: '?item wdt:P31/wdt:P279* wd:Q221994 .', limit: 50 }, // 存钱罐
    ],
  },
}

const ART = {
  painting: {
    icon: '🎨',
    queries: [
      // 注意：绘画的传递闭包查询 wdt:P31/wdt:P279* wd:Q3305213 会超时（406k 件），
      // 只用直接实例 wdt:P31 并按维基百科条目数降序取知名作品
      { where: '?item wdt:P31 wd:Q3305213 .', limit: 1900, order: true },
    ],
  },
  sculpture: {
    icon: '🗿',
    queries: [{ where: '?item wdt:P31 wd:Q860861 .', limit: 1200, order: true }], // 雕塑
  },
  drawing: {
    icon: '✏️',
    queries: [{ where: '?item wdt:P31 wd:Q93184 .', limit: 800, order: true }], // 素描
  },
  print: {
    icon: '🖼️',
    queries: [{ where: '?item wdt:P31 wd:Q11060274 .', limit: 800, order: true }], // 版画
  },
  photograph: {
    icon: '📷',
    queries: [{ where: '?item wdt:P31 wd:Q125191 .', limit: 800, order: true }], // 摄影
  },
}

const MUSIC = {
  string: {
    icon: '🎻',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q1798603 .', limit: 600 }], // 弦乐器
  },
  keyboard: {
    icon: '🎹',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q52954 .', limit: 900 }], // 键盘乐器
  },
  woodwind: {
    icon: '🪈',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q181247 .', limit: 900 }], // 木管乐器
  },
  brass: {
    icon: '🎺',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q180744 .', limit: 400 }], // 铜管乐器
  },
  percussion: {
    icon: '🥁',
    queries: [{ where: '?item wdt:P31/wdt:P279* wd:Q133163 .', limit: 700 }], // 打击乐器
  },
}

const HALL_CFG = {
  nature: { cats: NATURE, collection: '维基数据 / Wikimedia Commons', source: 'Wikidata' },
  industry: { cats: INDUSTRY, collection: '维基数据 / Wikimedia Commons', source: 'Wikidata' },
  finance: { cats: FINANCE, collection: '维基数据 / Wikimedia Commons', source: 'Wikidata' },
  art: { cats: ART, collection: '维基数据 / Wikimedia Commons', source: 'Wikidata' },
  music: { cats: MUSIC, collection: '维基数据 / Wikimedia Commons', source: 'Wikidata' },
}

function buildSparql(where, limit, orderBySitelinks = false) {
  // where 里可能已含 image 约束（?image0 占位），统一处理：每条必须绑定 ?image
  const w = where.replace(/ \?image0 \./g, ' ?image .')
  // orderBySitelinks：按维基百科条目数降序，取知名作品（用于绘画/雕塑等海量条目）
  const sitelinks = orderBySitelinks ? '  ?item wikibase:sitelinks ?sitelinks .' : ''
  const order = orderBySitelinks ? ' ORDER BY DESC(?sitelinks)' : ''
  return `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?image WHERE {
${w}${w.includes('?image') ? '' : '  ?item wdt:P18 ?image .'}
${sitelinks}  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}${order} LIMIT ${limit}`
}

// 宽容 JSON 解析：Wikidata 大响应偶发被截断，导致 JSON 尾部损坏。
// 先正常解析；失败则从末尾向前找完整对象边界，截断补全后解析，保留前面有效数据（而非全丢）。
function parseJsonLenient(text) {
  const cleaned = text.replace(/[\u0000-\u001f]/g, ' ')
  try {
    return JSON.parse(cleaned)
  } catch (firstErr) {
    const marker = cleaned.indexOf('"bindings"')
    if (marker < 0) throw firstErr
    let cuts = 0
    for (let i = cleaned.length - 1; i > marker && cuts < 300; i--) {
      if (cleaned[i] === '}') {
        cuts++
        try {
          return JSON.parse(cleaned.slice(0, i + 1) + ']}}')
        } catch (_) { /* 继续向前找更早的完整边界 */ }
      }
    }
    throw firstErr
  }
}

async function runSparql(sparql, retries = 4) {
  const url = `${SPARQL}?query=${encodeURIComponent(sparql)}&format=json`
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } })
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        await sleep(2000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const j = parseJsonLenient(text)
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1500 * (i + 1))
    }
  }
  throw new Error('重试耗尽')
}

function bv(b) {
  return b?.value || ''
}

function mapRow(b, categoryId, hall, cfg) {
  const label = bv(b.itemLabel) || 'Untitled'
  const desc = bv(b.itemDescription)
  const itemId = bv(b.item).split('/').filter(Boolean).pop() || ''
  const small = imageUrl(bv(b.image), 843)
  const large = imageUrl(bv(b.image), 1686)

  return {
    id: `${hall}-wiki-${itemId}`,
    hall,
    categoryId,
    name: label,
    origin: '',
    era: '',
    date: '',
    location: '',
    collection: cfg.collection,
    dimensions: '',
    material: '',
    description: desc ? `${label}。${desc}。` : label,
    tags: desc ? [desc] : [],
    icon: cfg.cats[categoryId]?.icon || '🏛️',
    imageUrl: small,
    imageLarge: large,
    source: cfg.source,
    sourceUrl: itemId ? `https://www.wikidata.org/wiki/${itemId}` : '',
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { hall: null, limit: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hall') out.hall = args[++i]
    else if (args[i] === '--limit') out.limit = parseInt(args[++i], 10)
  }
  return out
}

async function main() {
  const { hall, limit } = parseArgs()
  if (!hall || !HALL_CFG[hall]) {
    console.error('用法：node scripts/collect-wikidata.mjs --hall nature|industry|finance|art|music [--limit N]')
    process.exit(1)
  }
  const cfg = HALL_CFG[hall]
  const OUT_FILE = path.join(OUT_DIR, `${hall}.json`)
  await mkdir(OUT_DIR, { recursive: true })

  const seen = new Set()
  const all = []

  for (const [categoryId, cat] of Object.entries(cfg.cats)) {
    for (const q of cat.queries) {
      const lim = limit ?? q.limit
      const sparql = buildSparql(q.where, lim)
      let rows
      try {
        rows = await runSparql(sparql)
      } catch (err) {
        console.error(`  [${categoryId}] 查询失败：${err.message}，跳过该子查询`)
        await sleep(800)
        continue
      }
      let added = 0
      for (const b of rows) {
        const itemId = bv(b.item).split('/').filter(Boolean).pop()
        if (seen.has(itemId)) continue
        seen.add(itemId)
        all.push(mapRow(b, categoryId, hall, cfg))
        added++
      }
      console.error(`  [${categoryId}] ${q.where.slice(0, 30)}… → +${added}（累计 ${all.length}）`)
      await sleep(1200) // 礼貌限速，避免 Wikidata 限流
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error(`\n✅ 完成！${hall} 共 ${all.length} 件，已写入 ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
