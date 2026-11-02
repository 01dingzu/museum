// validate-science-images.mjs — 批量校验科学史馆图片 URL，剔除失效条目
// 原理：把 imageUrl 里百分号编码的 width%3D843 换成 width%3D16（微型缩略图），fetch 逐条探测。
//       注意：weserv 的内层 URL 是整体 percent-encode 的，宽度参数形态是 width%3D843，
//       不是 width=843 —— 替换错了会探测原图并触发限流（踩过的坑）。
//       低并发 + 间隔，避免触发 weserv 的 Cloudflare 限流（403/429 是限流不是失效）。
// 保险：若 404 率 > 50% 或通过率 < 40%，判定为网络/脚本异常，中止且不写盘。
// 用法：node scripts/validate-science-images.mjs
// 输出：public/data/science.json（原地清理）+ 控制台报告

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'public', 'data', 'science.json')
const CONCURRENCY = 4
const GAP_MS = 200 // 每个请求之间的间隔（每个 worker 串行 + 间隔）
const UA = 'museum-validator/1.0 (educational, non-commercial research)'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 403/429/超时 = 限流或网络抖动，可重试；404 = 源图失效，定论
async function checkOne(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      })
      if (res.status === 403 || res.status === 429) {
        await sleep(4000 * (i + 1)) // 限流退避
        continue
      }
      return res.status
    } catch {
      await sleep(2000 * (i + 1))
    }
  }
  return -1 // 网络异常（不算失效）
}

async function main() {
  const data = JSON.parse(await readFile(FILE, 'utf8'))
  console.error(`待校验：${data.length} 条`)

  const urls = data.map((e) => (e.imageUrl || '').replace('width%3D843', 'width%3D16'))
  const status = new Array(data.length).fill(null)

  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor++
      status[i] = await checkOne(urls[i])
      done++
      if (done % 200 === 0) console.error(`  进度 ${done}/${urls.length}`)
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
  console.error(`\n✅ 保留 ${kept.length} 件，剔除 ${nfCount} 件（源图失效），通过率 ${(rate * 100).toFixed(1)}%`)

  const catStat = {}
  for (const e of kept) catStat[e.categoryId] = (catStat[e.categoryId] || 0) + 1
  console.error('分学科保留数:', JSON.stringify(catStat))
}

main().catch((err) => {
  console.error('校验失败：', err)
  process.exit(1)
})

