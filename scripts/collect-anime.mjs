// collect-anime.mjs — 采集动漫馆（第九馆）数据：漫画与动画的「公版史前史」
// 版权红线：只收录公有领域内容（1929 年前美国出版物 / 作者死后超过保护期 / 日本战前映画等），
// 图片全部来自 Wikimedia Commons（本身即公版或自由许可）。
//
// 数据源：
//   1. Wikidata SPARQL + wbsearchentities（种子定位 → P18 图片 + P571 年份）
//   2. Commons 分类枚举（北斋漫画图页等）
//
// 五大类目：
//   scroll 📜 古代绘卷 | ukiyo 🌊 浮世绘与画集 | strips 🖋️ 连环画与讽刺画
//   animation 🎬 早期动画 | characters 🐭 公版角色
//
// 用法：node scripts/collect-anime.mjs
// 输出：public/data/anime.json

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'anime.json')
const WD = 'https://www.wikidata.org/w/api.php'
const SPARQL = 'https://query.wikidata.org/sparql'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const UA = { 'User-Agent': 'museum-anime-collector/1.0 (personal, non-commercial)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    } catch (err) {
      await sleep(3000 * (i + 1))
    }
  }
  return null
}

async function runSparql(query, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(SPARQL, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
        body: query,
      })
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        await sleep(5000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(3000 * (i + 1))
    }
  }
  return []
}

const bv = (b) => b?.value || ''
const yearOfTime = (tv) => {
  if (!tv) return null
  const m = /^([+-])?(\d{4,})-/.exec(tv)
  if (!m) return null
  const y = parseInt(m[2], 10)
  return m[1] === '-' ? -y : y
}

// ============ Commons 分类枚举（本分类 + 一级子分类的文件） ============
async function commonsCategoryFiles(cat, maxFiles = 300) {
  const files = []
  const cats = [cat]
  try {
    // 一级子分类
    const res = await fetch(
      `${COMMONS}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(cat)}&cmtype=subcat&cmlimit=100&format=json`,
      { headers: UA },
    )
    const data = await res.json()
    for (const m of data.query?.categorymembers || []) cats.push(m.title.replace(/^Category:/, ''))
  } catch { /* 取不到子分类就只扫本体 */ }

  for (const c of cats) {
    if (files.length >= maxFiles) break
    try {
      const res = await fetch(
        `${COMMONS}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(c)}&cmtype=file&cmlimit=500&format=json`,
        { headers: UA },
      )
      const data = await res.json()
      for (const m of data.query?.categorymembers || []) {
        if (files.length >= maxFiles) break
        const title = m.title.replace(/^File:/, '')
        if (!/\.(jpe?g|png|gif|tiff?)$/i.test(title)) continue
        files.push(title)
      }
    } catch (err) {
      console.error(`    Commons 分类 ${c} 失败：${err.message}`)
    }
    await sleep(800)
  }
  return files
}

// ============ 展品组装 ============
const seenIds = new Set()
const all = []

function pushExhibit(e) {
  if (seenIds.has(e.id)) return
  seenIds.add(e.id)
  all.push(e)
}

function baseItem({ id, categoryId, icon, name, year, date, description, tags, imgFilename, sourceUrl, origin }) {
  const y = year == null ? null : year
  return {
    id,
    hall: 'anime',
    categoryId,
    name,
    origin: origin || '',
    era: y == null ? '' : y < 0 ? '古代' : y < 1868 ? '近世' : y < 1946 ? '近代' : '现代',
    date: date || (y == null ? '' : y < 0 ? `公元前 ${-y}` : `${y}`),
    year: y ?? undefined,
    location: '',
    collection: 'Wikidata / Wikimedia Commons',
    dimensions: '',
    material: '',
    description,
    tags,
    icon,
    ...(imgFilename ? {
      imageUrl: proxiedUrl(imgFilename, 600),
      imageLarge: proxiedUrl(imgFilename, 1200),
    } : {}),
    source: 'Wikidata',
    ...(sourceUrl ? { sourceUrl } : {}),
  }
}

// ============ 种子清单（search = Wikidata 搜索词；zh = 中文名；year = P571 缺失兜底） ============
const SEEDS = [
  // ---- 古代绘卷 ----
  { cat: 'scroll', icon: '📜', search: 'Chōjū-jinbutsu-giga', zh: '鸟兽人物戏画', year: 1053, origin: '日本 · 京都高山寺',
    desc: '俗称「鸟兽戏画」，甲乙丙丁四卷动物拟人水墨画卷，被视为日本漫画的远祖。',
    tags: ['绘卷', '鸟兽戏画', '高山寺'] },
  { cat: 'scroll', icon: '📜', search: 'Genji Monogatari Emaki', zh: '源氏物语绘卷', year: 1130, origin: '日本 · 平安时代',
    desc: '现存最早的长篇物语绘卷，「吹拔屋台」「引目钩鼻」的构图法则影响了后世整个漫画传统。',
    tags: ['绘卷', '源氏物语', '平安时代'] },
  { cat: 'scroll', icon: '📜', search: 'Ban Dainagon Ekotoba', zh: '伴大纳言绘词', year: 1150, origin: '日本 · 平安时代',
    desc: '与鸟兽戏画齐名的信贵山系绘卷，连续性构图与动感群像被誉为「电影式叙事」。',
    tags: ['绘卷', '伴大纳言绘词'] },
  { cat: 'scroll', icon: '📜', search: 'Shigisan-engi', zh: '信贵山缘起', year: 1150, origin: '日本 · 平安时代',
    desc: '三条连环叙事绘卷，飞仓一卷的高速运镜式构图被视为分格叙事的原型。',
    tags: ['绘卷', '信贵山缘起'] },
  { cat: 'scroll', icon: '📜', search: 'Hungry Ghosts Scroll', zh: '饿鬼草纸', year: 1200, origin: '日本 · 镰仓时代',
    desc: '描绘饿鬼世界的朝廷绘卷，拟人化怪物与讽刺笔法是「妖怪漫画」的源头之一。',
    tags: ['绘卷', '饿鬼草纸', '妖怪'] },
  { cat: 'scroll', icon: '📜', search: 'Kitano Tenjin Engi Emaki', zh: '北野天神缘起绘卷', year: 1213, origin: '日本 · 镰仓时代',
    desc: '天神信仰的宗教绘卷，其中「大自在天勧进帳」一幕以连续俯瞰构图著称。',
    tags: ['绘卷', '天神缘起'] },

  // ---- 浮世绘与画集 ----
  { cat: 'ukiyo', icon: '🌊', search: 'Hokusai Manga', zh: '北斋漫画', year: 1814, origin: '日本 · 江户',
    desc: '葛饰北斋的十五卷素描画集，四千余幅从市井到鬼怪的万象速写——「漫画」一词由此书定型。',
    tags: ['浮世绘', '葛饰北斋', '漫画语源'] },
  { cat: 'ukiyo', icon: '🌊', search: 'Toba-e', zh: '鸟羽绘', year: 1702, origin: '日本 · 江户',
    desc: '狩野吉信《朝比奈岛巡图》等手绘拟人讽刺画，以「鸟羽僧正」之名的笑绘传统。',
    tags: ['鸟羽绘', '讽刺画'] },
  { cat: 'ukiyo', icon: '🌊', search: 'Tōkaidōochoko', zh: '东海道中膝栗毛', year: 1802, origin: '日本 · 江户',
    desc: '十返舍一九的滑稽旅行记，弯兵卫与喜多八的连环笑闹令「膝栗毛」成为漫才式叙事的代名词。',
    tags: ['滑稽本', '十返舍一九'] },

  // ---- 连环画与讽刺画 ----
  { cat: 'strips', icon: '🖋️', search: 'Histoire de M. Vieux Bois', zh: '老布先生的故事', year: 1837, origin: '瑞士 · 日内瓦',
    desc: '托普弗画出的第一部分格连环漫画，界定了「边框 + 序列图像 + 气泡」的现代漫画语法。',
    tags: ['连环画', '托普弗', '漫画语法奠基'] },
  { cat: 'strips', icon: '🖋️', search: 'Histoire de M. Jabot', zh: '雅波先生', year: 1835, origin: '瑞士 · 日内瓦',
    desc: '托普弗的笔迹分格漫画，比《老布先生》更早付印，连环叙事的最早实验之一。',
    tags: ['连环画', '托普弗'] },
  { cat: 'strips', icon: '🖋️', search: 'Max and Moritz', zh: '麦克斯与莫里茨', year: 1865, origin: '德国',
    desc: '威廉·布施的七段式恶作剧连环诗画，直接启发了《捣蛋鬼》与整个美式儿童连环漫画。',
    tags: ['连环画', '威廉·布施'] },
  { cat: 'strips', icon: '🖋️', search: 'The Yellow Kid', zh: '黄孩子', year: 1895, origin: '美国 · 纽约《世界报》',
    desc: '奥特考特笔下的黄睡衣男孩，史上第一个带固定气泡的报纸漫画明星，「黄色新闻」一词也由此而来。',
    tags: ['报纸连环画', '黄孩子'] },
  { cat: 'strips', icon: '🖋️', search: 'Little Nemo', zh: '小尼莫梦乡历险记', year: 1905, origin: '美国 · 《纽约先驱报》',
    desc: '温瑟·麦凯的周日全彩梦境漫画， Art Nouveau 式构图是漫画史公认的美术巅峰之一。',
    tags: ['温瑟·麦凯', '周日漫画', '全彩'] },
  { cat: 'strips', icon: '🖋️', search: 'Krazy Kat', zh: '疯狂猫', year: 1913, origin: '美国',
    desc: '乔治·赫里曼的超现实爱情三角（猫·鼠·狗），被评论界尊为诗意漫画的最高范本。',
    tags: ['赫里曼', '超现实'] },
  { cat: 'strips', icon: '🖋️', search: 'Bringing Up Father', zh: '教养父亲', year: 1913, origin: '美国',
    desc: '麦克马努斯的百万富翁暴发户家庭喜剧，连载近一个世纪的美式家庭漫画样板。',
    tags: ['乔治·麦克马努斯'] },

  // ---- 早期动画 ----
  { cat: 'animation', icon: '🎬', search: 'Fantasmagorie', zh: '幻影集', year: 1908, origin: '法国',
    desc: '科尔的两千帧粉笔线条动画，公认的动画电影开端——一个不断变形的小人。',
    tags: ['埃米尔·科尔', '粉笔线条', '动画开端'] },
  { cat: 'animation', icon: '🎬', search: 'Humorous Phases of Funny Faces', zh: '滑稽面孔的幽默阶段', year: 1906, origin: '美国',
    desc: '布莱克顿的粉笔变形短片，最早的逐格动画实验之一。',
    tags: ['布莱克顿', '逐格动画'] },
  { cat: 'animation', icon: '🎬', search: 'Gertie the Dinosaur', zh: '恐龙葛蒂', year: 1914, origin: '美国',
    desc: '温瑟·麦凯的恐龙动画：第一个有性格的角色动画，互动演出式放映震惊了观众。',
    tags: ['温瑟·麦凯', '角色动画'] },
  { cat: 'animation', icon: '🎬', search: 'The Sinking of the Lusitania', zh: '卢西塔尼亚号的沉没', year: 1918, origin: '美国',
    desc: '麦凯的战争纪实动画，首部动画纪录片，2.5 万张手绘呈现沉船惨剧。',
    tags: ['动画纪录片', '温瑟·麦凯'] },
  { cat: 'animation', icon: '🎬', search: 'Out of the Inkwell', zh: '墨水壶里出来', year: 1918, origin: '美国 · 弗莱舍兄弟',
    desc: '马克斯·弗莱舍的转描机（rotoscope）系列，小丑科科从真实手绘里跳进现实。',
    tags: ['弗莱舍兄弟', '转描机', '小丑科科'] },
  { cat: 'animation', icon: '🎬', search: 'The Adventures of Prince Achmed', zh: '阿基米德王子历险记', year: 1926, origin: '德国 · 洛特·雷妮格',
    desc: '雷妮格的剪影动画长片，现存最古老的动画长片，三年逐帧剪纸的成果。',
    tags: ['剪影动画', '最早的动画长片'] },
  { cat: 'animation', icon: '🎬', search: 'Namakura Gatana', zh: '钝刀', year: 1917, origin: '日本',
    desc: '幸内纯一的武士买钝刀闹剧，现存最早的日本动画。',
    tags: ['幸内纯一', '日本动画开端'] },
  { cat: 'animation', icon: '🎬', search: 'Chikara to Onna no Yo no Naka', zh: '力与世间女子', year: 1933, origin: '日本 · 政冈宪三',
    desc: '日本第一部有声动画短片，政冈宪三工作室出品，确立了日本动画的角色表演传统。',
    tags: ['政冈宪三', '日本有声动画开端'] },
  { cat: 'animation', icon: '🎬', search: 'Momotaro: Sacred Sailors', zh: '桃太郎 海之神兵', year: 1945, origin: '日本 · 海军省',
    desc: '濑尾光世导演的日本第一部动画长片，战后进入公有领域，深刻影响了手冢治虫。',
    tags: ['濑尾光世', '日本首部动画长片', '影响手冢治虫'] },

  // ---- 公版角色 ----
  { cat: 'characters', icon: '🐭', search: 'Steamboat Willie', zh: '威利号汽船（1928 米奇）', year: 1928, origin: '美国 · 迪士尼',
    desc: '米老鼠的第三次登场、第一部有声卡通。1928 年版米奇形象自 2024 年起进入公有领域。',
    tags: ['米老鼠', '迪士尼', '有声动画里程碑'] },
  { cat: 'characters', icon: '🐰', search: 'Oswald the Lucky Rabbit', zh: '幸运兔子奥斯华', year: 1927, origin: '美国 · 环球影业',
    desc: '迪士尼失落的初代明星兔，版权 2003 年回归迪士尼，1927 年版形象已进入公版。',
    tags: ['奥斯华', '迪士尼'] },
  { cat: 'characters', icon: '🐱', search: 'Felix the Cat', zh: '菲利克斯猫', year: 1919, origin: '美国 · 派特·苏利文',
    desc: '默片时代的第一个动画巨星（早于米奇十年），思考用思考泡泡、走路用尾巴——卡通的「性格」由此定义。',
    tags: ['菲利克斯猫', '默片动画巨星'] },
  { cat: 'characters', icon: '🤡', search: 'Koko the Clown', zh: '小丑科科', year: 1916, origin: '美国 · 弗莱舍兄弟',
    desc: '从真人转描走出的第一个「活」的动画角色。',
    tags: ['科科', '弗莱舍'] },
  { cat: 'characters', icon: '🥬', search: 'Popeye', zh: '大力水手卜派（1929 版）', year: 1929, origin: '美国 · 《Thimble Theatre》',
    desc: '1929 年首次亮相于《顶针剧场》连环画的菠菜水手，原版形象自 2025 年起进入公有领域。',
    tags: ['卜派', '菠菜', '1929 原版形象'] },
  { cat: 'characters', icon: '😴', search: 'Little Nemo', zh: '小尼莫', year: 1905, origin: '美国 · 温瑟·麦凯',
    desc: '梦乡里的滑稽小英雄，漫画史上最早的「作者角色」之一。',
    tags: ['小尼莫', '梦'] },
]

// ---- 早期动画批量：1930 年前上映的有 P18 的动画电影 ----
const ANIMATION_QUERY = `
SELECT ?item ?itemLabel ?img ?date WHERE {
  ?item wdt:P31/wdt:P279* ?type .
  ?type rdfs:label "animated film"@en .
  ?item wdt:P18 ?img .
  OPTIONAL { ?item wdt:P577 ?date }
  FILTER(!BOUND(?date) || YEAR(?date) < 1930)
}
LIMIT 300`

// ---- 北斋漫画图页（Commons 分类） ----
const HOKUSAI_CATS = ['Hokusai Manga']

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // ===== 1. 种子 =====
  const qids = []
  for (const s of SEEDS) {
    const qid = await searchEntity(s.search)
    console.error(`  搜索「${s.search}」→ ${qid ?? '未命中'}（${s.zh}）`)
    qids.push(qid)
    await sleep(600)
  }

  // 批量取标签/年份/图片
  const wanted = qids.filter(Boolean)
  const claimsMap = new Map()
  for (let i = 0; i < wanted.length; i += 40) {
    const batch = wanted.slice(i, i + 40)
    const url = `${WD}?action=wbgetentities&format=json&props=labels|claims|sitelinks/urls&ids=${batch.join('|')}&languages=zh|en`
    try {
      const res = await fetch(url, { headers: UA })
      const data = await res.json()
      for (const [qid, ent] of Object.entries(data.entities || {})) {
        claimsMap.set(qid, ent)
      }
    } catch (err) {
      console.error(`  实体批 ${i / 40 + 1} 失败：${err.message}`)
    }
    await sleep(800)
  }

  for (const [idx, s] of SEEDS.entries()) {
    const qid = qids[idx]
    const ent = qid ? claimsMap.get(qid) : null
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
    if (year == null) year = s.year
    let img = null
    for (const c of claims.P18 || []) {
      img = c?.mainsnak?.datavalue?.value
      if (img) break
    }
    const labels = ent?.labels || {}
    const nameZh = labels.zh?.value
    const nameEn = labels.en?.value

    pushExhibit(baseItem({
      id: `anime-seed-${s.search.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      categoryId: s.cat,
      icon: s.icon,
      name: s.zh,
      year,
      description: `${s.desc}`,
      tags: [...s.tags, nameEn].filter(Boolean),
      imgFilename: img,
      sourceUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : undefined,
      origin: s.origin,
    }))
    if (!img) console.error(`    ⚠️ ${s.zh} 无 P18 图片`)
  }
  console.error(`种子完成：${all.length} 件`)

  // ===== 2. 早期动画批量 =====
  try {
    const rows = await runSparql(ANIMATION_QUERY)
    let added = 0
    for (const b of rows) {
      const qid = bv(b.item).replace('http://www.wikidata.org/entity/', '')
      const nameEn = bv(b.itemLabel)
      const img = bv(b.img)
      const year = yearOfTime(bv(b.date))
      if (!nameEn || !img) continue
      const id = `anime-wiki-${qid}`
      if (seenIds.has(id)) continue
      pushExhibit(baseItem({
        id,
        categoryId: 'animation',
        icon: '🎬',
        name: nameEn,
        year,
        description: `${nameEn}（早期动画电影）。公版时期的动画作品影像资料。`,
        tags: ['早期动画', nameEn],
        imgFilename: img,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      }))
      added++
    }
    console.error(`早期动画批量：+${added} 件`)
  } catch (err) {
    console.error(`早期动画批量失败：${err.message}`)
  }

  // ===== 3. 北斋漫画图页（Commons 分类枚举） =====
  for (const cat of HOKUSAI_CATS) {
    const files = await commonsCategoryFiles(cat, 240)
    let added = 0
    for (const f of files) {
      const clean = f.replace(/\.(jpe?g|png|gif|tiff?)$/i, '').replace(/_/g, ' ').replace(/^Hokusai Manga -? ?/i, '')
      const id = `anime-commons-${f.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 80).toLowerCase()}`
      if (seenIds.has(id)) continue
      pushExhibit(baseItem({
        id,
        categoryId: 'ukiyo',
        icon: '🌊',
        name: `北斋漫画 · ${clean}`,
        year: 1814,
        date: '1814–1878',
        description: `葛饰北斋《北斋漫画》木刻图页——四千余幅市井、山水、鬼怪速写中的一页，「漫画」之名即源于此书。`,
        tags: ['北斋漫画', '浮世绘', '木刻版画', '公版图页'],
        imgFilename: f,
        sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f.replace(/ /g, '_'))}`,
        origin: '日本 · 江户',
      }))
      added++
    }
    console.error(`Commons 分类 ${cat}：+${added} 件`)
  }

  // ===== 汇总 =====
  const stat = {}
  for (const e of all) stat[e.categoryId] = (stat[e.categoryId] || 0) + 1
  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error('\n✅ 动漫馆数据已写入', OUT_FILE)
  console.error(`  合计 ${all.length} 件：` + Object.entries(stat).map(([k, v]) => `${k}=${v}`).join(', '))
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
