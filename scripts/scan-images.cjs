// 显式禁用系统代理（沙箱里 HTTP_PROXY=127.0.0.1:11043 会劫持请求）
delete process.env.HTTP_PROXY
delete process.env.HTTPS_PROXY
delete process.env.http_proxy
delete process.env.https_proxy
delete process.env.ALL_PROXY
delete process.env.all_proxy

// 图片健康度扫描：禁用代理直接发请求，统计 200/4xx/超时
const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.resolve(__dirname, '..') // 指向 museum 根
const halls = ['antiquity', 'industry', 'nature', 'finance', 'art', 'music']
const allUrls = []
for (const h of halls) {
  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/data', `${h}.json`), 'utf8'),
  )
  for (const e of data) {
    if (e.imageUrl) allUrls.push({ hall: h, id: e.id, name: e.name, url: e.imageUrl })
  }
}
console.log('总图片 URL: ' + allUrls.length)

// 不抽样，全测（并发控制 8）
const CONCURRENCY = 8
let cur = 0
let ok = 0
let bad = 0
let slow = 0
const badList = []
const slowList = []

function check(item) {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(
      item.url,
      {
        agent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
      (res) => {
        const elapsed = Date.now() - start
        // 只取 head 32KB
        res.on('data', () => {})
        res.on('end', () => {
          const status = res.statusCode
          const len = Number(res.headers['content-length'] || 0)
          if (status >= 200 && status < 400) {
            if (elapsed > 4000) {
              slow++
              slowList.push({ ...item, status, len, elapsed })
            } else ok++
          } else {
            bad++
            badList.push({ ...item, status, len, elapsed })
          }
          resolve()
        })
      },
    )
    req.on('error', (e) => {
      const elapsed = Date.now() - start
      bad++
      badList.push({ ...item, status: 'ERR', err: e.message, elapsed })
      resolve()
    })
    req.on('timeout', () => {
      req.destroy()
      const elapsed = Date.now() - start
      bad++
      badList.push({ ...item, status: 'TIMEOUT', elapsed })
      resolve()
    })
  })
}

;(async () => {
  // 过滤掉已知的代理白名单
  const targets = allUrls
  const t0 = Date.now()
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const slice = targets.slice(i, i + CONCURRENCY)
    await Promise.all(slice.map(check))
    cur += slice.length
    if (cur % 200 === 0 || cur === targets.length) {
      console.log('[' + cur + '/' + targets.length + '] ok=' + ok + ' bad=' + bad + ' slow=' + slow + ' elapsed=' + ((Date.now() - t0) / 1000).toFixed(0) + 's')
    }
  }
  console.log('\n=== 汇总 ===')
  console.log(`OK: ${ok}   慢(>4s): ${slow}   失效: ${bad}   总: ${allUrls.length}`)
  console.log('\n=== 失效样本（最多 20 条）===')
  badList.slice(0, 20).forEach((b) => {
    console.log('[ ' + b.hall + ' ] ' + b.id + '  ' + (b.status || '') + ' ' + (b.err || '') + ' ' + b.elapsed + 'ms')
    console.log('  ' + b.url)
  })
  if (badList.length > 20) console.log('...还有 ' + (badList.length - 20) + ' 条失效')

  console.log('\n=== 慢图样本（>4s，最多 10 条）===')
  slowList.slice(0, 10).forEach((b) => {
    console.log('[ ' + b.hall + ' ] ' + b.id + '  ' + b.elapsed + 'ms  size=' + b.len + 'B')
    console.log('  ' + b.url)
  })

  fs.writeFileSync('bad-images.json', JSON.stringify(badList, null, 1))
  fs.writeFileSync('slow-images.json', JSON.stringify(slowList, null, 1))
  console.log('\n→ bad-images.json / slow-images.json 已写出')
})()
