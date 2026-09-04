// 把 Special:FilePath 替换为 upload.wikimedia.org 直链（避免 302 跳转）
// 用 SHA-1 hash 路径（与 Wikimedia 内部规则一致）
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const halls = ['antiquity', 'industry', 'nature', 'finance', 'art', 'music']

function sha1Hex(s) {
  return crypto.createHash('sha1').update(s).digest('hex')
}

// 从 Special:FilePath URL 提取 filename + width
function parseSpecial(url) {
  try {
    const u = new URL(url)
    const idx = u.pathname.indexOf('Special:FilePath/')
    if (idx === -1) return null
    const raw = decodeURIComponent(u.pathname.substring(idx + 'Special:FilePath/'.length))
    let width = u.searchParams.get('width')
    width = width ? parseInt(width, 10) : 800
    return { filename: raw, width }
  } catch (e) {
    return null
  }
}

function thumbUrl(filename, width) {
  // Wikimedia 实际规则：encodeURIComponent 后空格的空格变下划线，然后做 SHA-1
  // 实际生成时 MediaWiki 的 thumb 路径是：/wikipedia/commons/thumb/{hash[0]}/{hash[0..1]}/{encFile}/{width}px-{encFile}
  const safeName = filename.replace(/ /g, '_')
  // 注意：filename 中的 # 等特殊字符保留原样（仅在路径里用 encodeURIComponent）
  const hash = sha1Hex(safeName)
  const dir1 = hash[0]
  const dir2 = hash.substring(0, 2)
  const encFile = encodeURIComponent(safeName)
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir1}/${dir2}/${encFile}/${width}px-${encFile}`
}

let totalChanged = 0
let totalFail = 0
for (const h of halls) {
  const file = path.join(ROOT, 'public/data', `${h}.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  let changed = 0
  for (const e of data) {
    if (e.imageUrl && e.imageUrl.includes('Special:FilePath/')) {
      const p = parseSpecial(e.imageUrl)
      if (p) {
        e.imageUrl = thumbUrl(p.filename, 600) // 卡片用 600px
        changed++
      } else totalFail++
    }
    if (e.imageLarge && e.imageLarge.includes('Special:FilePath/')) {
      const p = parseSpecial(e.imageLarge)
      if (p) {
        e.imageLarge = thumbUrl(p.filename, 1200) // 详情页用 1200px
        changed++
      }
    }
  }
  fs.writeFileSync(file, JSON.stringify(data))
  console.log(`[${h}] 改写 ${changed} 个 Wikimedia 直链`)
  totalChanged += changed
}
console.log(`\n总计: ${totalChanged} 个 URL 改为直链, ${totalFail} 个解析失败`)
