// collect-met.mjs — 采集大都会艺术博物馆（The Met）公开藏品数据
// 用法：
//   node scripts/collect-met.mjs --limit 30          # 小规模验证（每部门 30 件）
//   node scripts/collect-met.mjs                      # 全量采集（每部门上限见 LIMITS）
//
// 数据源：https://collectionapi.metmuseum.org/public/collection/v1/ （CC0 公有领域，免 key）
// 输出：public/data/antiquity.json（古物馆展品数组）

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'antiquity.json')

// 部门 → 基础分类映射（古物馆）。dept 6/5/14 用 culture 二次细分。
const DEPARTMENTS = [
  { deptId: 10, categoryId: 'egypt', label: 'Egyptian Art' },
  { deptId: 3, categoryId: 'mesopotamia', label: 'Ancient West Asian Art' },
  { deptId: 13, categoryId: 'greek-roman', label: 'Greek and Roman Art' },
  { deptId: 6, categoryId: 'east-asia', label: 'Asian Art' },
  { deptId: 14, categoryId: 'islamic', label: 'Islamic Art' },
  { deptId: 5, categoryId: 'americas', label: 'Arts of Africa, Oceania, and the Americas' },
]

// 全量时每部门最多采集的（有图 + 公有领域）件数
const LIMITS = {
  10: 1800, // 埃及
  3: 900, // 两河流域
  13: 1800, // 希腊罗马
  6: 1800, // 亚洲
  14: 900, // 伊斯兰
  5: 1500, // 非洲大洋洲美洲
}

// 分类 icon（与 src/data/halls.ts 保持一致）
const CATEGORY_ICON = {
  egypt: '🐫',
  mesopotamia: '🏺',
  'greek-roman': '🏛️',
  china: '🐉',
  'south-asia': '🦁',
  americas: '🗿',
  islamic: '🕌',
  'east-asia': '⛩️',
  'africa-oceania': '🪘',
}

// 按 culture 二次细分（针对 dept 6/5/14）
function classifyCategory(deptId, culture) {
  const c = (culture || '').toLowerCase()
  if (deptId === 6) {
    if (/china|chinese/.test(c)) return 'china'
    if (/india|indian|pakistan|bengal|nepal|sri lanka|south asia|kashmir/.test(c)) return 'south-asia'
    if (/japan|japanese|korea|korean|tibet|tibetan|southeast asia|thailand|thai|vietnam|vietnamese|cambodia|cambodian|indonesia|java|myanmar|burma|laos|mongol/.test(c))
      return 'east-asia'
    return 'east-asia' // 亚洲其余兜底
  }
  if (deptId === 5) {
    if (/africa|nigeria|mali|congo|ethiopia|benin|gabon|cameroon|ghana|ivory coast|oceania|polynesia|maori|papua|melanesia|micronesia|australia|new guinea|fiji|samoa|tahiti|indonesia/.test(c))
      return 'africa-oceania'
    return 'americas'
  }
  if (deptId === 14) {
    if (/india|indian|pakistan|bengal|south asia/.test(c)) return 'south-asia'
    return 'islamic'
  }
  return null
}

function buildDescription(obj) {
  const bits = []
  if (obj.objectName) bits.push(`一件${obj.objectName}`)
  if (obj.objectDate) bits.push(`年代约 ${obj.objectDate}`)
  if (obj.medium) bits.push(`材质 ${obj.medium}`)
  if (obj.culture) bits.push(`出自 ${obj.culture}`)
  if (obj.period) bits.push(`时期 ${obj.period}`)
  if (obj.dynasty) bits.push(`王朝 ${obj.dynasty}`)
  if (bits.length === 0) return '大都会艺术博物馆藏品。'
  return `${bits.join('，')}。`
}

function mapExhibit(obj, categoryId) {
  const title = obj.title || obj.objectName || 'Untitled'
  return {
    id: `antiquity-met-${obj.objectID}`,
    hall: 'antiquity',
    categoryId,
    name: title,
    origin: obj.culture || obj.artistNationality || '',
    era: obj.period || obj.dynasty || '',
    date: obj.objectDate || '',
    location: [obj.country, obj.region, obj.locus].filter(Boolean).join(' · '),
    collection: '大都会艺术博物馆 The Met',
    dimensions: obj.dimensions || '',
    material: obj.medium || '',
    description: buildDescription(obj),
    tags: [
      obj.department,
      obj.culture,
      obj.period,
      obj.dynasty,
      obj.objectName,
      obj.classification,
    ].filter(Boolean).slice(0, 8),
    icon: CATEGORY_ICON[categoryId] || '🏺',
    imageUrl: obj.primaryImageSmall || '',
    imageLarge: obj.primaryImage || '',
    source: 'The Metropolitan Museum of Art',
    sourceUrl:
      obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
  }
}

// 带 User-Agent + 退避重试的请求（The Met 对无 UA 或过快请求返回 403）
async function fetchJson(url, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'museum-collector/1.0 (educational, non-commercial research)',
        },
      })
      if (res.status === 404) return null
      if (res.status === 403 || res.status === 429) {
        const wait = 8000 * (i + 1)
        console.error(`  [限流 ${res.status}] 等待 ${wait / 1000}s 重试...`)
        await sleep(wait)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(3000 * (i + 1))
    }
  }
  return null
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function mapPool(items, worker, concurrency = 5, delayMs = 200) {
  const results = []
  const queue = [...items]
  let done = 0
  async function run() {
    while (queue.length) {
      const item = queue.shift()
      try {
        const r = await worker(item)
        if (r !== null) results.push(r)
      } catch (_err) {
        // 单条失败跳过，不中断整体
      }
      done++
      if (done % 100 === 0) {
        console.error(`  进度 ${done}/${items.length}`)
      }
      if (delayMs > 0) await sleep(delayMs)
    }
  }
  const workers = Array.from({ length: concurrency }, () => run())
  await Promise.all(workers)
  return results
}

async function main() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null

  await mkdir(OUT_DIR, { recursive: true })

  const allExhibits = []

  for (const dep of DEPARTMENTS) {
    const perDepLimit = limit ?? LIMITS[dep.deptId] ?? 1000
    console.error(`\n=== 部门 ${dep.deptId} (${dep.label})，目标 ${perDepLimit} 件 ===`)

    // 1. 拿该部门的 objectID 列表
    const list = await fetchJson(
      `${BASE}/objects?departmentIds=${dep.deptId}`,
    )
    if (!list || !list.objectIDs) {
      console.error('  未获取到 objectIDs，跳过')
      continue
    }
    const ids = list.objectIDs
    console.error(`  共 ${ids.length} 个 objectID，开始逐个拉详情...`)

    // 2. 逐个拉详情，过滤有图 + 公有领域
    let collected = 0
    const targetIds = ids
    for (const id of targetIds) {
      if (collected >= perDepLimit) break
      const obj = await fetchJson(`${BASE}/objects/${id}`)
      if (!obj || !obj.isPublicDomain || !obj.primaryImageSmall) continue
      const categoryId = classifyCategory(dep.deptId, obj.culture) || dep.categoryId
      allExhibits.push(mapExhibit(obj, categoryId))
      collected++
      if (collected % 100 === 0) {
        console.error(`  已收集 ${collected}/${perDepLimit}`)
      }
      await sleep(150) // ~6.7 req/s，礼貌限速
    }
    console.error(`  部门 ${dep.deptId} 完成，收集 ${collected} 件`)
  }

  // 3. 写文件
  await writeFile(OUT_FILE, JSON.stringify(allExhibits), 'utf8')
  console.error(`\n✅ 完成！共 ${allExhibits.length} 件，已写入 ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
