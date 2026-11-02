// shot-music-timeline.mjs — 截音乐时间轴视图
// 用法：SMOKE_URL=http://127.0.0.1:4176/ node scripts/shot-music-timeline.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4176/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: EDGE,
  args: ['--no-sandbox', '--disable-gpu'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await wait(5000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) =>
      (x.innerText || '').includes('音乐乐器馆'),
    )
    if (el) el.click()
  })
  await wait(6000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.view-btn')].find((x) =>
      (x.innerText || '').includes('音乐时间轴'),
    )
    if (el) el.click()
  })
  await wait(6000)
  await page.screenshot({ path: 'shot-music-timeline.png' })
  console.log('saved shot-music-timeline.png')
  // 滚到乐谱泳道再截一张
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.lane-name')].find((x) =>
      (x.innerText || '').includes('乐谱与手稿'),
    )
    if (el) el.scrollIntoView({ block: 'start' })
  })
  await wait(2000)
  await page.screenshot({ path: 'shot-music-scores.png' })
  console.log('saved shot-music-scores.png')
} finally {
  await browser.close()
}
