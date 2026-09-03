// collect-artic.mjs — 采集芝加哥艺术学院（Art Institute of Chicago）公开古物数据
// 用法：
//   node scripts/collect-artic.mjs --limit 40    # 小规模验证（每关键词最多 40 件）
//   node scripts/collect-artic.mjs               # 全量采集
//
// 数据源：https://api.artic.edu/api/v1/artworks/search （免 key，CC0 元数据 + IIIF 公共领域图片）
// 输出：public/data/antiquity.json（古物馆展品数组）
//
// 说明：search 端点单次查询硬上限约 1000 条（limit≤100, from≤1000），
//       故用 40 个关键词切分全量，客户端按 department_title 白名单过滤 + place_of_origin 精确分类。

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = 'https://api.artic.edu/api/v1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'antiquity.json')

// 古物部门白名单（过滤绘画/当代艺术/摄影等噪声）
const ANTIQUITY_DEPARTMENTS = new Set([
  'Arts of Greece, Rome, and Byzantium',
  'Ancient and Byzantine Art',
  'Arts of the Ancient Mediterranean and Byzantium',
  'Arts of Africa',
  'Arts of the Americas',
  'Arts of Asia',
])

// 关键词 → 兜底分类（真实分类由 classifyCategory 按部门+出处决定）
const QUERIES = [
  // 埃及
  { q: 'ancient egypt', fb: 'egypt' },
  { q: 'egyptian', fb: 'egypt' },
  { q: 'pharaoh', fb: 'egypt' },
  // 两河流域
  { q: 'mesopotamian', fb: 'mesopotamia' },
  { q: 'assyrian', fb: 'mesopotamia' },
  { q: 'babylonian', fb: 'mesopotamia' },
  { q: 'sumerian', fb: 'mesopotamia' },
  { q: 'akkadian', fb: 'mesopotamia' },
  // 希腊罗马拜占庭
  { q: 'ancient greek', fb: 'greek-roman' },
  { q: 'ancient roman', fb: 'greek-roman' },
  { q: 'greek vase', fb: 'greek-roman' },
  { q: 'attic', fb: 'greek-roman' },
  { q: 'etruscan', fb: 'greek-roman' },
  { q: 'byzantine', fb: 'greek-roman' },
  { q: 'hellenistic', fb: 'greek-roman' },
  // 中国
  { q: 'chinese', fb: 'china' },
  { q: 'china', fb: 'china' },
  { q: 'ming dynasty', fb: 'china' },
  { q: 'tang dynasty', fb: 'china' },
  { q: 'song dynasty', fb: 'china' },
  { q: 'qing dynasty', fb: 'china' },
  // 南亚 / 佛教
  { q: 'indian', fb: 'south-asia' },
  { q: 'gandhara', fb: 'south-asia' },
  { q: 'buddhist', fb: 'south-asia' },
  { q: 'hindu', fb: 'south-asia' },
  { q: 'chola', fb: 'south-asia' },
  { q: 'nepalese', fb: 'south-asia' },
  { q: 'tibetan', fb: 'south-asia' },
  // 美洲
  { q: 'maya', fb: 'americas' },
  { q: 'aztec', fb: 'americas' },
  { q: 'inca', fb: 'americas' },
  { q: 'pre-columbian', fb: 'americas' },
  { q: 'mesoamerican', fb: 'americas' },
  { q: 'andean', fb: 'americas' },
  { q: 'olmec', fb: 'americas' },
  { q: 'moche', fb: 'americas' },
  // 伊斯兰 / 中东
  { q: 'islamic', fb: 'islamic' },
  { q: 'persian', fb: 'islamic' },
  { q: 'ottoman', fb: 'islamic' },
  { q: 'mughal', fb: 'islamic' },
  { q: 'safavid', fb: 'islamic' },
  // 东亚
  { q: 'japanese', fb: 'east-asia' },
  { q: 'korean', fb: 'east-asia' },
  { q: 'ukiyo-e', fb: 'east-asia' },
  // 非洲 / 大洋洲
  { q: 'african', fb: 'africa-oceania' },
  { q: 'benin', fb: 'africa-oceania' },
  { q: 'yoruba', fb: 'africa-oceania' },
  { q: 'oceanic', fb: 'africa-oceania' },
  { q: 'polynesian', fb: 'africa-oceania' },
  { q: 'melanesian', fb: 'africa-oceania' },
]

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

const FIELDS = [
  'id',
  'title',
  'image_id',
  'is_public_domain',
  'department_title',
  'classification_titles',
  'term_titles',
  'date_display',
  'medium_display',
  'artist_display',
  'place_of_origin',
].join(',')

const UA = 'museum-collector/1.0 (educational, non-commercial research)'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status === 403) {
        await sleep(1500 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (!j.data) return null // 超出分页上限
      return j
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(1000 * (i + 1))
    }
  }
}

// 精确分类：先按出处全局细分（埃及/两河文物混在希腊罗马部门下），再回退部门，最后回退关键词
function classifyCategory(a, fallback) {
  const dept = a.department_title || ''
  const origin = (a.place_of_origin || '').toLowerCase()
  const terms = (a.term_titles || []).join(' ').toLowerCase()
  const title = (a.title || '').toLowerCase()
  const text = `${origin} ${terms} ${title}`

  // 1) 出处全局分类（最高优先级）
  if (/egypt|nubia|kush|amarna|thebes|memphis/.test(origin)) return 'egypt'
  if (/mesopotamia|assyria|babylon|sumer|akkad|uruk|nineveh|nimrud|iraq/.test(origin)) return 'mesopotamia'
  if (/china|chinese/.test(origin)) return 'china'
  if (/japan|japanese/.test(origin)) return 'east-asia'
  if (/korea|korean/.test(origin)) return 'east-asia'
  if (/india|indian|gandhara|pakistan|nepal|tibet|bhutan|sri lanka|bangladesh/.test(origin)) return 'south-asia'
  if (/iran|persia|persian|ottoman|turkey|turkish|mughal|safavid|seljuk|syria|arab|mamluk|islam/.test(origin)) return 'islamic'
  if (/cambodia|thailand|siam|indonesia|java|burma|myanmar|vietnam|laos|khmer/.test(origin)) return 'south-asia'
  if (/greece|greek|rome|roman|etruscan|italy|byzant/.test(origin)) return 'greek-roman'
  if (/maya|aztec|inca|mexico|peru|andean|colombia|guatemala|mesoamerica|olmec|moche/.test(origin)) return 'americas'
  if (/africa|nigeria|congo|benin|mali|ghana|ethiopia|melanesia|polynesia|oceania|new zealand|maori|papua/.test(origin)) return 'africa-oceania'

  // 2) 部门分类
  if (dept === 'Arts of Africa') return 'africa-oceania'
  if (dept === 'Arts of the Americas') return 'americas'
  if (
    dept === 'Arts of Greece, Rome, and Byzantium' ||
    dept === 'Ancient and Byzantine Art' ||
    dept === 'Arts of the Ancient Mediterranean and Byzantium'
  ) {
    // 该部门下未匹配出处的，按术语细分埃及/两河
    if (/egypt|nubian|pharaoh|hieroglyph/.test(text)) return 'egypt'
    if (/mesopotamia|assyrian|babylonian|sumerian|akkadian|cuneiform/.test(text)) return 'mesopotamia'
    return 'greek-roman'
  }

  if (dept === 'Arts of Asia') {
    if (/china|chinese|ming|tang|song|qing|yuan|han dynasty|shang|zhou/.test(text)) return 'china'
    if (/japan|japanese|korea|korean|ukiyo|edo|meiji|choson|goryeo|silla/.test(text)) return 'east-asia'
    if (/india|indian|gandhara|pakistan|nepal|tibet|bhutan|himalay|buddh|hindu|chola|kushan|sri lanka|bengal|mathura/.test(text)) return 'south-asia'
    if (/islam|persia|persian|iran|iraq|ottoman|turkey|turkish|mughal|safavid|seljuk|syria|arab|mamluk|samarkand|bukhara|umayyad|abbasid/.test(text)) return 'islamic'
    if (/cambodia|thai|thailand|siam|indonesia|java|burma|myanmar|vietnam|laos|khmer|srivijaya/.test(text)) return 'south-asia'
    return 'east-asia'
  }

  return fallback
}

function mapExhibit(a, categoryId) {
  const small = a.image_id
    ? `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`
    : ''
  const large = a.image_id
    ? `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`
    : ''
  const descParts = []
  if (a.date_display) descParts.push(`年代 ${a.date_display}`)
  if (a.medium_display) descParts.push(`材质 ${a.medium_display}`)
  if (a.artist_display) descParts.push(`作者 ${a.artist_display}`)
  const description = `${a.title || 'Untitled'}${descParts.length ? '。' + descParts.join('。') + '。' : ''}`.trim()

  return {
    id: `antiquity-artic-${a.id}`,
    hall: 'antiquity',
    categoryId,
    name: a.title || 'Untitled',
    origin: a.place_of_origin || '',
    era: a.department_title || '',
    date: a.date_display || '',
    location: a.place_of_origin || '',
    collection: '芝加哥艺术学院 Art Institute of Chicago',
    dimensions: '',
    material: a.medium_display || '',
    description,
    tags: (a.classification_titles || []).slice(0, 8),
    icon: CATEGORY_ICON[categoryId] || '🏺',
    imageUrl: small,
    imageLarge: large,
    source: 'Art Institute of Chicago',
    sourceUrl: `https://www.artic.edu/artworks/${a.id}`,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null
  const perQuery = limit ?? 1000 // 单关键词最多取件数（API 硬上限 ~1000）

  await mkdir(OUT_DIR, { recursive: true })

  const seen = new Set()
  const all = []
  let fetched = 0

  for (const { q, fb } of QUERIES) {
    let page = 1
    let collected = 0
    let empty = false
    while (collected < perQuery && !empty) {
      const url = `${BASE}/artworks/search?q=${encodeURIComponent(q)}&page=${page}&limit=100&fields=${FIELDS}`
      let data
      try {
        data = await fetchJson(url)
      } catch (err) {
        console.error(`  [${q}] 请求失败：${err.message}，跳过`)
        break
      }
      if (!data) break
      const items = data.data || []
      if (items.length === 0) break
      for (const a of items) {
        if (collected >= perQuery) break
        collected++
        fetched++
        if (!a.is_public_domain) continue
        if (!a.image_id) continue
        if (a.department_title && !ANTIQUITY_DEPARTMENTS.has(a.department_title)) continue
        if (seen.has(a.id)) continue
        seen.add(a.id)
        const cat = classifyCategory(a, fb)
        all.push(mapExhibit(a, cat))
      }
      if (data.pagination && page >= data.pagination.total_pages) empty = true
      page++
      await sleep(180)
    }
    console.error(`  [${q}] → ${all.length} 件（累计）`)
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error(`\n✅ 完成！抓取 ${fetched} 条，去重过滤后 ${all.length} 件，已写入 ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
