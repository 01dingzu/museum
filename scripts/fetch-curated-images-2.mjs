// fetch-curated-images-2.mjs — 处理第一轮失败/无图的 13 件策展展品
// 策略：多候选 Wikidata 搜索词 → 拿到 P18；仍失败则用 Wikimedia Commons 搜索兜底
// 输出：scripts/curated-images-2.json

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UA = 'museum-collector/1.0 (contact: https://github.com/01dingzu)'

// id → 候选 Wikidata 搜索词（依次尝试）→ Commons 兜底搜索词
const RETRY = {
  'sanxingdui-mask': { wd: ['Sanxingdui bronze head', 'Bronze head Sanxingdui', 'Sanxingdui'], commons: 'Sanxingdui bronze head' },
  'pakal-jade-mask': { wd: ['Jade mask of Pakal', 'Funerary mask of Pakal', 'Mask of Pakal'], commons: 'Pakal mask' },
  'nataraja-shiva': { wd: ['Shiva Nataraja', 'Nataraja bronze', 'Chola bronze Nataraja'], commons: 'Nataraja bronze' },
  'priest-king': { wd: ['Priest-King of Mohenjo-daro', 'Mohenjo-daro Priest King'], commons: 'Mohenjo-daro Priest-King' },
  'bessemer-converter': { wd: ['Bessemer converter', 'Bessemer process'], commons: 'Bessemer converter' },
  'wright-flyer': { wd: ['Wright Flyer', 'Wright Flyer I', '1903 Wright Flyer'], commons: 'Wright Flyer' },
  'morse-telegraph': { wd: ['Morse telegraph', 'Morse-Vail telegraph'], commons: 'Morse telegraph key' },
  'marconi-radio': { wd: ['Marconi radio', 'Spark-gap transmitter', 'Wireless telegraph'], commons: 'Marconi wireless telegraph' },
  'faraday-generator': { wd: ['Faraday disk', 'Faraday disc', 'Homopolar generator'], commons: 'Faraday disk' },
  'ibm-pc': { wd: ['IBM PC', 'IBM Personal Computer', 'IBM 5150'], commons: 'IBM PC 5150' },
  'general-sherman-tree': { wd: ['General Sherman tree', 'General Sherman Giant Sequoia'], commons: 'General Sherman tree' },
  'dodo-bird': { wd: ['Raphus cucullatus', 'Dodo bird'], commons: 'Dodo' },
  'star-of-india-sapphire': { wd: ['Star of India gem', 'Star of India sapphire'], commons: 'Star of India sapphire' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 429 || res.status === 502 || res.status === 503) {
      await sleep(1500 * (i + 1))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  }
  throw new Error('retry exhausted')
}

function commonsUrl(file, width) {
  const encoded = encodeURIComponent(file.replace(/ /g, '_'))
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`
}

// Wikidata：按候选词找 QID + P18
async function viaWikidata(terms) {
  for (const term of terms) {
    const s = await fetchJson(
      'https://www.wikidata.org/w/api.php?action=wbsearchentities' +
        `&search=${encodeURIComponent(term)}&language=en&type=item&limit=3&format=json&origin=*`,
    )
    for (const hit of s.search || []) {
      const qid = hit.id
      const e = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`)
      const p18 = e.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
      if (p18) return { file: p18, via: `wikidata:${qid}:${hit.label || ''}` }
    }
    await sleep(100)
  }
  return null
}

// Commons 兜底：搜索 File 命名空间
async function viaCommons(term) {
  const j = await fetchJson(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      `&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&srlimit=5&origin=*`,
  )
  const results = j.query?.search || []
  for (const r of results) {
    const title = r.title
    if (!title.startsWith('File:')) continue
    const file = title.slice(5)
    // 跳过明显不合适的（SVG 图表、地图等）
    if (/\.(svg|pdf|tif|tiff|ogg|ogv|webm|stl)$/i.test(file)) continue
    return { file, via: `commons:${file}` }
  }
  return null
}

async function main() {
  const out = {}
  for (const [id, cfg] of Object.entries(RETRY)) {
    let got = await viaWikidata(cfg.wd).catch(() => null)
    if (!got) got = await viaCommons(cfg.commons).catch(() => null)
    if (got) {
      out[id] = {
        status: 'ok',
        via: got.via,
        commonsFile: got.file,
        imageUrl: commonsUrl(got.file, 800),
        imageLarge: commonsUrl(got.file, 1600),
        source: 'Wikimedia Commons',
        sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(got.file.replace(/ /g, '_'))}`,
      }
    } else {
      out[id] = { status: 'fail' }
    }
    process.stderr.write(`${got ? 'OK ' : '  !'} ${id} => ${got ? got.via : 'FAIL'}\n`)
  }

  await writeFile(path.join(__dirname, 'curated-images-2.json'), JSON.stringify(out, null, 2), 'utf8')
  const ok = Object.values(out).filter((r) => r.status === 'ok').length
  console.log(`\n补充匹配成功 ${ok} / ${Object.keys(out).length}`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
