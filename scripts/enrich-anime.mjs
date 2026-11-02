// enrich-anime.mjs — 动漫馆补采与修复
// 修复三件事：
//   1. 用替代搜索词重新定位未命中的种子（Max und Moritz / Yellow Kid / Felix 等），
//      P18 缺失时退回 P373（Commons 分类）取首图
//   2. 早期动画批量：直接用 Q202866（animated film），日期过滤放到 JS（SPARQL 里过滤会超时）
//   3. Commons 分类枚举补页（北斋漫画 / 麦克斯与莫里茨 / 小尼莫 / 疯狂猫 / 威利号汽船…）
//
// 用法：node scripts/enrich-anime.mjs
// 输出：public/data/anime.json（原地更新）

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, '..', 'public', 'data', 'anime.json')
const WD = 'https://www.wikidata.org/w/api.php'
const SPARQL = 'https://query.wikidata.org/sparql'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const UA = { 'User-Agent': 'museum-anime-collector/1.0 (personal, non-commercial)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)
const bv = (b) => b?.value || ''
const yearOfTime = (tv) => {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(tv)
  if (!m) return null
  const y = parseInt(m[2], 10)
  return m[1] === '-' ? -y : y
}

function proxiedUrl(filenameOrUrl, width) {
  let name = String(filenameOrUrl || '')
  // P18 经 SPARQL 返回的是完整 URL（Special:FilePath 形态），需先归一化取出文件名
  if (/^https?:/i.test(name)) {
    const norm = name.replace(/%3A/gi, ':').replace(/%2F/gi, '/')
    let idx = norm.lastIndexOf('Special:FilePath/')
    if (idx < 0) idx = norm.lastIndexOf('/File:')
    if (idx < 0) return ''
    name = norm.slice(idx).replace(/^Special:FilePath\//i, '').replace(/^\/File:/i, '')
    try {
      name = decodeURIComponent(name)
    } catch { /* 已是明文 */ }
  }
  const safe = name.replace(/ /g, '_')
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(safe)}?width=${width}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
}

async function searchEntity(term) {
  const url = `${WD}?action=wbsearchentities&format=json&limit=5&language=en&search=${encodeURIComponent(term)}`
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.search?.[0]?.id || null
    } catch {
      await sleep(3000 * (i + 1))
    }
  }
  return null
}

async function getEntities(qids) {
  const map = new Map()
  for (let i = 0; i < qids.length; i += 40) {
    const batch = qids.slice(i, i + 40)
    const url = `${WD}?action=wbgetentities&format=json&props=labels|claims&ids=${batch.join('|')}&languages=zh|en`
    try {
      const res = await fetch(url, { headers: UA })
      const data = await res.json()
      for (const [qid, ent] of Object.entries(data.entities || {})) {
        map.set(qid, ent)
      }
    } catch (err) {
      log(`实体批失败：${err.message}`)
    }
    await sleep(800)
  }
  return map
}

// Commons API 防限流封装：返回非 JSON（通常是「You are making too many requests」）时退避重试
async function commonsJson(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.startsWith('{')) {
        // 命中限流页
        await sleep(15000 * (i + 1))
        continue
      }
      return JSON.parse(text)
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(10000 * (i + 1))
    }
  }
  throw new Error('Commons 限流重试耗尽')
}

async function commonsFirstImage(cat) {
  try {
    const url = `${COMMONS}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmtype=file&cmlimit=50&format=json`
    const data = await commonsJson(url)
    for (const m of data.query?.categorymembers || []) {
      const title = m.title.replace(/^File:/, '')
      if (/\.(jpe?g|png|gif|tiff?)$/i.test(title)) return title
    }
  } catch (err) {
    log(`Commons 分类 ${cat} 失败：${err.message}`)
  }
  return null
}

async function commonsCategoryFiles(cat, maxFiles = 300) {
  const files = []
  const cats = [cat]
  try {
    const data = await commonsJson(
      `${COMMONS}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmtype=subcat&cmlimit=100&format=json`,
    )
    for (const m of data.query?.categorymembers || []) cats.push(m.title.replace(/^Category:/, ''))
  } catch { /* 只扫本体 */ }
  for (const c of cats) {
    if (files.length >= maxFiles) break
    try {
      const data = await commonsJson(
        `${COMMONS}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(c)}&cmtype=file&cmlimit=500&format=json`,
      )
      for (const m of data.query?.categorymembers || []) {
        if (files.length >= maxFiles) break
        const title = m.title.replace(/^File:/, '')
        if (!/\.(jpe?g|png|gif|tiff?)$/i.test(title)) continue
        files.push(title)
      }
    } catch (err) {
      log(`Commons 分类 ${c} 失败：${err.message}`)
    }
    await sleep(2500)
  }
  return files
}

async function runSparql(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(SPARQL, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
        body: query,
      })
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503) {
        await sleep(8000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(5000 * (i + 1))
    }
  }
  return []
}

// ============ PHASE A：修复未命中 / 无图的种子 ============
// id 与 collect-anime.mjs 中的 slug 保持一致，原地更新
const FIXES = [
  { id: 'anime-seed-ch-j-jinbutsu-giga', cat: 'scroll', icon: '📜', terms: ['Choju Jinbutsu Giga', 'Chōjū-jinbutsu-giga'],
    zh: '鸟兽人物戏画', year: 1053, origin: '日本 · 京都高山寺', commonsCat: 'Chōjū-jinbutsu-giga',
    desc: '俗称「鸟兽戏画」，甲乙丙丁四卷动物拟人水墨画卷，被视为日本漫画的远祖。',
    tags: ['绘卷', '鸟兽戏画', '高山寺'] },
  { id: 'anime-seed-t-kaid-ch-hizakurige', cat: 'ukiyo', icon: '🌊', terms: ['Tokaidochu Hizakurige', 'Tōkaidōchō Hizakurige', "Shank's Mare"],
    zh: '东海道中膝栗毛', year: 1802, origin: '日本 · 江户',
    desc: '十返舍一九的滑稽旅行记，弯兵卫与喜多八的连环笑闹令「膝栗毛」成为漫才式叙事的代名词。',
    tags: ['滑稽本', '十返舍一九'] },
  { id: 'anime-seed-histoire-de-m-jabot', cat: 'strips', icon: '🖋️', terms: ['Histoire de monsieur Jabot', 'Monsieur Jabot', 'Histoire de M. Jabot'],
    zh: '雅波先生', year: 1835, origin: '瑞士 · 日内瓦',
    desc: '托普弗的笔迹分格漫画，比《老布先生》更早付印，连环叙事的最早实验之一。',
    tags: ['连环画', '托普弗'] },
  { id: 'anime-seed-max-and-moritz', cat: 'strips', icon: '🖋️', terms: ['Max und Moritz', 'Max and Moritz'],
    zh: '麦克斯与莫里茨', year: 1865, origin: '德国', commonsCat: 'Max und Moritz',
    desc: '威廉·布施的七段式恶作剧连环诗画，直接启发了《捣蛋鬼》与整个美式儿童连环漫画。',
    tags: ['连环画', '威廉·布施'] },
  { id: 'anime-seed-the-yellow-kid', cat: 'strips', icon: '🖋️', terms: ['Yellow Kid', 'The Yellow Kid'],
    zh: '黄孩子', year: 1895, origin: '美国 · 纽约《世界报》', commonsCat: 'The Yellow Kid',
    desc: '奥特考特笔下的黄睡衣男孩，史上第一个带固定气泡的报纸漫画明星，「黄色新闻」一词也由此而来。',
    tags: ['报纸连环画', '黄孩子'] },
  { id: 'anime-seed-little-nemo', cat: 'strips', icon: '🖋️', terms: ['Little Nemo'],
    zh: '小尼莫梦乡历险记', year: 1905, origin: '美国 · 《纽约先驱报》', commonsCat: 'Little Nemo in Slumberland',
    desc: '温瑟·麦凯的周日全彩梦境漫画，Art Nouveau 式构图是漫画史公认的美术巅峰之一。',
    tags: ['温瑟·麦凯', '周日漫画', '全彩'] },
  { id: 'anime-seed-krazy-kat', cat: 'strips', icon: '🖋️', terms: ['Krazy Kat'],
    zh: '疯狂猫', year: 1913, origin: '美国', commonsCat: 'Krazy Kat',
    desc: '乔治·赫里曼的超现实爱情三角（猫·鼠·狗），被评论界尊为诗意漫画的最高范本。',
    tags: ['赫里曼', '超现实'] },
  { id: 'anime-seed-chikara-to-onna-no-yo-no-naka', cat: 'animation', icon: '🎬', terms: ['Chikara to Onna no Yo no Naka', 'Chikara to Onna no Yo no Naka (1933 film)'],
    zh: '力与世间女子', year: 1933, origin: '日本 · 政冈宪三',
    desc: '日本第一部有声动画短片，政冈宪三工作室出品，确立了日本动画的角色表演传统。',
    tags: ['政冈宪三', '日本有声动画开端'] },
  { id: 'anime-seed-momotaro-sacred-sailors', cat: 'animation', icon: '🎬', terms: ["Momotaro's Divine Sea Warriors", 'Momotaro Umi no Shinpei', 'Momotaro: Sacred Sailors'],
    zh: '桃太郎 海之神兵', year: 1945, origin: '日本 · 海军省',
    desc: '濑尾光世导演的日本第一部动画长片，战后进入公有领域，深刻影响了手冢治虫。',
    tags: ['濑尾光世', '日本首部动画长片', '影响手冢治虫'] },
  { id: 'anime-seed-felix-the-cat', cat: 'characters', icon: '🐱', terms: ['Felix the Cat'],
    zh: '菲利克斯猫', year: 1919, origin: '美国 · 派特·苏利文', commonsCat: 'Felix the Cat',
    desc: '默片时代的第一个动画巨星（早于米奇十年），思考用思考泡泡、走路用尾巴——卡通的「性格」由此定义。',
    tags: ['菲利克斯猫', '默片动画巨星'] },
  { id: 'anime-seed-koko-the-clown', cat: 'characters', icon: '🤡', terms: ['Koko the Clown'],
    zh: '小丑科科', year: 1916, origin: '美国 · 弗莱舍兄弟', commonsCat: 'Koko the Clown',
    desc: '从真人转描走出的第一个「活」的动画角色。',
    tags: ['科科', '弗莱舍'] },
]

const items = JSON.parse(readFileSync(FILE, 'utf8'))
const byId = new Map(items.map((e) => [e.id, e]))

async function fixSeeds() {
  const qids = []
  for (const f of FIXES) {
    let qid = null
    for (const t of f.terms) {
      qid = await searchEntity(t)
      if (qid) break
      await sleep(500)
    }
    log(`修复「${f.zh}」→ ${qid ?? '仍未命中'}`)
    qids.push(qid)
    await sleep(500)
  }
  const valid = qids.filter(Boolean)
  const entMap = await getEntities(valid)

  let patched = 0
  for (const [idx, f] of FIXES.entries()) {
    // 已有图的种子跳过（幂等：重跑不丢图）
    const prev = byId.get(f.id)
    if (prev?.imageUrl) {
      log(`跳过（已有图）：${f.zh}`)
      continue
    }
    const qid = qids[idx]
    const ent = qid ? entMap.get(qid) : null
    const claims = ent?.claims || {}
    let year = null
    for (const c of claims.P571 || []) {
      const y = yearOfTime(c?.mainsnak?.datavalue?.value?.time)
      if (y != null && (year == null || y < year)) year = y
    }
    for (const c of claims.P577 || []) {
      const y = yearOfTime(c?.mainsnak?.datavalue?.value?.time)
      if (y != null && (year == null || y < year)) year = y
    }
    let img = null
    for (const c of claims.P18 || []) {
      img = c?.mainsnak?.datavalue?.value
      if (img) break
    }
    // P18 缺失 → P373 Commons 分类首图
    let cat = null
    if (!img) {
      for (const c of claims.P373 || []) {
        cat = c?.mainsnak?.datavalue?.value
        if (cat) break
      }
      cat = cat || f.commonsCat
      if (cat) {
        img = await commonsFirstImage(cat)
        if (img) log(`  「${f.zh}」从 Commons 分类「${cat}」取首图：${img}`)
      }
    }
    if (year == null) year = f.year
    const item = {
      id: f.id,
      hall: 'anime',
      categoryId: f.cat,
      name: f.zh,
      origin: f.origin,
      era: year < 1868 ? '近世' : '近代',
      date: `${year}`,
      year,
      location: '',
      collection: 'Wikidata / Wikimedia Commons',
      dimensions: '',
      material: '',
      description: f.desc,
      tags: f.tags,
      icon: f.icon,
      ...(img ? {
        imageUrl: proxiedUrl(img, 600),
        imageLarge: proxiedUrl(img, 1200),
      } : {}),
      source: 'Wikidata',
      ...(qid ? { sourceUrl: `https://www.wikidata.org/wiki/${qid}` } : {}),
    }
    if (byId.has(f.id)) {
      items[items.findIndex((e) => e.id === f.id)] = item
    } else {
      items.push(item)
      byId.set(f.id, item)
    }
    if (img) patched++
    else log(`  ⚠️「${f.zh}」仍无图`)
  }
  log(`种子修复完成：${patched}/${FIXES.length} 有图`)
}

// ============ PHASE B：早期动画批量（Q202866 直查 + JS 日期过滤） ============
async function bulkAnimation() {
  const query = `SELECT DISTINCT ?item ?itemLabel ?img ?date WHERE {
    ?item wdt:P31/wdt:P279* wd:Q202866 .
    ?item wdt:P18 ?img .
    OPTIONAL { ?item wdt:P577 ?date }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
  } LIMIT 800`
  let rows = []
  try {
    rows = await runSparql(query)
  } catch (err) {
    log(`早期动画批量失败：${err.message}`)
    return
  }
  const ids = new Set(items.map((e) => e.id))
  let added = 0
  for (const b of rows) {
    const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
    const id = `anime-wiki-${qid}`
    if (ids.has(id)) continue
    const year = yearOfTime(bv(b.date))
    // JS 侧过滤：只收 1930 年前上映的（P577 缺失的一并放过——种子兜底类）
    if (year != null && year >= 1930) continue
    const name = bv(b.itemLabel) || qid
    const img = bv(b.img)
    if (!img || !name) continue
    items.push({
      id,
      hall: 'anime',
      categoryId: 'animation',
      name,
      origin: '',
      era: year == null ? '' : '近代',
      date: year == null ? '' : `${year}`,
      year: year ?? undefined,
      location: '',
      collection: 'Wikidata / Wikimedia Commons',
      dimensions: '',
      material: '',
      description: `${name}（早期动画电影）。公版时期的动画作品影像资料。`,
      tags: ['早期动画', name],
      icon: '🎬',
      imageUrl: proxiedUrl(img, 600),
      imageLarge: proxiedUrl(img, 1200),
      source: 'Wikidata',
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
    })
    ids.add(id)
    added++
  }
  log(`早期动画批量：+${added} 件（命中 ${rows.length} 行）`)
}

// ============ PHASE C：Commons 分类枚举补页 ============
const COMMONS_LANES = [
  { cat: 'Hokusai manga', categoryId: 'ukiyo', icon: '🌊', namePrefix: '北斋漫画', year: 1814, dateRange: '1814–1878', cap: 240,
    desc: '葛饰北斋《北斋漫画》木刻图页——四千余幅市井、山水、鬼怪速写中的一页，「漫画」之名即源于此书。',
    tags: ['北斋漫画', '浮世绘', '木刻版画', '公版图页'], origin: '日本 · 江户',
    strip: /^Hokusai (Manga|manga) ?-? ?/i },
  { cat: 'Max und Moritz', categoryId: 'strips', icon: '🖋️', namePrefix: '麦克斯与莫里茨', year: 1865, dateRange: '1865', cap: 30,
    desc: '威廉·布施《麦克斯与莫里茨》公版图页——七段恶作剧连环诗画。',
    tags: ['威廉·布施', '连环画', '公版图页'], origin: '德国',
    strip: /^(Max und Moritz|Moritz|Max) ?/i },
  { cat: 'Little Nemo in Slumberland', categoryId: 'strips', icon: '🖋️', namePrefix: '小尼莫', year: 1905, dateRange: '1905–1926', cap: 30,
    desc: '温瑟·麦凯《小尼梦游仙境》公版报纸漫画版面。',
    tags: ['温瑟·麦凯', '周日漫画', '公版图页'], origin: '美国',
    strip: /^Little Nemo ?/i },
  { cat: 'Krazy Kat', categoryId: 'strips', icon: '🖋️', namePrefix: '疯狂猫', year: 1913, dateRange: '1913–1944', cap: 30,
    desc: '乔治·赫里曼《疯狂猫》公版报纸漫画版面。',
    tags: ['赫里曼', '公版图页'], origin: '美国',
    strip: /^Krazy Kat ?/i },
  { cat: 'Steamboat Willie', categoryId: 'characters', icon: '🐭', namePrefix: '威利号汽船', year: 1928, dateRange: '1928', cap: 20,
    desc: '《威利号汽船》（1928）公版剧照与图版——公版版米老鼠的首次亮相。',
    tags: ['米老鼠', '迪士尼', '公版剧照'], origin: '美国',
    strip: /^Steamboat Willie ?/i },
  { cat: 'Gertie the Dinosaur', categoryId: 'animation', icon: '🎬', namePrefix: '恐龙葛蒂', year: 1914, dateRange: '1914', cap: 20,
    desc: '温瑟·麦凯《恐龙葛蒂》（1914）公版图版。',
    tags: ['温瑟·麦凯', '角色动画', '公版图版'], origin: '美国',
    strip: /^Gertie the Dinosaur ?/i },
]

async function commonsPages() {
  const ids = new Set(items.map((e) => e.id))
  for (const lane of COMMONS_LANES) {
    const files = await commonsCategoryFiles(lane.cat, lane.cap)
    let added = 0
    for (const f of files) {
      const id = `anime-commons-${f.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 80).toLowerCase()}`
      if (ids.has(id)) continue
      const clean = f.replace(/\.(jpe?g|png|gif|tiff?)$/i, '').replace(/_/g, ' ').replace(lane.strip, '').trim()
      items.push({
        id,
        hall: 'anime',
        categoryId: lane.categoryId,
        name: `${lane.namePrefix} · ${clean || '图页'}`,
        origin: lane.origin,
        era: '近代',
        date: lane.dateRange,
        year: lane.year,
        location: '',
        collection: 'Wikimedia Commons',
        dimensions: '',
        material: '',
        description: lane.desc,
        tags: lane.tags,
        icon: lane.icon,
        imageUrl: proxiedUrl(f, 600),
        imageLarge: proxiedUrl(f, 1200),
        source: 'Wikimedia Commons',
        sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f.replace(/ /g, '_'))}`,
      })
      ids.add(id)
      added++
    }
    log(`Commons「${lane.cat}」：+${added} 件`)
  }
}

async function main() {
  const mode = process.argv[2] || 'all'
  if (mode === 'seeds' || mode === 'all') await fixSeeds()
  if (mode === 'bulk' || mode === 'all') await bulkAnimation()
  if (mode === 'commons' || mode === 'all') await commonsPages()
  writeFileSync(FILE, JSON.stringify(items), 'utf8')
  const stat = {}
  for (const e of items) stat[e.categoryId] = (stat[e.categoryId] || 0) + 1
  const withImg = items.filter((e) => e.imageUrl).length
  log(`✅ 动漫馆补采完成：合计 ${items.length} 件（有图 ${withImg}）`)
  log('  ' + Object.entries(stat).map(([k, v]) => `${k}=${v}`).join(', '))
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
