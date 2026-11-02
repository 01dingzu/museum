// fix-image-urls.mjs — 修复 SPARQL P18「完整 URL 被当文件名」导致的嵌套坏 URL
// 症状：imageUrl 形如 ...Special:FilePath%2Fhttp%253A%252F%252Fcommons...（双重嵌套）
// 修复：从坏 URL 中解出原始 Commons URL → 提取文件名 → 重建 weserv 代理 URL
// 用法：node scripts/fix-image-urls.mjs [music|literature|anime|all]

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function proxiedUrl(filename, width) {
  const safe = String(filename).replace(/ /g, '_')
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(safe)}?width=${width}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
}

// 从坏 URL 还原 P18 文件名
// 坏 URL = https://images.weserv.nl/?url=<enc("commons.wikimedia.org/wiki/Special:FilePath/" + p18url + "?width=600")>
// 关键：必须取「最后一次」出现的 Special:FilePath/——贪婪首匹配会抓到外层，name 变成完整 URL（白改）
function extractBrokenFilename(badUrl) {
  try {
    const m = /^https:\/\/images\.weserv\.nl\/\?url=(.+)$/.exec(badUrl)
    if (!m) return null
    const sfp = decodeURIComponent(m[1]).replace(/\?width=\d+$/, '')
    // 归一化内层编码（%3A→: %2F→/），再取最后一次的路径分隔
    const norm = sfp.replace(/%3A/gi, ':').replace(/%2F/gi, '/')
    let idx = norm.lastIndexOf('Special:FilePath/')
    let prefix = 'Special:FilePath/'
    if (idx < 0) {
      idx = norm.lastIndexOf('/File:')
      prefix = '/File:'
    }
    if (idx < 0) return null
    let name = norm.slice(idx + prefix.length)
    // 多轮解码：坏数据可能被反复 encodeURIComponent 过（%2527 = 两层编码的 '）
    for (let i = 0; i < 4; i++) {
      let d
      try {
        d = decodeURIComponent(name)
      } catch {
        break
      }
      if (d === name) break
      name = d
    }
    name = name.trim()
    return name || null
  } catch {
    return null
  }
}

const FILES = {
  music: 'music.json',
  literature: 'literature.json',
  anime: 'anime.json',
}

const which = process.argv[2] || 'all'
const halls = which === 'all' ? Object.keys(FILES) : [which]

for (const hall of halls) {
  const file = path.join(__dirname, '..', 'public', 'data', FILES[hall])
  const items = JSON.parse(readFileSync(file, 'utf8'))
  let fixed = 0
  let alreadyOk = 0
  let unfixable = 0
  for (const e of items) {
    if (!e.imageUrl) continue
    if (!/(Special(%3A|:)FilePath(%2F|\/)http|%25\d|filepath%2fhttp)/i.test(e.imageUrl)) {
      alreadyOk++
      continue
    }
    const name = extractBrokenFilename(e.imageUrl)
    if (!name || !/\.(jpe?g|png|gif|tiff?|webp|svg|pdf|djvu)$/i.test(name)) {
      // 无法解出文件名：去掉坏图，回落到 emoji 占位
      delete e.imageUrl
      delete e.imageLarge
      unfixable++
      continue
    }
    e.imageUrl = proxiedUrl(name, 600)
    e.imageLarge = proxiedUrl(name, 1200)
    fixed++
  }
  writeFileSync(file, JSON.stringify(items), 'utf8')
  console.error(`[${hall}] 修复 ${fixed}，正常 ${alreadyOk}，无法修复 ${unfixable}，总计 ${items.length}`)
}
