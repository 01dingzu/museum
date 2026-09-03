// fetch-finance-images.mjs — 为金融馆 12 件策展精品匹配 Wikimedia Commons 实拍图
// 输出：scripts/finance-images.json（供审查）
// 用法：node scripts/fetch-finance-images.mjs

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UA = 'museum-collector/1.0 (contact: https://github.com/01dingzu)'

const SEARCH = {
  'lydian-lion': 'Lydian coin',
  'athens-owl-tetradrachm': 'Athenian tetradrachm',
  'spanish-real-eight': 'Spanish dollar',
  'maria-theresa-thaler': 'Maria Theresa thaler',
  'jiaozi-note': 'Jiaozi (currency)',
  'da-ming-baochao': 'Ming dynasty banknote',
  'legion-of-honor': 'Legion of Honour',
  'victoria-cross': 'Victoria Cross',
  'krugerrand': 'Krugerrand',
  'saint-gaudens-double-eagle': 'Saint-Gaudens double eagle',
  'abacus': 'Suanpan',
  'balance-scale': 'Balance scale',
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
  const label = hit.label || ''

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
  const results = {}
  const summary = []
  let i = 0
  for (const [id, term] of Object.entries(SEARCH)) {
    i++
    try {
      const r = await resolveImage(id, term)
      results[id] = r
      summary.push({ id, status: r.status, label: r.label || '' })
    } catch (err) {
      summary.push({ id, status: 'ERR', label: err.message })
    }
    console.log(`[${String(i).padStart(2)}/${Object.keys(SEARCH).length}] ${id} => ${summary[summary.length - 1].status}${summary[summary.length - 1].label ? ' [' + summary[summary.length - 1].label + ']' : ''}`)
    await sleep(120)
  }

  await writeFile(path.join(__dirname, 'finance-images.json'), JSON.stringify(results, null, 2), 'utf8')
  console.log('\n=== 金融馆图片匹配完成 ===')
  const ok = summary.filter((s) => s.status === 'ok').length
  console.log(`成功 ${ok} / 共 ${summary.length}`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
