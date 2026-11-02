// validate-hall-images.mjs — 通用展馆图片校验，剔除失效条目
// 原理同 validate-science-images.mjs：weserv 微型缩略图探测；403/429 是限流要重试，404 才是失效。
// 用法：node scripts/validate-hall-images.mjs [music|literature|anime] [filterRegex]
//   例：node scripts/validate-hall-images.mjs music '^music-score-'   （只校验乐谱条目）

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hall = process.argv[2] || 'literature'
const filterRe = process.argv[3] ? new RegExp(process.argv[3]) : null
const FILE = path.join(__dirname, '..', 'public', 'data', `${hall}.json`)
const CONCURRENCY = 4
const GAP_MS = 200
const UA = 'museum-validator/1.0 (educational, non-commercial research)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const idxs = data
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.imageUrl && (!filterRe || filterRe.test(e.id)))
  console.error(`[${hall}] 待校验：${idxs.length} 条`)

  const status = new Map()
  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < idxs.length) {
      const { e, i } = idxs[cursor++]
      const url = e.imageUrl.replace(/width%3D\d+/, 'width%3D16')
      status.set(i, await checkOne(url))
      done++
      if (done % 300 === 0) console.error(`  进度 ${done}/${idxs.length}`)
      await sleep(GAP_MS)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const statusCount = {}
  for (const s of status.values()) statusCount[s] = (statusCount[s] || 0) + 1
  console.error('状态分布:', JSON.stringify(statusCount))

  const okCount = [...status.values()].filter((s) => s === 200).length
  const nfCount = [...status.values()].filter((s) => s === 404).length
  const rate = okCount / Math.max(1, idxs.length)
  if (idxs.length > 50 && (rate < 0.4 || nfCount / idxs.length > 0.5)) {
    console.error(`⛔ 通过率 ${(rate * 100).toFixed(1)}%，异常偏高，已中止（未写盘）`)
    process.exit(2)
  }

  // 剔除 404（只影响被校验的条目）
  const kept = data.filter((e, i) => !status.has(i) || status.get(i) !== 404)
  await writeFile(FILE, JSON.stringify(kept), 'utf8')
  console.error(`[${hall}] ✅ 保留 ${kept.length} 件，剔除 ${nfCount} 件（源图失效），通过率 ${(rate * 100).toFixed(1)}%`)

  const catStat = {}
  for (const e of kept) catStat[e.categoryId] = (catStat[e.categoryId] || 0) + 1
  console.error(`[${hall}] 分类保留数:`, JSON.stringify(catStat))
}

main().catch((err) => {
  console.error('校验失败：', err)
  process.exit(1)
})
