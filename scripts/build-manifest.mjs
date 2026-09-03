// build-manifest.mjs — 合并策展精品 + 生成首页 manifest
// 流程：
//   1. 从 src/data/exhibits.ts 提取内置策展展品（vm 求值，去掉 TS 语法）
//   2. 将策展展品按馆并入 public/data/{hall}.json（置于列表最前，补馆前缀 id）
//   3. 生成 public/data/manifest.json（每馆 count + 12 件精选）
//
// 用法：node scripts/build-manifest.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const HALLS = ['antiquity', 'industry', 'nature']

// 1. 提取策展展品
async function extractCurated() {
  const src = await readFile(path.join(ROOT, 'src', 'data', 'exhibits.ts'), 'utf8')
  let code = src.replace(/import[^\n]*\n/, '')
  code = code.replace('export const builtInExhibits: Exhibit[] =', 'const builtInExhibits =')
  const ctx = {}
  vm.createContext(ctx)
  vm.runInContext(code + '\n;this.__result = builtInExhibits;', ctx)
  return ctx.__result
}

// 2. 为策展展品补馆前缀 id，并注入实拍图（来自 curated-images-map.json）
function prefixCurated(exhibit, imageMap) {
  const img = imageMap[exhibit.id]
  return {
    ...exhibit,
    ...(img || {}),
    id: `${exhibit.hall}-curated-${exhibit.id}`,
  }
}

// 读取策展展品实拍图映射（可选，不存在则退回 emoji 占位）
async function loadImageMap() {
  try {
    const raw = await readFile(path.join(__dirname, 'curated-images-map.json'), 'utf8')
    return JSON.parse(raw)
  } catch (_e) {
    return {}
  }
}

// 3. 精选策略：优先有图的，其次策展（无图但经典）
function pickFeatured(curated, scraped, count = 12) {
  const curatedWithImage = curated.filter((e) => e.imageUrl)
  const curatedEmoji = curated.filter((e) => !e.imageUrl)
  const scrapedWithImage = scraped.filter((e) => e.imageUrl)
  const scrapedEmoji = scraped.filter((e) => !e.imageUrl)
  // 顺序：策展有图 → 爬取有图 → 策展 emoji → 爬取 emoji
  const pool = [...curatedWithImage, ...scrapedWithImage, ...curatedEmoji, ...scrapedEmoji]
  // 去重（按 id）
  const seen = new Set()
  const out = []
  for (const e of pool) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
    if (out.length >= count) break
  }
  return out
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true })
  const curated = await extractCurated()
  const imageMap = await loadImageMap()
  console.error(`策展展品：${curated.length} 件（实拍图 ${Object.keys(imageMap).length} 件）`)

  const manifest = {}

  for (const hall of HALLS) {
    const curatedOfHall = curated.filter((e) => e.hall === hall).map((e) => prefixCurated(e, imageMap))

    // 读取爬取数据（可能不存在）
    let scraped = []
    try {
      scraped = JSON.parse(await readFile(path.join(DATA_DIR, `${hall}.json`), 'utf8'))
    } catch (_e) {
      console.error(`  [${hall}] 无爬取数据，仅用策展展品`)
    }

    // 去重：爬取数据里剔除与策展重复的（按 sourceUrl 或 name）
    const curatedIds = new Set(curatedOfHall.map((e) => e.id))
    const merged = [...curatedOfHall, ...scraped.filter((e) => !curatedIds.has(e.id))]

    // 写回 {hall}.json
    await writeFile(path.join(DATA_DIR, `${hall}.json`), JSON.stringify(merged), 'utf8')
    console.error(`  [${hall}] 策展 ${curatedOfHall.length} + 爬取 ${scraped.length} = 合计 ${merged.length} 件`)

    // 精选
    const featured = pickFeatured(curatedOfHall, scraped, 12)
    manifest[hall] = { count: merged.length, featured }
  }

  await writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  console.error('\n✅ manifest.json 已生成：')
  for (const hall of HALLS) {
    console.error(`  ${hall}: ${manifest[hall].count} 件，精选 ${manifest[hall].featured.length} 件`)
  }
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
