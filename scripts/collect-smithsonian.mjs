// collect-smithsonian.mjs — 采集史密森尼（Smithsonian Open Access）公开数据
// 用法：
//   node scripts/collect-smithsonian.mjs --hall nature --key YOUR_API_KEY   # 自然科学馆（NMNH）
//   node scripts/collect-smithsonian.mjs --hall industry --key YOUR_API_KEY # 工业科学馆（NASM+NMAH）
//   node scripts/collect-smithsonian.mjs --hall nature --key YOUR_KEY --limit 50   # 小规模验证
//
// 数据源：https://api.si.edu/openaccess/api/v1.0/search （需免费 api.data.gov key，CC0 元数据 + 图片）
// 输出：public/data/{hall}.json
//
// key 申请：https://api.data.gov/signup （约 2 分钟，免费；DEMO_KEY 仅 30 req/hour，务必用注册 key）

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = 'https://api.si.edu/openaccess/api/v1.0'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')

// ============ 采集配置：按馆定义关键词 → 分类映射 ============
const HALL_CONFIG = {
  nature: {
    units: ['NMNH'], // 国家自然历史博物馆（含 NMNHPALEO/NMNHBOTANY/NMNHZOOLOGY 等子馆）
    collection: '史密森尼国家自然历史博物馆 Smithsonian NMNH',
    source: 'Smithsonian NMNH',
    categories: {
      paleontology: { icon: '🦖', queries: ['dinosaur', 'fossil', 'trilobite', 'mammoth', 'pterosaur'] },
      'minerals-gems': { icon: '💎', queries: ['mineral', 'gem', 'crystal', 'amethyst', 'quartz', 'diamond'] },
      meteorites: { icon: '☄️', queries: ['meteorite'] },
      botany: { icon: '🌿', queries: ['plant', 'botanical', 'herbarium', 'flower', 'fern'] },
      zoology: { icon: '🦋', queries: ['mammal', 'bird', 'insect', 'butterfly', 'fish', 'reptile', 'shell'] },
      anthropology: { icon: '🦴', queries: ['hominid', 'hominin', 'archaeology', 'stone tool', 'human skull'] },
    },
  },
  industry: {
    units: ['NASM', 'NMAH'], // 航空航天博物馆 + 美国历史博物馆
    collection: '史密森尼学会 Smithsonian',
    source: 'Smithsonian',
    categories: {
      'industrial-revolution': { icon: '🏭', queries: ['steam engine', 'textile', 'cotton gin', 'industrial'] },
      'power-machinery': { icon: '⚙️', queries: ['engine', 'machine', 'turbine', 'lathe', 'press'] },
      transport: { icon: '🚂', queries: ['locomotive', 'automobile', 'railroad', 'bicycle', 'motorcycle', 'car'] },
      communication: { icon: '📡', queries: ['telegraph', 'telephone', 'radio', 'camera', 'typewriter'] },
      'energy-electric': { icon: '⚡', queries: ['generator', 'light bulb', 'electric motor', 'battery', 'dynamo'] },
      'computing-space': { icon: '🚀', queries: ['computer', 'spacecraft', 'rocket', 'satellite', 'aircraft', 'spacesuit'] },
    },
  },
}

const FIELDS_SAFE = false // Smithsonian 不支持 fields 精简，全量返回

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { hall: null, key: process.env.SI_API_KEY || '', limit: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hall') out.hall = args[++i]
    else if (args[i] === '--key') out.key = args[++i]
    else if (args[i] === '--limit') out.limit = parseInt(args[++i], 10)
  }
  return out
}

function mediaInfo(row) {
  // 提取图片 URL 与 IIIF id
  const media =
    row?.content?.descriptiveNonRepeating?.online_media?.media || []
  const m = media.find((x) => x && (x.content || x.idsId))
  if (!m) return { thumb: '', iiifId: '' }
  return { thumb: m.content || '', iiifId: m.idsId || '' }
}

function unitOf(row) {
  return row?.unitCode || row?.content?.descriptiveNonRepeating?.unit_code || ''
}

function freetext(row, key) {
  const arr = row?.content?.freetext?.[key]
  return arr && arr.length ? arr[0].content : ''
}

function mapExhibit(row, categoryId, cfg) {
  const { thumb, iiifId } = mediaInfo(row)
  const small = thumb || (iiifId ? `https://ids.si.edu/ids/iiif/${iiifId}/full/843,/0/default.jpg` : '')
  const large = iiifId ? `https://ids.si.edu/ids/iiif/${iiifId}/full/1686,/0/default.jpg` : thumb

  const name = row.title || freetext(row, 'name') || 'Untitled'
  const date = freetext(row, 'date') || ''
  const material = freetext(row, 'medium') || freetext(row, 'physicalDescription') || ''
  const type = freetext(row, 'objectType') || ''
  const unit = unitOf(row)
  const recordLink =
    row?.content?.descriptiveNonRepeating?.record_link ||
    `https://collections.si.edu/search/detail/${row.id}`

  const descParts = []
  if (date) descParts.push(`年代 ${date}`)
  if (type) descParts.push(`类型 ${type}`)
  if (material) descParts.push(`描述 ${material}`)
  const description = `${name}${descParts.length ? '。' + descParts.join('。') + '。' : ''}`.trim()

  const icon = cfg.categories[categoryId]?.icon || '🏛️'

  return {
    id: `${cfg.hallId}-si-${String(row.id).replace(/[^a-zA-Z0-9]/g, '-')}`,
    hall: cfg.hallId,
    categoryId,
    name,
    origin: unit,
    era: unit,
    date,
    location: freetext(row, 'place') || '',
    collection: cfg.collection,
    dimensions: '',
    material,
    description,
    tags: (row?.content?.indexedStructured?.object_type || []).slice(0, 8),
    icon,
    imageUrl: small,
    imageLarge: large,
    source: cfg.source,
    sourceUrl: recordLink,
  }
}

async function main() {
  const { hall, key, limit } = parseArgs()
  if (!hall || !HALL_CONFIG[hall]) {
    console.error('用法：node scripts/collect-smithsonian.mjs --hall nature|industry --key YOUR_API_KEY [--limit N]')
    process.exit(1)
  }
  if (!key) {
    console.error('缺少 API key。请先到 https://api.data.gov/signup 免费申请，然后传 --key 或设环境变量 SI_API_KEY')
    process.exit(1)
  }

  const cfg = { ...HALL_CONFIG[hall], hallId: hall }
  const OUT_FILE = path.join(OUT_DIR, `${hall}.json`)
  const perQuery = limit ?? 1000
  await mkdir(OUT_DIR, { recursive: true })

  const seen = new Set()
  const all = []

  for (const [categoryId, cat] of Object.entries(cfg.categories)) {
    for (const q of cat.queries) {
      let start = 0
      let collected = 0
      while (collected < perQuery) {
        // online_media_type:Images 放在 q 里（fq 对 unit_code 不生效，单位改为客户端过滤）
        const url = `${BASE}/search?q=${encodeURIComponent(q + ' AND online_media_type:Images')}&start=${start}&rows=100&api_key=${key}`
        let data
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'museum-collector/1.0' } })
          if (res.status === 429) {
            console.error(`  [${q}] 触发限流（429），等待 60s…`)
            await sleep(60000)
            continue
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          data = await res.json()
        } catch (err) {
          console.error(`  [${q}] 请求失败：${err.message}，跳过`)
          break
        }
        const rows = data?.response?.rows || []
        if (rows.length === 0) break
        for (const row of rows) {
          if (collected >= perQuery) break
          collected++
          // 客户端单位过滤：unitCode 前缀匹配目标馆
          const unit = unitOf(row)
          if (!cfg.units.some((u) => unit.startsWith(u))) continue
          const mid = mediaInfo(row)
          if (!mid.thumb && !mid.iiifId) continue // 无图跳过
          if (seen.has(row.id)) continue
          seen.add(row.id)
          all.push(mapExhibit(row, categoryId, cfg))
        }
        if (rows.length < 100) break
        start += 100
        await sleep(400) // 礼貌限速
      }
      console.error(`  [${q}] → ${all.length} 件（累计）`)
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error(`\n✅ 完成！${cfg.hallId} 共 ${all.length} 件，已写入 ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
