// smoke-new-halls.mjs — 文学馆 / 动漫馆 / 音乐馆时间轴 冒烟测试
// 用法：SMOKE_URL=http://127.0.0.1:4176/ node scripts/smoke-new-halls.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4176/'
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

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
  await wait(5000)

  // ---- 首页：九馆 ----
  const homeText = await page.evaluate(() => document.body.innerText)
  ok(homeText.includes('文学馆'), '首页出现「文学馆」卡片')
  ok(homeText.includes('动漫馆'), '首页出现「动漫馆」卡片')
  const hallCards = await page.evaluate(() => document.querySelectorAll('.hall-card').length)
  ok(hallCards >= 9, `首页展馆卡片 ≥ 9（实际 ${hallCards}）`)

  // ---- 文学馆 ----
  let entered = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) =>
      (x.innerText || '').includes('文学馆'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(entered, '进入文学馆')
  await wait(6000)
  let text = await page.evaluate(() => document.body.innerText)
  ok(text.includes('小说') && text.includes('诗歌'), '文学馆分类 tabs 出现')
  ok(text.includes('作家') && text.includes('史诗与神话'), '文学馆作家/史诗分类出现')
  const litCards = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(litCards > 20, `文学馆卡片 > 20（实际 ${litCards}）`)
  ok(text.includes('乐谱') === false, '文学馆无乐谱分类（隔离正确）')
  await page.screenshot({ path: 'shot-literature.png' })

  // ---- 动漫馆 ----
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('首页'))
    if (el) el.click()
  })
  await wait(1500)
  entered = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) =>
      (x.innerText || '').includes('动漫馆'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(entered, '进入动漫馆')
  await wait(6000)
  text = await page.evaluate(() => document.body.innerText)
  ok(text.includes('古代绘卷') && text.includes('浮世绘与画集'), '动漫馆绘卷/浮世绘分类出现')
  ok(text.includes('早期动画') && text.includes('公版角色'), '动漫馆动画/角色分类出现')
  const animeCards = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(animeCards > 20, `动漫馆卡片 > 20（实际 ${animeCards}）`)
  ok(text.includes('北斋漫画') || text.includes('威利号') || text.includes('幻影集'), '动漫馆种子展品出现')
  await page.screenshot({ path: 'shot-anime.png' })

  // ---- 音乐馆：乐谱 + 时间轴 ----
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('首页'))
    if (el) el.click()
  })
  await wait(1500)
  entered = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.hall-card')].find((x) =>
      (x.innerText || '').includes('音乐乐器馆'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(entered, '进入音乐乐器馆')
  await wait(6000)
  text = await page.evaluate(() => document.body.innerText)
  ok(text.includes('乐谱与手稿'), '音乐馆「乐谱与手稿」分类 tab 出现')
  ok(text.includes('音乐时间轴'), '音乐馆时间轴切换按钮出现')

  // 点乐谱分类 tab，验证乐谱展品
  const scoreTab = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.cat-tab')].find((x) =>
      (x.innerText || '').includes('乐谱与手稿'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(scoreTab, '点击「乐谱与手稿」分类')
  await wait(3000)
  const scoreCards = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(scoreCards > 20, `乐谱卡片 > 20（实际 ${scoreCards}）`)

  // 切回「全部」分类再进时间轴（否则过滤器停留在乐谱，只渲染一条泳道）
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.cat-tab')].find((x) =>
      (x.innerText || '').includes('全部'),
    )
    if (el) el.click()
  })
  await wait(1500)

  // 切到音乐时间轴
  const switched = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.view-btn')].find((x) =>
      (x.innerText || '').includes('音乐时间轴'),
    )
    if (el) {
      el.click()
      return true
    }
    return false
  })
  ok(switched, '点击「音乐时间轴」切换')
  await wait(5000)
  text = await page.evaluate(() => document.body.innerText)
  ok(text.includes('弦乐器') && text.includes('键盘乐器'), '弦乐/键盘泳道出现')
  ok(text.includes('乐谱与手稿'), '乐谱泳道出现')
  const laneCount = await page.evaluate(() => document.querySelectorAll('.industry-lane').length)
  ok(laneCount >= 6, `音乐泳道 ≥ 6 条（实际 ${laneCount}）`)
  const eraCount = await page.evaluate(() => document.querySelectorAll('.era-bucket').length)
  ok(eraCount >= 8, `时代分段 ≥ 8 个（实际 ${eraCount}）`)
  const cardCount = await page.evaluate(() => document.querySelectorAll('.card').length)
  ok(cardCount > 30, `时间轴卡片 > 30（实际 ${cardCount}）`)
  ok(text.includes('巴洛克') || text.includes('古典主义') || text.includes('浪漫主义'), '音乐史分期出现')
  const densityBars = await page.evaluate(() => document.querySelectorAll('.lane-density-bar').length)
  ok(densityBars >= 20, `密度条 ≥ 20（实际 ${densityBars}）`)

  // 打开一个详情
  const wentDetail = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.card')][0]
    if (el) {
      el.click()
      return true
    }
    return false
  })
  await wait(3000)
  const detailText = await page.evaluate(() => document.body.innerText)
  ok(wentDetail && detailText.length > 100, '时间轴卡片可打开详情')

  // 图片加载情况
  const imgStat = await page.evaluate(() => {
    const imgs = Array.from(document.images)
    let loaded = 0
    let loading = 0
    let failed = 0
    for (const i of imgs) {
      if (i.complete && i.naturalWidth > 0) loaded++
      else if (i.complete) failed++
      else loading++
    }
    return { total: imgs.length, loaded, failed, loading }
  })
  ok(imgStat.failed === 0, `无图片加载失败（失败 ${imgStat.failed}/${imgStat.total}）`)

  ok(pageErrors.length === 0, `无页面运行时错误（${pageErrors.length} 个）`)
  if (pageErrors.length > 0) console.log('  错误:', pageErrors.slice(0, 3))

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await wait(2500)
  await page.screenshot({ path: 'shot-music-timeline.png', fullPage: false })
  console.log('  截图: shot-music-timeline.png')

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`)
  process.exitCode = fail > 0 ? 1 : 0
} catch (e) {
  console.log('FAIL:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
