/**
 * smoke-cdp.mjs — museum 渲染冒烟（零依赖，直连 CDP）
 *
 * 覆盖：首页特别展区入口 → 革命主轴（渲染+交互）→ 年表长廊（柱状图+分桶）
 *       → 艺术家长厅（镇馆墙+艺术家作品集）→ 工业馆去伪开关 → 运行时异常
 *
 * 运行: node scripts/smoke-cdp.mjs   （退出码 0 = 全绿）
 * 报告: scripts/smoke-report-<ts>.txt
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const REPORT = join(dirname(fileURLToPath(import.meta.url)), `smoke-report-${Date.now()}.txt`)

process.on('uncaughtException', (e) => {
  writeFileSync(REPORT, 'UNCAUGHT: ' + (e?.stack || String(e)), 'utf8')
  process.exit(3)
})
process.on('unhandledRejection', (e) => {
  writeFileSync(REPORT, 'UNHANDLED: ' + String(e), 'utf8')
  process.exit(3)
})
// 看门狗：无论如何 120s 内必须出报告
const watchdog = setTimeout(() => {
  writeFileSync(REPORT, 'WATCHDOG TIMEOUT', 'utf8')
  process.exit(3)
}, 120_000)

const results = []
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra })
  return !!cond
}

/* ---------- 静态服务（dist） ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = normalize(join(DIST, p))
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return }
  if (!existsSync(file) || p.endsWith('/')) file = join(DIST, 'index.html')
  try {
    const body = readFileSync(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('nf')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
const BASE_URL = `http://127.0.0.1:${PORT}/`

/* ---------- 启动 Chrome ---------- */
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const browserPath = candidates.find((c) => existsSync(c))
if (!browserPath) { writeFileSync(REPORT, 'NO BROWSER FOUND', 'utf8'); process.exit(3) }

const userDir = mkdtempSync(join(tmpdir(), 'museum-smoke-'))
const chrome = spawn(browserPath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeErr = ''
chrome.stderr.on('data', (d) => { chromeErr += d })

// 等待 DevToolsActivePort
let wsPort = null
for (let i = 0; i < 50 && !wsPort; i++) {
  await new Promise((r) => setTimeout(r, 200))
  try {
    const f = join(userDir, 'DevToolsActivePort')
    if (existsSync(f)) wsPort = readFileSync(f, 'utf8').split('\n')[0].trim()
  } catch {}
}
if (!wsPort) { writeFileSync(REPORT, 'NO CDP PORT. stderr:\n' + chromeErr, 'utf8'); chrome.kill(); process.exit(3) }

/* ---------- CDP 连接 ---------- */
const targets = await (await fetch(`http://127.0.0.1:${wsPort}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })

let msgId = 0
const pending = new Map()
let runtimeErrors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(JSON.stringify(m.params?.exceptionDetails?.exception?.description || m.params).slice(0, 300))
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') runtimeErrors.push('log:' + String(m.params.entry.text).slice(0, 200))
}
const send = (method, params = {}) =>
  new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || 'eval error' }
  return r.result?.result?.value
}

async function nav(url) {
  await send('Page.navigate', { url })
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const s = await evaluate(`document.readyState + '|' + location.pathname`)
    if (String(s).includes('complete')) break
  }
  await sleep(300)
}

const clickBySelector = async (sel) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'missing';el.click();return 'clicked'})()`)
const clickByText = async (text, scopeSel = 'button, .card, .hall-card, .special-card') =>
  evaluate(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(scopeSel)})];const el=els.find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!el)return 'missing';el.click();return 'clicked'})()`)

/* ---------- 开始断言 ---------- */

// A. 首页
await nav(BASE_URL)
await sleep(800)
const bodyLen = await evaluate(`document.body.innerText.length`)
ok('A1 首页非白屏', bodyLen > 200, `len=${bodyLen}`)
ok('A2 首页含"特别展区"', (await evaluate(`document.body.innerText.includes('特别展区')`)) === true)
ok('A3 三张特别展卡', (await evaluate(`document.querySelectorAll('.special-card').length`)) === 3)
ok('A4 六馆卡片齐全', (await evaluate(`document.querySelectorAll('.hall-card').length`)) === 6)

// B. 革命主轴
ok('B1 进入革命主轴', (await clickByText('革命主轴', '.special-card')) === 'clicked')
await sleep(1200)
ok('B2 四条泳道', (await evaluate(`document.querySelectorAll('.rev-lane').length`)) === 4)
ok('B3 19 个节点', (await evaluate(`document.querySelectorAll('.rev-node').length`)) === 19)
ok('B4 珍妮纺纱机在轴上', (await evaluate(`document.body.innerText.includes('珍妮纺纱机')`)) === true)
ok('B5 IBM PC 在轴上', (await evaluate(`document.body.innerText.includes('IBM PC')`)) === true)
// 点击节点 → 详情页
ok('B6 点击节点进详情', (await clickByText('珍妮纺纱机', '.rev-node')) === 'clicked')
await sleep(1500)
ok('B7 详情页出现（返回按钮）', (await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('返回'))`)) === true)
// 回首页：直接找 navigateHome 按钮（breadcrumb"首页"或"← 返回首页"）
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')];const t=b.find(x=>x.textContent.includes('返回首页'))||b.find(x=>x.textContent.trim()==='首页');if(t)t.click();})()`)
await sleep(800)
ok('B8 回到首页', (await evaluate(`document.querySelectorAll('.special-card').length`)) === 3)

// C. 年表长廊
ok('C1 进入年表长廊', (await clickByText('年表长廊', '.special-card')) === 'clicked')
await sleep(1500)
const bars = await evaluate(`document.querySelectorAll('.anti-bar').length`)
ok('C2 概览柱状图（≥10 个时代桶）', bars >= 10, `bars=${bars}`)
ok('C3 断代说明文案', (await evaluate(`document.body.innerText.includes('已排入年表')`)) === true)
// 点最高的一根柱
ok('C4 点击柱子', (await evaluate(`(()=>{const bars=[...document.querySelectorAll('.anti-bar')];const t=bars.reduce((a,b)=>(+b.style.height.replace('px','')||0)>(+a.style.height.replace('px','')||0)?b:a);t.click();return 'clicked'})()`)) === 'clicked')
await sleep(900)
const antiCards = await evaluate(`document.querySelectorAll('.exhibits-grid .card').length`)
ok('C5 桶内展品网格出现', antiCards > 0, `cards=${antiCards}`)
ok('C6 返回全览按钮', (await evaluate(`!!document.querySelector('.anti-back')`)) === true)

// D. 艺术家长厅
await nav(BASE_URL); await sleep(800)
ok('D1 进入艺术家长厅', (await clickByText('艺术家长厅', '.special-card')) === 'clicked')
await sleep(1500)
ok('D2 镇馆之墙出现', (await evaluate(`document.body.innerText.includes('镇馆之墙')`)) === true)
const masterCount = await evaluate(`document.querySelectorAll('.art-masterwall .card').length`)
ok('D3 镇馆墙 12 件', masterCount === 12, `got=${masterCount}`)
const artistCards = await evaluate(`document.querySelectorAll('.artist-card').length`)
ok('D4 艺术家卡片 ≥ 45', artistCards >= 45, `got=${artistCards}`)
ok('D5 丢勒在列', (await evaluate(`document.body.innerText.includes('丢勒')`)) === true)
// 点开丢勒
ok('D6 打开艺术家作品集', (await clickByText('丢勒', '.artist-card')) === 'clicked')
await sleep(900)
const works = await evaluate(`document.querySelectorAll('.exhibits-grid .card').length`)
ok('D7 丢勒作品 ≥ 100', works >= 100, `works=${works}`)
ok('D8 返回长厅', (await clickByText('返回长厅')) === 'clicked')
await sleep(500)

// E. 工业馆去伪开关
await nav(BASE_URL); await sleep(800)
await evaluate(`[...document.querySelectorAll('.hall-card')].find(e=>e.textContent.includes('工业')).click()`)
await sleep(1500)
const dirBtn = await evaluate(`(()=>{const b=document.querySelector('.dir-toggle');return b?b.textContent.replace(/\\s+/g,' '):'missing'})()`)
ok('E1 去伪开关存在', String(dirBtn).includes('隐藏目录条目'), `btn=${dirBtn}`)
const totalOf = () => evaluate(`(()=>{const s=document.querySelector('.load-more span')?.textContent||'';const m=s.match(/\\/\\s*([\\d,]+)/);return m?+m[1].replace(/,/g,''):-1})()`)
const before = await totalOf()
await clickBySelector('.dir-toggle')
await sleep(600)
const after = await totalOf()
const dbg = await evaluate(`(()=>{const b=document.querySelector('.dir-toggle');return JSON.stringify({btn:b?b.textContent.trim().slice(0,10):'gone',loadmore:document.querySelector('.load-more span')?.textContent?.trim().slice(0,40)||'none',flags:window.__flagProbe||null})})()`)
ok('E2 开启后馆藏总数减少', after > 0 && after < before, `before=${before} after=${after} dbg=${dbg}`)

// F. 运行时异常
const realErrors = runtimeErrors.filter((e) => !/favicon|Failed to load resource|net::|weserv|wikimedia|weserv\.nl/i.test(e))
ok('F1 无未捕获运行时异常', realErrors.length === 0, realErrors.slice(0, 3).join(' || '))

/* ---------- 收尾 ---------- */
clearTimeout(watchdog)
ws.close()
chrome.kill()
server.close()
setTimeout(() => {
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}, 800)

const passed = results.filter((r) => r.pass).length
const failed = results.length - passed
const lines = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  [' + r.extra + ']'}`)
lines.push('')
lines.push(`通过 ${passed}/${results.length}`)
lines.push(`页面文本节选（最后导航页前 300 字）: 略`)
writeFileSync(REPORT, lines.join('\n'), 'utf8')
console.log(`SMOKE ${passed}/${results.length} pass, ${failed} fail -> ${REPORT}`)
process.exit(failed === 0 ? 0 : 1)
