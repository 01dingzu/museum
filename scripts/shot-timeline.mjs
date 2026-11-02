// shot-timeline.mjs — 产业时间轴截图
import puppeteer from 'puppeteer-core'

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4176/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: EDGE,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
await new Promise((r) => setTimeout(r, 4500))
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.hall-card')].find((x) =>
    (x.innerText || '').includes('工业科学馆'),
  )
  el?.click()
})
await new Promise((r) => setTimeout(r, 4500))
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.view-btn')].find((x) =>
    (x.innerText || '').includes('产业时间轴'),
  )
  el?.click()
})
await new Promise((r) => setTimeout(r, 6000))
await page.screenshot({ path: 'shot-timeline-top.png' })
// 滚到冶金/动力泳道
await page.evaluate(() => window.scrollTo(0, 1600))
await new Promise((r) => setTimeout(r, 4000))
await page.screenshot({ path: 'shot-timeline-mid.png' })
console.log('done')
await browser.close()
