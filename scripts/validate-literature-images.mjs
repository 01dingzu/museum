// validate-literature-images.mjs — 批量校验文学馆图片 URL，剔除失效条目
// 原理同 validate-science-images.mjs：weserv 微型缩略图探测；403/429 是限流要重试，404 才是失效。
// 注意：文学馆图片来自两路——DBpedia（width%3D843）与 Wikidata（width%3D600），替换目标不同。
// 用法：node scripts/validate-literature-images.mjs

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'public', 'data', 'literature.json')
const CONCURRENCY = 4
const GAP_MS = 200
const UA = 'museum-validator/1.0 (educational, non-commercial research)'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function checkOne(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      })
      if (res.status === 403 || res.status === 429) {
        await sleep(4000 * (i + 1))
        continue
      }
      return res.status
    } catch {
      await sleep(2000 * (i + 1))
    }
  }
  return -1
}

async function main() {
  const data = JSON.parse(await readFile(FILE, 'utf8'))
  console.error(`待校验：${data.length} 条`)

  // 微型缩略图：把任意 width%3DNNN 替换为 width%3D16
  const urls = data.map((e) => (e.imageUrl || '').replace(/width%3D\d+/, 'width%3D16'))
  const status = new Array(data.length).fill(null)

  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor++
      status[i] = urls[i] ? await checkOne(urls[i]) : 404
      done++
      if (done % 300 === 0) console.error(`  进度 ${done}/${urls.length}`)
      await sleep(GAP_MS)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const statusCount = {}
  for (const s of status) statusCount[s] = (statusCount[s] || 0) + 1
  console.error('状态分布:', JSON.stringify(statusCount))

  const okCount = status.filter((s) => s === 200).length
  const nfCount = status.filter((s) => s === 404).length
  const rate = okCount / Math.max(1, data.length)
  if (rate < 0.4 || nfCount / Math.max(1, data.length) > 0.5) {
    console.error(`\n⛔ 通过率 ${(rate * 100).toFixed(1)}%，异常偏高，已中止（未写盘）`)
    process.exit(2)
  }

  const kept = data.filter((_, i) => status[i] === 200)
  await writeFile(FILE, JSON.stringify(kept), 'utf8')
  console.error(`\n✅ 保留 ${kept.length} 件，剔除 ${data.length - kept.length} 件（源图失效），通过率 ${(rate * 100).toFixed(1)}%`)

  const catStat = {}
  for (const e of kept) catStat[e.categoryId] = (catStat[e.categoryId] || 0) + 1
  console.error('分类保留数:', JSON.stringify(catStat))
}

main().catch((err) => {
  console.error('校验失败：', err)
  process.exit(1)
})
