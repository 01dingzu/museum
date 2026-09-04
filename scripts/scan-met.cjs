// 针对 Met 古物馆：快速找出所有失效图（高并发 + 10s 超时）
const fs = require('fs')
const path = require('path')
const https = require('https')

delete process.env.HTTP_PROXY
delete process.env.HTTPS_PROXY
delete process.env.http_proxy
delete process.env.https_proxy

const ROOT = path.resolve(__dirname, '..')
const file = path.join(ROOT, 'public/data/antiquity.json')
const a = JSON.parse(fs.readFileSync(file, 'utf8'))
console.log('古物馆展品数:', a.length)

// 去重，只测唯一 URL
const seen = new Map()
for (const e of a) {
  if (e.imageUrl && !seen.has(e.imageUrl)) {
    seen.set(e.imageUrl, [])
  }
  if (e.imageUrl) seen.get(e.imageUrl).push(e.id)
}
const urls = [...seen.keys()]
console.log('唯一图床 URL:', urls.length)

let ok = 0
let bad = 0
let slow = 0
const badList = []
const slowList = []
let cur = 0

function check(url) {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(
      url,
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        const elapsed = Date.now() - start
        res.on('data', () => {})
        res.on('end', () => {
          const status = res.statusCode
          if (status >= 200 && status < 400) {
            if (elapsed > 3000) {
              slow++
              slowList.push({ url, status, elapsed })
            } else ok++
          } else {
            bad++
            badList.push({ url, status, elapsed, ids: seen.get(url) })
          }
          resolve()
        })
      },
    )
    req.on('error', (e) => {
      const elapsed = Date.now() - start
      bad++
      badList.push({ url, status: 'ERR', err: e.message, elapsed, ids: seen.get(url) })
      resolve()
    })
    req.on('timeout', () => {
      req.destroy()
      const elapsed = Date.now() - start
      bad++
      badList.push({ url, status: 'TIMEOUT', elapsed, ids: seen.get(url) })
      resolve()
    })
  })
}

;(async () => {
  const CONC = 20
  const t0 = Date.now()
  for (let i = 0; i < urls.length; i += CONC) {
    await Promise.all(urls.slice(i, i + CONC).map(check))
    cur += Math.min(CONC, urls.length - i)
    if (cur % 100 === 0 || cur === urls.length) {
      console.log('[' + cur + '/' + urls.length + '] ok=' + ok + ' bad=' + bad + ' slow=' + slow + ' elapsed=' + ((Date.now() - t0) / 1000).toFixed(0) + 's')
    }
  }
  console.log('\n=== 汇总 ===')
  console.log('OK:', ok, ' 慢(>3s):', slow, ' 失效:', bad)
  console.log('\n=== 失效图床（前 30 条）===')
  badList.slice(0, 30).forEach((b) => {
    console.log('  [' + (b.status || 'ERR') + ' ' + b.elapsed + 'ms] ' + b.url)
    console.log('    关联展品:', (b.ids || []).slice(0, 3).join(', '))
  })
  fs.writeFileSync('antiquity-bad.json', JSON.stringify(badList, null, 1))
  console.log('\n→ antiquity-bad.json 已写出')
})()
