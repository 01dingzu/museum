// collect-literature.mjs — 采集文学馆（第八馆）数据
// 数据源：DBpedia SPARQL（CC-BY-SA）+ Wikimedia Commons 图片（经 images.weserv.nl 代理）
// 覆盖：小说 / 诗歌 / 戏剧 / 童话与短篇 / 史诗与神话 / 作家 六大类
//
// 采集策略（与 collect-science.mjs 相同的三路合并）：
//   1. dct:subject = Category:<X>（批量作品类目）
//   2. 种子名单（手工确认的必收作品/作家）
//   3. 作家类目（Category:Novelists 等，出生 < 1925，有缩略图）
//
// 用法：node scripts/collect-literature.mjs
// 输出：public/data/literature.json

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'literature.json')
const SPARQL = 'https://dbpedia.org/sparql'
const UA = 'museum-collector/1.0 (educational, non-commercial research)'

const DCT = 'http://purl.org/dc/terms/'
const DBO = 'http://dbpedia.org/ontology/'
const DBP = 'http://dbpedia.org/property/'
const RES = 'http://dbpedia.org/resource/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractFilename(raw) {
  if (!raw) return ''
  if (!raw.startsWith('http')) return raw
  let u
  try {
    u = new URL(raw)
  } catch {
    return ''
  }
  const m = u.pathname.match(/Special:FilePath\/(.+)/)
  if (m) return decodeURIComponent(m[1])
  const parts = u.pathname.split('/').filter(Boolean)
  const ti = parts.indexOf('thumb')
  if (ti >= 0 && parts[ti + 3]) return decodeURIComponent(parts[ti + 3])
  return decodeURIComponent(parts.pop() || '')
}

function proxiedUrl(filename, width) {
  const safe = filename.replace(/ /g, '_')
  const enc = encodeURIComponent(safe)
  const sfp = `commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=${width}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(sfp)}`
}

function imageUrl(raw, width) {
  const filename = extractFilename(raw)
  if (!filename) return ''
  return proxiedUrl(filename, width)
}

// ================= 类目配置 =================
// workCats: 作品类目（dct:subject）
// writerCats: 作家类目
// seeds: 必收资源名（作品或作家）
const CATS = {
  novel: {
    icon: '📖',
    label: '小说',
    workCats: ['Novels'],
    seeds: [
      'Don_Quixote', 'The_Tale_of_Genji', 'Dream_of_the_Red_Chamber',
      'Journey_to_the_West', 'Romance_of_the_Three_Kingdoms', 'Water_Margin',
      'Pride_and_Prejudice', 'Moby-Dick', 'Crime_and_Punishment', 'War_and_Peace',
      'Les_Misérables', 'Madame_Bovary', 'One_Hundred_Years_of_Solitude',
      'The_Catcher_in_the_Rye', 'Ulysses_(novel)', 'The_Great_Gatsby',
      'The_Metamorphosis', 'In_Search_of_Lost_Time', 'The_Stranger_(novel)',
    ],
    writerCats: ['Novelists'],
    writerSeeds: [
      'Cao_Xueqin', 'Murasaki_Shikibu', 'Lu_Xun', 'Jane_Austen', 'Charles_Dickens',
      'Victor_Hugo', 'Gustave_Flaubert', 'Fyodor_Dostoevsky', 'Leo_Tolstoy',
      'Franz_Kafka', 'Marcel_Proust', 'James_Joyce', 'Jorge_Luis_Borges',
      'Gabriel_García_Márquez', 'George_Orwell', 'Ernest_Hemingway',
    ],
  },
  poetry: {
    icon: '🕊️',
    label: '诗歌',
    workCats: ['Poems'],
    seeds: [
      'Iliad', 'Odyssey', 'Divine_Comedy', 'The_Canterbury_Tales',
      'Faust,_Part_One', 'Paradise_Lost', 'Leaves_of_Grass',
      'Les_Fleurs_du_mal', 'The_Raven', 'The_Waste_Land', 'Shijing',
    ],
    writerCats: ['Poets'],
    writerSeeds: [
      'Homer', 'Virgil', 'Dante_Alighieri', 'John_Milton', 'William_Wordsworth',
      'Lord_Byron', 'John_Keats', 'Percy_Bysshe_Shelley', 'Charles_Baudelaire',
      'Walt_Whitman', 'Emily_Dickinson', 'Rainer_Maria_Rilke', 'W._B._Yeats',
    ],
  },
  drama: {
    icon: '🎭',
    label: '戏剧',
    workCats: ['Plays'],
    seeds: [
      'Hamlet', 'Macbeth', 'King_Lear', 'Othello', 'Romeo_and_Juliet',
      'A_Midsummer_Night\'s_Dream', 'Waiting_for_Godot', 'A_Doll\'s_House',
      'The_Caucasian_Chalk_Circle', 'Life_is_a_Dream', 'The_Seagull',
    ],
    writerCats: ['Playwrights'],
    writerSeeds: [
      'William_Shakespeare', 'Molière', 'Henrik_Ibsen', 'Anton_Chekhov',
      'Bertolt_Brecht', 'Samuel_Beckett', 'Lope_de_Vega', 'Kalidasa',
    ],
  },
  tale: {
    icon: '🧚',
    label: '童话与短篇',
    workCats: ['Short_stories', 'Fairy_tales'],
    seeds: [
      'One_Thousand_and_One_Nights', 'Grimms\'_Fairy_Tales',
      'Andersen\'s_Fairy_Tales', 'The_Little_Match_Girl',
      'Alice\'s_Adventures_in_Wonderland',
    ],
    writerCats: ['Short_story_writers'],
    writerSeeds: [
      'Hans_Christian_Andersen', 'Brothers_Grimm', 'Edgar_Allan_Poe',
      'Anton_Chekhov', 'O._Henry', 'Guy_de_Maupassant', 'Lu_Xun',
      'Jorge_Luis_Borges', 'Yasunari_Kawabata',
    ],
  },
  epic: {
    icon: '📜',
    label: '史诗与神话',
    workCats: ['Epics', 'Mythology_books'],
    seeds: [
      'Epic_of_Gilgamesh', 'Aeneid', 'Beowulf', 'Nart_sagas', 'Kalevala',
      'Mahabharata', 'Ramayana', 'Shahnameh', 'Heimskringla', 'Poetic_Edda',
      'Nibelungenlied', 'Mabinogion',
    ],
    writerCats: [],
    writerSeeds: [
      'Valmiki', 'Ferdowsi', 'Snorri_Sturluson',
    ],
  },
  writer: {
    icon: '✍️',
    label: '作家',
    workCats: [],
    seeds: [],
    writerCats: ['Essayists', 'Literary_critics'],
    writerSeeds: [
      'Qu_Yuan', 'Li_Bai', 'Du_Fu', 'Su_Shi', 'Tao_Yuanming',
      'Confucius', 'Mencius', 'Laozi', 'Zhuangzi', 'Han_Yu',
      'Miguel_de_Cervantes', 'Johann_Wolfgang_von_Goethe',
      'Rabindranath_Tagore', 'Mark_Twain', 'Mary_Shelley',
      'Virginia_Woolf', 'Milan_Kundera', 'Mikhail_Bulgakov',
    ],
  },
}

// ================= SPARQL 执行 =================
function parseJsonLenient(text) {
  const cleaned = text.replace(/[\u0000-\u001f]/g, ' ')
  try {
    return JSON.parse(cleaned)
  } catch (firstErr) {
    const marker = cleaned.indexOf('"bindings"')
    if (marker < 0) throw firstErr
    for (let i = cleaned.length - 1; i > marker; i--) {
      if (cleaned[i] === '}') {
        try {
          return JSON.parse(cleaned.slice(0, i + 1) + ']}}')
        } catch { /* 继续向前找完整边界 */ }
      }
    }
    throw firstErr
  }
}

async function runSparql(sparql, retries = 4) {
  const url = `${SPARQL}?query=${encodeURIComponent(sparql)}&format=json`
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } })
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        await sleep(3000 * (i + 1))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const j = parseJsonLenient(text)
      return j.results?.bindings || []
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(2000 * (i + 1))
    }
  }
  throw new Error('重试耗尽')
}

const bv = (b) => b?.value || ''

// ================= 映射 =================
function yearOf(x) {
  if (!x) return null
  const m = String(x).match(/(-?\d{3,4})/)
  return m ? Number(m[1]) : null
}

function fmtYear(y) {
  if (y === null || y === undefined) return ''
  return y < 0 ? `公元前 ${-y}` : `${y}`
}

function eraOf(year) {
  if (year === null) return ''
  if (year < 476) return '古代'
  if (year < 1450) return '中世纪'
  if (year < 1600) return '文艺复兴'
  if (year < 1660) return '巴洛克时代'
  if (year < 1790) return '启蒙时代'
  if (year < 1830) return '浪漫主义'
  if (year < 1900) return '现实主义'
  return '现代'
}

function trimComment(s) {
  if (!s) return ''
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > 220 ? t.slice(0, 220) + '…' : t
}

function mapRow(b, categoryId, kind) {
  const cat = CATS[categoryId]
  const resource = bv(b.item)
  const local = resource.replace(RES, '')
  const labelZh = bv(b.labelZh)
  const labelEn = bv(b.labelEn)
  const name = labelZh || labelEn || local.replace(/_/g, ' ')
  const thumb = bv(b.thumb)
  const birth = yearOf(bv(b.birth))
  const death = yearOf(bv(b.death))
  const pub = yearOf(bv(b.pub))

  let date = ''
  let era = ''
  if (kind === 'person') {
    date = [fmtYear(birth), fmtYear(death)].filter(Boolean).join('–')
    era = eraOf(birth)
  } else {
    date = fmtYear(pub)
    era = eraOf(pub)
  }

  const comment = trimComment(bv(b.comment))
  const desc = comment ? `${name}（${cat.label}）。${comment}` : `${name}（${cat.label}）。`

  return {
    id: `lit-dbpedia-${local}`,
    hall: 'literature',
    categoryId,
    name,
    origin: '',
    era,
    date,
    location: '',
    collection: 'DBpedia / Wikimedia Commons',
    dimensions: '',
    material: '',
    description: desc,
    tags: [cat.label, kind, labelEn].filter(Boolean),
    icon: cat.icon,
    imageUrl: imageUrl(thumb, 843),
    imageLarge: imageUrl(thumb, 1686),
    source: 'DBpedia',
    sourceUrl: resource,
  }
}

// ================= 查询模板 =================
const LABELS = `
    OPTIONAL { ?item rdfs:label ?labelZh . FILTER(LANG(?labelZh)="zh") }
    OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn)="en") }
    OPTIONAL { ?item rdfs:comment ?comment . FILTER(LANG(?comment)="en") }`

function worksQuery(catName) {
  return `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?pub WHERE {
    ?item <${DCT}subject> <${RES}Category:${catName}> .
    ?item <${DBO}thumbnail> ?thumb .
    OPTIONAL { ?item <${DBP}publishYear> ?pub }
    OPTIONAL { ?item <${DBO}publicationDate> ?pub2 }
${LABELS}
  } LIMIT 500`
}

function seedsQuery(seeds) {
  const uris = seeds.map((s) => `<${RES}${encodeURIComponent(s)}>`)
  const chunks = []
  for (let i = 0; i < uris.length; i += 8) chunks.push(uris.slice(i, i + 8).join(' '))
  return chunks.map((chunk) => `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?pub WHERE {
    VALUES ?item { ${chunk} }
    OPTIONAL { ?item <${DBO}thumbnail> ?thumb }
    OPTIONAL { ?item <${DBP}publishYear> ?pub }
${LABELS}
  }`)
}

function writersQuery(catName) {
  return `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?birth ?death WHERE {
    ?item <${DCT}subject> <${RES}Category:${catName}> .
    ?item <${DBO}thumbnail> ?thumb .
    ?item <${DBO}birthDate> ?birth .
    FILTER(?birth < "1925-01-01"^^xsd:date)
    OPTIONAL { ?item <${DBO}deathDate> ?death . FILTER(?death > "800-01-01"^^xsd:date) }
${LABELS}
  } LIMIT 500`
}

function writerSeedsQuery(seeds) {
  const uris = seeds.map((s) => `<${RES}${encodeURIComponent(s)}>`)
  const chunks = []
  for (let i = 0; i < uris.length; i += 8) chunks.push(uris.slice(i, i + 8).join(' '))
  return chunks.map((chunk) => `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?birth ?death WHERE {
    VALUES ?item { ${chunk} }
    OPTIONAL { ?item <${DBO}thumbnail> ?thumb }
    OPTIONAL { ?item <${DBO}birthDate> ?birth }
    OPTIONAL { ?item <${DBO}deathDate> ?death . FILTER(?death > "800-01-01"^^xsd:date) }
${LABELS}
  }`)
}

// ================= 主流程 =================
async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const seen = new Set()
  const all = []
  const stats = {}

  for (const [categoryId, cat] of Object.entries(CATS)) {
    stats[categoryId] = { works: 0, seeds: 0, writers: 0 }

    // 1. 作品类目
    for (const wc of cat.workCats) {
      try {
        const rows = await runSparql(worksQuery(wc))
        for (const b of rows) {
          const local = bv(b.item).replace(RES, '')
          if (seen.has(local)) continue
          seen.add(local)
          all.push(mapRow(b, categoryId, 'work'))
          stats[categoryId].works++
        }
        console.error(`  [${categoryId}] 作品 ${wc} +${rows.length}`)
      } catch (err) {
        console.error(`  [${categoryId}] 作品 ${wc} 查询失败：${err.message}`)
      }
      await sleep(1200)
    }

    // 2. 作品种子
    if (cat.seeds.length > 0) {
      for (const q of seedsQuery(cat.seeds)) {
        try {
          const rows = await runSparql(q)
          for (const b of rows) {
            const local = bv(b.item).replace(RES, '')
            if (seen.has(local)) continue
            seen.add(local)
            all.push(mapRow(b, categoryId, 'work'))
            stats[categoryId].seeds++
          }
        } catch (err) {
          console.error(`  [${categoryId}] 种子查询失败：${err.message}`)
        }
        await sleep(1200)
      }
    }

    // 3. 作家类目
    for (const wcat of cat.writerCats) {
      try {
        const rows = await runSparql(writersQuery(wcat))
        for (const b of rows) {
          const local = bv(b.item).replace(RES, '')
          if (seen.has(local)) continue
          seen.add(local)
          all.push(mapRow(b, categoryId, 'person'))
          stats[categoryId].writers++
        }
        console.error(`  [${categoryId}] 作家 ${wcat} +${rows.length}`)
      } catch (err) {
        console.error(`  [${categoryId}] 作家 ${wcat} 查询失败：${err.message}`)
      }
      await sleep(1200)
    }

    // 4. 作家种子
    if (cat.writerSeeds && cat.writerSeeds.length > 0) {
      for (const q of writerSeedsQuery(cat.writerSeeds)) {
        try {
          const rows = await runSparql(q)
          for (const b of rows) {
            const local = bv(b.item).replace(RES, '')
            if (seen.has(local)) continue
            seen.add(local)
            all.push(mapRow(b, categoryId, 'person'))
            stats[categoryId].writers++
          }
        } catch (err) {
          console.error(`  [${categoryId}] 作家种子查询失败：${err.message}`)
        }
        await sleep(1200)
      }
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error('\n✅ 文学馆数据已写入', OUT_FILE)
  for (const [k, v] of Object.entries(stats)) {
    console.error(`  ${CATS[k].label}：作品 ${v.works} + 种子 ${v.seeds} + 作家 ${v.writers}`)
  }
  console.error(`  合计 ${all.length} 件`)

  if (all[0]) {
    const s = all[0]
    console.error('\n样例：', JSON.stringify({ id: s.id, name: s.name, era: s.era, date: s.date, imageUrl: s.imageUrl.slice(0, 80) }, null, 1))
  }
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
