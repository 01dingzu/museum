// smoke-industry-timeline.mjs — 工业馆「产业时间轴」冒烟测试
// 用法：SMOKE_URL=http://127.0.0.1:4175/ node scripts/smoke-industry-timeline.mjs
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

  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) =>
      (x.innerText || '').includes('工业科学馆'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(clicked, '进入工业科学馆')
  await new Promise((r) => setTimeout(r, 5000))

  const gridText = await page.evaluate(() => document.body.innerText)
  ok(gridText.includes('分类浏览') && gridText.includes('产业时间轴'), '浏览方式切换按钮出现')
  ok(gridText.includes('全部（'), '默认分类网格模式正常')

  // 切换到产业时间轴
  const switched = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.view-btn')].find((x) =>
      (x.innerText || '').includes('产业时间轴'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(switched, '点击「产业时间轴」切换')
  await new Promise((r) => setTimeout(r, 4000))

  const tl = await page.evaluate(() => document.body.innerText)
  ok(tl.includes('纺织产业') && tl.includes('钢铁与冶金'), '纺织/冶金泳道出现')
  ok(tl.includes('动力与机械') && tl.includes('交通与航空'), '动力/交通泳道出现')
  ok(tl.includes('机器人与自动化'), '机器人泳道出现')
  const laneCount = await page.evaluate(() => document.querySelectorAll('.industry-lane').length)
  ok(laneCount >= 9, `产业泳道 ≥ 9 条（实际 ${laneCount}）`)
  const eraCount = await page.evaluate(() => document.querySelectorAll('.era-bucket').length)
  ok(eraCount >= 15, `时代分段 ≥ 15 个（实际 ${eraCount}）`)
  const cardCount = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(cardCount > 40, `泳道卡片渲染 > 40（实际 ${cardCount}）`)
  ok(tl.includes('珍妮纺纱机') || tl.includes('飞梭'), '补采的纺织里程碑出现')
  ok(/17\d\d/.test(tl) && /19\d\d|20\d\d/.test(tl), '年代标签跨 18-20 世纪')
  ok(tl.includes('件') && /\d{4} 件|\d{3} 件/.test(tl), '泳道件数统计显示')

  // 密度条渲染
  const densityBars = await page.evaluate(
    () => document.querySelectorAll('.lane-density-bar').length,
  )
  ok(densityBars >= 40, `密度条渲染 ≥ 40（实际 ${densityBars}）`)

  // 展开全部按钮
  const hasMore = await page.evaluate(() => document.querySelectorAll('.era-more').length)
  ok(hasMore > 0, `存在「展开全部」按钮（${hasMore} 个）`)

  // 打开一个详情
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
  ok(wentDetail && detailText.length > 100, '时间轴卡片可打开详情')
  ok(pageErrors.length === 0, `无页面运行时错误（${pageErrors.length} 个）`)
  if (pageErrors.length > 0) console.log('  错误:', pageErrors.slice(0, 3))

  // 截图
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await new Promise((r) => setTimeout(r, 2500))
  await page.screenshot({ path: 'shot-industry-timeline.png', fullPage: false })
  console.log('  截图: shot-industry-timeline.png')

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exitCode = fail > 0 ? 1 : 0
} catch (e) {
  console.log('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
