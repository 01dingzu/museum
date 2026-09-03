// fetch-curated-images.mjs — 为策展精品（builtInExhibits）批量匹配 Wikimedia Commons 实拍图
// 流程：
//   1. 从 src/data/exhibits.ts 提取策展展品
//   2. 按 id → 英文搜索词映射，用 Wikidata wbsearchentities 找到 QID
//   3. 用 Special:EntityData/{QID}.json 取 claims.P18（代表性图片）的 Commons 文件名
//   4. 生成 imageUrl（800px）+ imageLarge（1600px）+ source/sourceUrl
// 输出：scripts/curated-images.json 供审查；并打印匹配摘要表
//
// 用法：node scripts/fetch-curated-images.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const UA = 'museum-collector/1.0 (contact: https://github.com/01dingzu)'

// id → Wikidata 英文搜索词（用于精确定位条目）
const SEARCH = {
  // 古物馆
  'rosetta-stone': 'Rosetta Stone',
  'tutankhamun-mask': 'Mask of Tutankhamun',
  'nefertiti-bust': 'Nefertiti Bust',
  'code-of-hammurabi': 'Code of Hammurabi',
  'standard-of-ur': 'Standard of Ur',
  'ishtar-gate': 'Ishtar Gate',
  'parthenon-marbles': 'Elgin Marbles',
  'venus-de-milo': 'Venus de Milo',
  'winged-victory': 'Winged Victory of Samothrace',
  'terracotta-army': 'Terracotta Army',
  'houmuwu-ding': 'Houmuwu ding',
  'yuewang-goujian-sword': 'Sword of Goujian',
  'sanxingdui-mask': 'Sanxingdui bronze heads',
  'aztec-sun-stone': 'Aztec sun stone',
  'pakal-jade-mask': "Mask of K'inich Janaab' Pakal",
  'moai-hoa-hakananaia': "Hoa Hakananai'a",
  'ashoka-pillar': 'Lion Capital of Ashoka',
  'nataraja-shiva': 'Nataraja',
  'priest-king': 'Priest-king (sculpture)',
  // 工业科学馆
  'spinning-jenny': 'Spinning jenny',
  'watt-steam-engine': 'Watt steam engine',
  'rocket-locomotive': "Stephenson's Rocket",
  'bessemer-converter': 'Bessemer converter',
  'otto-engine': 'Otto engine',
  'benz-patent-motorwagen': 'Benz Patent-Motorwagen',
  'ford-model-t': 'Ford Model T',
  'wright-flyer': 'Wright Flyer',
  'morse-telegraph': 'Morse key',
  'bell-telephone': 'Bell telephone',
  'edison-phonograph': 'Edison phonograph',
  'marconi-radio': "Marconi's wireless telegraph apparatus",
  'faraday-generator': 'Faraday disk',
  'edison-light-bulb': 'Incandescent light bulb',
  'tesla-coil': 'Tesla coil',
  'sputnik-1': 'Sputnik 1',
  'eniac': 'ENIAC',
  'apollo-guidance-computer': 'Apollo Guidance Computer',
  'ibm-pc': 'IBM Personal Computer 5150',
  // 自然科学馆
  'hope-diamond': 'Hope Diamond',
  'sue-trex': 'Sue (dinosaur)',
  'lucy-australopithecus': 'Lucy (Australopithecus)',
  'allende-meteorite': 'Allende meteorite',
  'general-sherman-tree': 'General Sherman (tree)',
  'dodo-bird': 'Dodo',
  'blue-whale': 'Blue whale',
  'titanosaur-patagotitan': 'Patagotitan',
  'star-of-india-sapphire': 'Star of India (gem)',
  'peking-man': 'Peking Man',
  'megalodon-tooth': 'Megalodon',
  'wollemi-pine': 'Wollemia',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 429 || res.status === 502 || res.status === 503) {
      await sleep(1500 * (i + 1))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.json()
  }
  throw new Error(`retry exhausted for ${url}`)
}

async function extractCurated() {
  const src = await readFile(path.join(ROOT, 'src', 'data', 'exhibits.ts'), 'utf8')
  let code = src.replace(/import[^\n]*\n/, '')
  code = code.replace('export const builtInExhibits: Exhibit[] =', 'const builtInExhibits =')
  const ctx = {}
  vm.createContext(ctx)
  vm.runInContext(code + '\n;this.__result = builtInExhibits;', ctx)
  return ctx.__result
}

function commonsUrl(file, width) {
  const encoded = encodeURIComponent(file.replace(/ /g, '_'))
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`
}

async function resolveImage(id, term) {
  const searchUrl =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities' +
    `&search=${encodeURIComponent(term)}&language=en&type=item&limit=1&format=json&origin=*`
  const s = await fetchJson(searchUrl)
  const hit = s.search?.[0]
  if (!hit) return { id, term, status: 'no-hit' }
  const qid = hit.id
  const label = hit.label || hit.match?.text || ''

  const entUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
  const e = await fetchJson(entUrl)
  const claims = e.entities?.[qid]?.claims
  const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value
  if (!p18) return { id, term, qid, label, status: 'no-image' }

  const file = p18
  return {
    id,
    term,
    qid,
    label,
    status: 'ok',
    commonsFile: file,
    imageUrl: commonsUrl(file, 800),
    imageLarge: commonsUrl(file, 1600),
    source: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
  }
}

async function main() {
  const curated = await extractCurated()
  const results = {}
  const summary = []
  let i = 0
  for (const ex of curated) {
    i++
    const term = SEARCH[ex.id]
    if (!term) {
      summary.push({ id: ex.id, name: ex.name, status: 'NO-TERM' })
      continue
    }
    try {
      const r = await resolveImage(ex.id, term)
      results[ex.id] = r
      summary.push({ id: ex.id, name: ex.name, status: r.status, label: r.label || '', qid: r.qid || '' })
    } catch (err) {
      summary.push({ id: ex.id, name: ex.name, status: 'ERR', label: err.message })
    }
    process.stderr.write(`\r[${String(i).padStart(2)}/${curated.length}] ${ex.name} => ${summary[summary.length - 1].status}`)
    await sleep(120)
  }
  process.stderr.write('\n\n')

  await writeFile(path.join(__dirname, 'curated-images.json'), JSON.stringify(results, null, 2), 'utf8')

  // 打印摘要表
  console.log('\n=== 匹配摘要 ===')
  for (const s of summary) {
    const flag = s.status === 'ok' ? 'OK ' : '  !'
    console.log(`${flag} ${s.id.padEnd(26)} ${s.name.padEnd(20)} ${s.status}${s.label ? '  [' + s.label + ']' : ''}`)
  }
  const ok = summary.filter((s) => s.status === 'ok').length
  const fail = summary.filter((s) => s.status !== 'ok').length
  console.log(`\n成功 ${ok} / 失败 ${fail} / 共 ${summary.length}`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
