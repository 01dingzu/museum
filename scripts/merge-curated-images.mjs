// merge-curated-images.mjs — 合并两轮匹配结果 + 人工修正，生成最终图片映射
// 输出：scripts/curated-images-map.json（{ id: {imageUrl, imageLarge, source, sourceUrl} }）

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 人工修正：8 件「第一/二轮匹配到错误图或非实拍图」→ 换成正确实拍图（Commons 文件名）
const OVERRIDES = {
  'bell-telephone': 'Bell "iron box" telephone receiver 1876.jpg',
  'rocket-locomotive': 'Stephenson Rocket at the National Railway Museum York Oct25 04.jpg',
  'aztec-sun-stone': 'Aztec sun stone - National Museum of Antropology - Mexico 2024.jpg',
  'spinning-jenny': 'Spinning jenny.jpg',
  'faraday-generator': 'Faraday disk - National Museum of Nature and Science, Tokyo - DSC07366.JPG',
  'morse-telegraph': 'Morse Telegraph 1837.jpg',
  'otto-engine': 'Otto four-stroke-cycle internal combustion engine.jpg',
  'edison-light-bulb': 'Thomas Edison Lightbulbs 1879-1880.jpg',
  // 金融馆：P18 匹配失败/非实拍 → 手工指定 Commons 实拍图
  'athens-owl-tetradrachm': 'Athens - 454-404 BC - silver tetradrachm - head of Athena - owl - München SMS.jpg',
  'victoria-cross': 'Victoria Cross and medal group of Arthur Kilby at the Lord Ashcroft Gallery, Imperial War Museum, London, June 2023.jpg',
  'da-ming-baochao': 'British Museum Ming banknote.jpg',
  'jiaozi-note': 'Jiao zi.jpg',
  'lydian-lion': 'Electrum trite, Alyattes, Lydia, 620-563 BC.jpg',
}

function commonsUrl(file, width) {
  const encoded = encodeURIComponent(file.replace(/ /g, '_'))
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`
}

function toEntry(file) {
  return {
    imageUrl: commonsUrl(file, 800),
    imageLarge: commonsUrl(file, 1600),
    source: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
  }
}

async function main() {
  const round1 = JSON.parse(await readFile(path.join(__dirname, 'curated-images.json'), 'utf8'))
  const round2 = JSON.parse(await readFile(path.join(__dirname, 'curated-images-2.json'), 'utf8'))
  let financeRound = {}
  try {
    financeRound = JSON.parse(await readFile(path.join(__dirname, 'finance-images.json'), 'utf8'))
  } catch (_e) {
    console.error('（finance-images.json 不存在，跳过金融馆图片）')
  }

  const map = {}

  // 第一轮
  for (const [id, r] of Object.entries(round1)) {
    if (r.status === 'ok' && r.commonsFile) map[id] = toEntry(r.commonsFile)
  }
  // 第二轮覆盖/补充
  for (const [id, r] of Object.entries(round2)) {
    if (r.status === 'ok' && r.commonsFile) map[id] = toEntry(r.commonsFile)
  }
  // 金融馆（Wikidata P18 匹配）
  for (const [id, r] of Object.entries(financeRound)) {
    if (r.status === 'ok' && r.commonsFile) map[id] = toEntry(r.commonsFile)
  }
  // 人工修正
  for (const [id, file] of Object.entries(OVERRIDES)) {
    map[id] = toEntry(file)
  }

  await writeFile(path.join(__dirname, 'curated-images-map.json'), JSON.stringify(map, null, 2), 'utf8')
  console.log(`最终映射：${Object.keys(map).length} 件`)
  const missing = ['rosetta-stone', 'tutankhamun-mask', 'nefertiti-bust', 'code-of-hammurabi', 'standard-of-ur',
    'ishtar-gate', 'parthenon-marbles', 'venus-de-milo', 'winged-victory', 'terracotta-army', 'houmuwu-ding',
    'yuewang-goujian-sword', 'sanxingdui-mask', 'aztec-sun-stone', 'pakal-jade-mask', 'moai-hoa-hakananaia',
    'ashoka-pillar', 'nataraja-shiva', 'priest-king', 'spinning-jenny', 'watt-steam-engine', 'rocket-locomotive',
    'bessemer-converter', 'otto-engine', 'benz-patent-motorwagen', 'ford-model-t', 'wright-flyer', 'morse-telegraph',
    'bell-telephone', 'edison-phonograph', 'marconi-radio', 'faraday-generator', 'edison-light-bulb', 'tesla-coil',
    'sputnik-1', 'eniac', 'apollo-guidance-computer', 'ibm-pc', 'hope-diamond', 'sue-trex', 'lucy-australopithecus',
    'allende-meteorite', 'general-sherman-tree', 'dodo-bird', 'blue-whale', 'titanosaur-patagotitan',
    'star-of-india-sapphire', 'peking-man', 'megalodon-tooth', 'wollemi-pine', 'lydian-lion',
    'athens-owl-tetradrachm', 'spanish-real-eight', 'maria-theresa-thaler', 'jiaozi-note', 'da-ming-baochao',
    'legion-of-honor', 'victoria-cross', 'krugerrand', 'saint-gaudens-double-eagle', 'abacus', 'balance-scale'].filter((id) => !map[id])
  if (missing.length) console.log('缺图：', missing)
  else console.log(`${Object.keys(map).length} 件全部有图 ✓`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
