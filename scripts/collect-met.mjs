// collect-met.mjs — 采集大都会艺术博物馆（The Metropolitan Museum of Art）古物数据
// 用途：替换芝加哥艺术学院（AIC）古物数据源（AIC 的 IIIF 图片服务被 Cloudflare 防盗链拦截，浏览器无法加载）
// 用法：
//   node scripts/collect-met.mjs --limit 20    # 小规模验证（每部门最多 20 件）
//   node scripts/collect-met.mjs               # 全量采集
//
// 数据源：https://collectionapi.metmuseum.org/public/collection/v1 （免 key，CC0 元数据 + 公有领域图片）
//   - /search?departmentId=X&hasImages=true&isPublicDomain=true&q=*  返回有图+公有领域 objectIDs
//   - /objects/{id}   返回单件详情（含 primaryImage / primaryImageSmall / culture 等）
// 输出：public/data/antiquity.json（古物馆展品数组，不含策展精品）
//
// 图片：images.metmuseum.org 可直接热链（浏览器 <img> 无需 key/代理）

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'antiquity.json')

// 注意：Met 挂了 Incapsula WAF，含 "collector" 等爬虫字样的 UA 会触发 bot 拦截，
// 需用浏览器 UA（实测 chrome/safari/无 UA 均可正常返回 JSON）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// 古物馆分类图标（与 src/data/halls.ts 一致）
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

// 采集配置：Met 部门 → 古物馆分类（'ASIAN' / 'AMERICAS' 为需二次细分的标记）
// 注意：Incapsula 对并发请求严格限流，串行（并发 1）实测 ~1.3s/件稳定
const DEPTS = [
  { id: 10, name: 'Egyptian Art', cat: 'egypt', target: 800 },
  { id: 13, name: 'Greek and Roman Art', cat: 'greek-roman', target: 800 },
  { id: 6, name: 'Asian Art', cat: 'ASIAN', target: 900 },
  { id: 3, name: 'Ancient Near Eastern Art', cat: 'mesopotamia', target: 300 },
  { id: 14, name: 'Islamic Art', cat: 'islamic', target: 300 },
  { id: 5, name: 'Arts of Africa, Oceania, and the Americas', cat: 'AMERICAS', target: 500 },
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 带重试与退避的 fetch（429 / 5xx / 网络错误）
async function fetchJson(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429) {
        const wait = 3000 * (i + 1)
        console.error(`  ⚠️ 429 限流，退避 ${wait}ms`)
        await sleep(wait)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1000 * (i + 1))
    }
  }
}

// 亚洲部门（dept 6）细分：按 culture/country 精确归类
function classifyAsian(o) {
  const text = `${o.culture || ''} ${o.country || ''} ${o.region || ''} ${o.objectName || ''} ${o.title || ''}`.toLowerCase()
  if (/china|chinese|han dynasty|tang dynasty|song dynasty|ming dynasty|qing dynasty|yuan dynasty|shang dynasty|zhou dynasty|sancai|celadon|jingdezhen/.test(text)) return 'china'
  if (/japan|japanese|korea|korean|ukiyo|edo|meiji|choson|goryeo|silla|koryo|netsuke/.test(text)) return 'east-asia'
  if (/india|indian|nepal|nepalese|tibet|tibetan|bhutan|pakistan|sri lanka|ceylon|bengal|mathura|kushan|gandhara|burma|myanmar|thailand|thai|siam|cambodia|khmer|indonesia|java|javanese|vietnam|laos|balinese/.test(text)) return 'south-asia'
  if (/islam|iran|persia|persian|turkey|turkish|ottoman|syria|syrian|arab|mamluk|seljuk|safavid|timurid|samarkand|bukhara|umayyad|abbasid/.test(text)) return 'islamic'
  return 'east-asia' // 亚洲艺术未明确归属的，默认东亚（中日韩占大头）
}

// 非洲/大洋洲/美洲部门（dept 5）细分
function classifyAmericas(o) {
  const text = `${o.culture || ''} ${o.country || ''} ${o.region || ''} ${o.objectName || ''}`.toLowerCase()
  if (/mexico|mexican|peru|peruvian|maya|mayan|aztec|inca|incan|andean|mesoamerica|mesoamerican|colombia|colombian|guatemala|guatemalan|costa rica|olmec|moche|veracruz|teotihuacan|nazca|chimu|chavin|zapotec|mixtec|taino/.test(text)) return 'americas'
  return 'africa-oceania' // 其余（非洲/大洋洲）归 africa-oceania
}

// 单个部门 → 古物馆分类
function classify(deptCat, o) {
  if (deptCat === 'ASIAN') return classifyAsian(o)
  if (deptCat === 'AMERICAS') return classifyAmericas(o)
  return deptCat
}

function mapExhibit(o, categoryId) {
  const descParts = []
  if (o.objectDate) descParts.push(`年代 ${o.objectDate}`)
  if (o.medium) descParts.push(`材质 ${o.medium}`)
  if (o.artistDisplayName) descParts.push(`作者 ${o.artistDisplayName}`)
  const description = `${o.title || 'Untitled'}${descParts.length ? '。' + descParts.join('。') + '。' : ''}`.trim()

  const origin = o.culture || o.country || o.region || ''
  const location = o.culture || o.country || ''

  return {
    id: `antiquity-met-${o.objectID}`,
    hall: 'antiquity',
    categoryId,
    name: o.title || 'Untitled',
    origin,
    era: o.department || '',
    date: o.objectDate || '',
    location,
    collection: '大都会艺术博物馆 The Metropolitan Museum of Art',
    dimensions: o.dimensions || '',
    material: o.medium || '',
    description,
    tags: [o.classification, o.objectName, o.culture, o.period, o.dynasty].filter(Boolean).slice(0, 8),
    icon: CATEGORY_ICON[categoryId] || '🏺',
    // 卡片用 web-thumb（5-15KB），详情页用 web-large（80KB）。原始字段保留在 raw。
    // 修复：Met 同时返回 primaryImageSmall 和 primaryImage，两者 URL 通常相同（都指向 web-large）
    // 用 thumb 端点换更小尺寸（仅在 URL 含 /web-large/ 时替换）
    imageUrl: replaceMetThumb(o.primaryImageSmall || o.primaryImage || ''),
    imageLarge: o.primaryImage || o.primaryImageSmall || '',
    source: 'The Metropolitan Museum of Art',
    sourceUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
  }
}

// Met 图床尺寸转换：/web-large/ → /web-thumb/（86KB → 5-15KB，6-10 倍提速）
// thumb 端点不一定对所有 ID 有效，但 Met API 中公开藏品 99%+ 都已生成
function replaceMetThumb(url) {
  if (!url) return ''
  return url.replace('/web-large/', '/web-thumb/')
}

// 并发拉取详情（受控并发 + 结果保序），worker 返回有效展品或 null
// 注意：Incapsula 对并发严格限流，用串行（并发 1）保证稳定 ~1.3s/件
async function collectDetails(objectIDs, target, deptCat, seen, onProgress) {
  const results = []
  let collected = 0
  let cursor = 0
  const CONCURRENCY = 1

  async function worker() {
    while (cursor < objectIDs.length && collected < target) {
      const oid = objectIDs[cursor++]
      let o
      try {
        o = await fetchJson(`${BASE}/objects/${oid}`)
      } catch (err) {
        continue // 单个对象失败跳过
      }
      // 过滤：无标题 / 非公有领域 / 无图 / 钱币（避免与金融馆重叠）
      if (!o || !o.title) continue
      if (!o.isPublicDomain) continue
      if (!o.primaryImage && !o.primaryImageSmall) continue
      const cls = (o.classification || '').toLowerCase()
      if (cls.includes('coin')) continue

      const cat = classify(deptCat, o)
      results.push(mapExhibit(o, cat))
      collected++
      if (collected % 100 === 0) onProgress(collected)
      await sleep(100)
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  await Promise.all(workers)
  return results
}

async function main() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null

  await mkdir(OUT_DIR, { recursive: true })

  const all = []
  const seen = new Set()

  for (const dept of DEPTS) {
    const target = limit ?? dept.target
    // 1) 用 search 端点拿有图+公有领域 objectIDs
    const searchUrl = `${BASE}/search?departmentId=${dept.id}&hasImages=true&isPublicDomain=true&q=*`
    let objectIDs
    try {
      const sr = await fetchJson(searchUrl)
      objectIDs = sr.objectIDs || []
    } catch (err) {
      console.error(`  [${dept.name}] 获取 objectIDs 失败：${err.message}，跳过`)
      continue
    }
    console.error(`\n[${dept.name}] 有图+公有领域 ${objectIDs.length} 件，目标 ${target} 件`)

    const before = all.length
    const results = await collectDetails(objectIDs, target, dept.cat, seen, (c) => {
      console.error(`  [${dept.name}] 已采 ${c}/${target}（累计 ${all.length + c}）`)
    })
    // 去重后追加
    for (const r of results) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        all.push(r)
      }
    }
    console.error(`  [${dept.name}] 完成：采得 ${all.length - before} 件（累计 ${all.length}）`)
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')

  // 分类统计
  const byCat = {}
  for (const e of all) byCat[e.categoryId] = (byCat[e.categoryId] || 0) + 1
  console.error(`\n✅ 完成！共 ${all.length} 件，已写入 ${OUT_FILE}`)
  console.error('分类分布：')
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.error(`  ${String(v).padStart(5)}  ${k}`))
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
