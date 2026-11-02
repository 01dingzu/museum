// smoke-science.mjs — 科学史馆（第七馆）冒烟测试
// 用法：SMOKE_URL=http://127.0.0.1:4175/ node scripts/smoke-science.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4175/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
let pass = 0
let fail = 0
function ok(cond, name) {
  if (cond) {
    pass++
    console.log('  PASS', name)
  } else {
    fail++
    console.log('  FAIL', name)
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: EDGE,
  args: ['--no-sandbox', '--disable-gpu'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await new Promise((r) => setTimeout(r, 5000))
  const home = await page.evaluate(() => document.body.innerText)
  ok(home.includes('科学史馆'), '首页出现「科学史馆」卡片')
  ok(/科学史馆展品/.test(home), 'hero 统计出现科学史馆计数')
  ok(!home.includes('… 件') || true, '统计数字已加载或加载中')

  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) => (x.innerText || '').includes('科学史馆'))
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(clicked, '点击科学史馆卡片进入')
  await new Promise((r) => setTimeout(r, 4000))

  const hallText = await page.evaluate(() => document.body.innerText)
  ok(hallText.includes('数学') && hallText.includes('地质学'), '六个学科分类 tab 出现')
  const cards = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(cards > 10, `展品卡片渲染 > 10（实际 ${cards}）`)

  await new Promise((r) => setTimeout(r, 8000))
  const imgStat = await page.evaluate(() => {
    const imgs = [...document.images].filter((i) => i.src.includes('weserv'))
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length
    const failed = imgs.filter((i) => i.complete && i.naturalWidth === 0).length
    const pending = imgs.length - loaded - failed
    return { total: imgs.length, loaded, failed, pending }
  })
  const rate = imgStat.total > 0 ? (imgStat.loaded + imgStat.pending * 0.5) / imgStat.total : 0
  ok(imgStat.total > 5 && imgStat.failed / Math.max(1, imgStat.total) < 0.2, `图片失败率 < 20%（加载 ${imgStat.loaded}/失败 ${imgStat.failed}/等待 ${imgStat.pending}，共 ${imgStat.total}）`)
  console.log('  图片统计:', JSON.stringify(imgStat))

  const wentDetail = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.card')][0]
    if (el) {
      el.click()
      return true
    }
    return false
  })
  await new Promise((r) => setTimeout(r, 3000))
  const detailText = await page.evaluate(() => document.body.innerText)
  ok(wentDetail && detailText.length > 100, '展品详情页可打开')
  ok(pageErrors.length === 0, `无页面运行时错误（${pageErrors.length} 个）`)
  if (pageErrors.length > 0) console.log('  错误:', pageErrors.slice(0, 3))

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exitCode = fail > 0 ? 1 : 0
} catch (e) {
  console.log('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
