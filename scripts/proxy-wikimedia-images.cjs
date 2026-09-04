// proxy-wikimedia-images.cjs — 把所有 Wikimedia 图片 URL 改写为 images.weserv.nl 代理
// 背景：commons.wikimedia.org / upload.wikimedia.org 在国内不可达，
//      images.weserv.nl 是 Cloudflare 全球 CDN 的免费图片代理，国内可直连，且自带缩放缓存。
// 实测结论（2026-09-04）：
//   1. weserv 不支持直接代理 upload.wikimedia.org 原图（大图像素超限 404）和 thumb 路径（400）
//   2. 唯一稳定格式 = Special:FilePath 带 ?width 参数：
//      weserv 服务端跟随 302 到 Wikimedia 预生成 thumb，绕开原图像素限制
//      https://images.weserv.nl/?url=<enc(commons.wikimedia.org/wiki/Special:FilePath/<enc(filename)>?width=600)>
//   3. MediaWiki 文件路径 hash 是 MD5 不是 SHA-1（蒙娜丽莎实测 md5=e/ec 匹配真实 URL）
//   4. 偶发 429 是 Commons 对 weserv 的限流，浏览器 onError 兜底即可
// 处理：public/data/*.json 全部展品的 imageUrl(w=600) / imageLarge(w=1200) + manifest.json 策展精品
// 幂等：已是正确形式的 URL 会跳过

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const FILES = ['antiquity.json', 'industry.json', 'nature.json', 'finance.json', 'art.json', 'music.json', 'manifest.json']

// 解开 weserv 代理层，拿到内层 Wikimedia URL
function unwrapWeserv(u) {
  if (!u.startsWith('https://images.weserv.nl/')) return u
  try {
    const url = new URL(u)
    const inner = url.searchParams.get('url')
    return inner || u
  } catch (e) {
    return u
  }
}

// 任意 Wikimedia URL → 提取并规范化文件名（decode 一遍再统一 encode）
function extractFilename(u) {
  try {
    const url = new URL(u.startsWith('http') ? u : 'https://' + u)
    let raw = null
    if (url.hostname === 'commons.wikimedia.org') {
      const m = url.pathname.match(/Special:FilePath\/(.+)/)
      if (m) raw = m[1]
    } else if (url.hostname === 'upload.wikimedia.org') {
      const p = decodeURIComponent(url.pathname)
      let m = p.match(/^\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/(.+?)\/\d+px-.+$/)
      if (m) raw = m[1]
      else {
        m = p.match(/^\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/(.+)$/)
        if (m) raw = m[1]
      }
    }
    if (!raw) return null
    // 规范化：decode（可能多重编码）→ 统一 encode
    let fn = raw
    for (let i = 0; i < 3; i++) {
      try {
        const d = decodeURIComponent(fn)
        if (d === fn) break
        fn = d
      } catch (e) { break }
    }
    return encodeURIComponent(fn)
  } catch (e) {
    return null
  }
}

function isWikimediaish(u) {
  return /commons\.wikimedia\.org|upload\.wikimedia\.org|images\.weserv\.nl/.test(u)
}

function weserv(u, width) {
  if (!u) return u
  if (!isWikimediaish(u)) return u
  const inner = unwrapWeserv(u)
  const fn = extractFilename(inner)
  if (!fn) return u
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${fn}?width=${width}`
  const next = `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
  return next === u ? u : next
}

let totalConverted = 0
for (const f of FILES) {
  const fp = path.join(DATA_DIR, f)
  if (!fs.existsSync(fp)) continue
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'))
  let converted = 0

  const walk = (e) => {
    if (!e || typeof e !== 'object') return
    if (typeof e.imageUrl === 'string') {
      const n = weserv(e.imageUrl, 600)
      if (n !== e.imageUrl) { e.imageUrl = n; converted++ }
    }
    if (typeof e.imageLarge === 'string') {
      const n = weserv(e.imageLarge, 1200)
      if (n !== e.imageLarge) { e.imageLarge = n; converted++ }
    }
  }

  if (Array.isArray(data)) {
    data.forEach(walk)
  } else {
    // manifest.json: { hall: { featured: [...] } }
    for (const hall of Object.values(data)) {
      if (hall && Array.isArray(hall.featured)) hall.featured.forEach(walk)
    }
  }

  fs.writeFileSync(fp, JSON.stringify(data), 'utf8')
  totalConverted += converted
  console.log(`${f}: 改写 ${converted} 个 URL`)
}
console.log(`\n✅ 总计改写 ${totalConverted} 个 Wikimedia URL → images.weserv.nl (Special:FilePath) 代理`)
