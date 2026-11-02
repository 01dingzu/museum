// collect-science.mjs — 采集科学史馆（第七馆）数据
// 数据源：DBpedia SPARQL（CC-BY-SA）+ Wikimedia Commons 图片（经 images.weserv.nl 代理）
// 覆盖：六大学科（数学/天文/物理/化学/生物/地质）的人物肖像 + 原典著作
//
// 采集策略（三路合并，按资源去重）：
//   1. dbo:academicDiscipline = <学科>（批量人物，出生 < 1925）
//   2. 种子名单（手工确认的必收人物/著作，兜住学科属性填偏的关键人物，如 Gauss 的属性是 Magnetism）
//   3. dct:subject = Category:<X>_books（原典著作）
//
// 用法：node scripts/collect-science.mjs
// 输出：public/data/science.json

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')
const OUT_FILE = path.join(OUT_DIR, 'science.json')
const SPARQL = 'https://dbpedia.org/sparql'
const UA = 'museum-collector/1.0 (educational, non-commercial research)'

const DCT = 'http://purl.org/dc/terms/'
const DBO = 'http://dbpedia.org/ontology/'
const DBP = 'http://dbpedia.org/property/'
const RES = 'http://dbpedia.org/resource/'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 与 collect-wikidata.mjs 相同的 weserv 代理策略：
//   https://images.weserv.nl/?url=<enc(commons.wikimedia.org/wiki/Special:FilePath/<enc(filename)>?width=N)>
// DBpedia 的 dbo:thumbnail 可能给出 Special:FilePath 形式，也可能是 upload.wikimedia.org 的 thumb 路径，
// 后者需要从 /thumb/<hash dirs>/<File>/<NNNpx-File> 中还原原始文件名。
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

// ================= 学科配置 =================
// disciplines: dbo:academicDiscipline 匹配的资源名（批量路径）
// seeds: 必收资源名（不走出生年份过滤，只需有缩略图）
// bookCat: Wikipedia 著作类目名
const CATS = {
  math: {
    icon: '🧮',
    label: '数学',
    disciplines: ['Mathematics'],
    seeds: [
      'Euclid', 'Archimedes', 'Isaac_Newton', 'Leonhard_Euler', 'Carl_Friedrich_Gauss',
      'Pierre_de_Fermat', 'Blaise_Pascal', 'Gottfried_Wilhelm_Leibniz', 'David_Hilbert',
      'Bernhard_Riemann', 'Alan_Turing', 'Emmy_Noether', 'Sofia_Kovalevskaya',
      'Henri_Poincaré', 'Srinivasa_Ramanujan', 'Joseph-Louis_Lagrange',
      'Augustin-Louis_Cauchy', 'Ada_Lovelace', 'John_von_Neumann', 'Kurt_Gödel',
    ],
    bookCat: 'Mathematics_books',
    bookSeeds: ['Philosophiæ_Naturalis_Principia_Mathematica', 'Elements_(Euclid)', 'Disquisitiones_Arithmeticae'],
  },
  astronomy: {
    icon: '🪐',
    label: '天文学',
    disciplines: ['Astronomy', 'Astrophysics'],
    seeds: [
      'Ptolemy', 'Nicolaus_Copernicus', 'Tycho_Brahe', 'Johannes_Kepler', 'Galileo_Galilei',
      'Edmond_Halley', 'William_Herschel', 'Pierre-Simon_Laplace', 'Urbain_Le_Verrier',
      'Edwin_Hubble', 'Henrietta_Swan_Leavitt', 'Annie_Jump_Cannon', 'Carl_Sagan',
      'Subrahmanyan_Chandrasekhar', 'Cecilia_Payne-Gaposchkin',
    ],
    bookCat: 'Astronomy_books',
    bookSeeds: ['De_revolutionibus_orbium_coelestium', 'Dialogue_Concerning_the_Two_Chief_World_Systems', 'Harmonices_Mundi'],
  },
  physics: {
    icon: '⚛️',
    label: '物理学',
    disciplines: ['Physics', 'Magnetism'],
    seeds: [
      'Michael_Faraday', 'James_Clerk_Maxwell', 'André-Marie_Ampère', 'Alessandro_Volta',
      'Hans_Christian_Ørsted', 'Heinrich_Hertz', 'Ludwig_Boltzmann', 'James_Prescott_Joule',
      'William_Thomson,_1st_Baron_Kelvin', 'Wilhelm_Röntgen', 'Max_Planck', 'Albert_Einstein',
      'Niels_Bohr', 'Erwin_Schrödinger', 'Werner_Heisenberg', 'Marie_Curie', 'Paul_Dirac',
      'Richard_Feynman', 'Galileo_Galilei', 'Isaac_Newton',
    ],
    bookCat: 'Physics_books',
    bookSeeds: ['Opticks', 'A_Treatise_on_Electricity_and_Magnetism'],
  },
  chemistry: {
    icon: '⚗️',
    label: '化学',
    disciplines: ['Chemistry', 'Biochemistry'],
    seeds: [
      'Robert_Boyle', 'Antoine_Lavoisier', 'Joseph_Priestley', 'John_Dalton',
      'Jöns_Jacob_Berzelius', 'Dmitri_Mendeleev', 'Louis_Pasteur', 'Marie_Curie',
      'Linus_Pauling', 'Robert_Bunsen', 'Justus_von_Liebig', 'Friedrich_Wöhler',
      'August_Kekulé', 'Svante_Arrhenius', 'Alfred_Nobel',
    ],
    bookCat: 'Chemistry_books',
    bookSeeds: ['Traité_élémentaire_de_chimie', 'The_Sceptical_Chymist'],
  },
  biology: {
    icon: '🧬',
    label: '生物学',
    disciplines: ['Biology', 'Zoology', 'Botany', 'Natural_history', 'Microbiology', 'Anatomy', 'Genetics', 'Evolutionary_biology'],
    seeds: [
      'Aristotle', 'Carl_Linnaeus', 'Georges-Louis_Leclerc,_Comte_de_Buffon', 'Jean-Baptiste_Lamarck',
      'Georges_Cuvier', 'Charles_Darwin', 'Alfred_Russel_Wallace', 'Gregor_Mendel',
      'Louis_Pasteur', 'Robert_Koch', 'Thomas_Hunt_Morgan', 'Barbara_McClintock',
      'Rosalind_Franklin', 'Alexander_Fleming', 'Hugo_de_Vries',
    ],
    bookCat: 'Biology_books',
    bookSeeds: ['On_the_Origin_of_Species', 'Micrographia', 'Systema_Naturae', 'Experiments_on_Plant_Hybridization'],
  },
  geology: {
    icon: '🌍',
    label: '地质学',
    disciplines: ['Geology', 'Paleontology'],
    seeds: [
      'James_Hutton', 'Charles_Lyell', 'William_Smith_(geologist)', 'Georges_Cuvier',
      'Alexander_von_Humboldt', 'Alfred_Wegener', 'Louis_Agassiz', 'Arthur_Holmes',
      'Inge_Lehmann', 'Nicolas_Steno',
    ],
    bookCat: 'Geology_books',
    bookSeeds: ['Principles_of_Geology', 'The_Map_That_Changed_the_World'],
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

function bv(b) {
  return b?.value || ''
}

// ================= 映射 =================
function yearOf(x) {
  if (!x) return null
  const m = String(x).match(/(-?\d{3,4})/)
  return m ? Number(m[1]) : null
}

function fmtYear(y) {
  if (y === null || y === undefined) return ''
  return y < 0 ? `前${-y}` : String(y)
}

function eraOf(year) {
  if (year === null) return ''
  if (year < 476) return '古代'
  if (year < 1450) return '中世纪'
  if (year < 1600) return '文艺复兴'
  const c = Math.floor((year - 1) / 100) + 1
  return `${c}世纪`
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
    id: `science-dbpedia-${local}`,
    hall: 'science',
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

function personsQuery(disciplines) {
  const uris = disciplines.map((d) => `<${RES}${d}>`).join(', ')
  return `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?birth ?death WHERE {
    ?item <${DBO}academicDiscipline> ?disc .
    FILTER(?disc IN (${uris}))
    ?item <${DBO}thumbnail> ?thumb .
    ?item <${DBO}birthDate> ?birth .
    FILTER(?birth < "1925-01-01"^^xsd:date)
    OPTIONAL { ?item <${DBO}deathDate> ?death . FILTER(?death > "800-01-01"^^xsd:date) }
${LABELS}
  } LIMIT 1200`
}

function seedsQuery(seeds) {
  const uris = seeds.map((s) => `<${RES}${encodeURIComponent(s)}>`)
  const chunks = []
  for (let i = 0; i < uris.length; i += 8) chunks.push(uris.slice(i, i + 8).join(' '))
  // VALUES 一次放 8 个，分块查询
  return chunks.map((chunk) => `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?birth ?death WHERE {
    VALUES ?item { ${chunk} }
    ?item <${DBO}thumbnail> ?thumb .
    OPTIONAL { ?item <${DBO}birthDate> ?birth }
    OPTIONAL { ?item <${DBO}deathDate> ?death . FILTER(?death > "800-01-01"^^xsd:date) }
${LABELS}
  }`)
}

function booksQuery(catName) {
  return `SELECT DISTINCT ?item ?labelZh ?labelEn ?comment ?thumb ?pub WHERE {
    ?item <${DCT}subject> <${RES}Category:${catName}> .
    ?item <${DBO}thumbnail> ?thumb .
    OPTIONAL { ?item <${DBP}publishYear> ?pub }
    OPTIONAL { ?item <${DBO}publicationDate> ?pub2 }
${LABELS}
  } LIMIT 400`
}

// ================= 主流程 =================
async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const seen = new Set()
  const all = []
  const stats = {}

  for (const [categoryId, cat] of Object.entries(CATS)) {
    stats[categoryId] = { persons: 0, seeds: 0, books: 0 }

    // 1. 批量人物
    try {
      const rows = await runSparql(personsQuery(cat.disciplines))
      for (const b of rows) {
        const local = bv(b.item).replace(RES, '')
        if (seen.has(local)) continue
        seen.add(local)
        all.push(mapRow(b, categoryId, 'person'))
        stats[categoryId].persons++
      }
      console.error(`  [${categoryId}] 学科人物 +${stats[categoryId].persons}（累计 ${all.length}）`)
    } catch (err) {
      console.error(`  [${categoryId}] 人物查询失败：${err.message}`)
    }
    await sleep(1500)

    // 2. 种子（分块）
    for (const q of seedsQuery(cat.seeds)) {
      try {
        const rows = await runSparql(q)
        for (const b of rows) {
          const local = bv(b.item).replace(RES, '')
          if (seen.has(local)) continue
          seen.add(local)
          all.push(mapRow(b, categoryId, 'person'))
          stats[categoryId].seeds++
        }
      } catch (err) {
        console.error(`  [${categoryId}] 种子查询失败：${err.message}`)
      }
      await sleep(1500)
    }

    // 3. 著作类目
    try {
      const rows = await runSparql(booksQuery(cat.bookCat))
      for (const b of rows) {
        const local = bv(b.item).replace(RES, '')
        if (seen.has(local)) continue
        seen.add(local)
        all.push(mapRow(b, categoryId, 'work'))
        stats[categoryId].books++
      }
      console.error(`  [${categoryId}] 著作 +${stats[categoryId].books}`)
    } catch (err) {
      console.error(`  [${categoryId}] 著作查询失败：${err.message}`)
    }
    await sleep(1500)
  }

  await writeFile(OUT_FILE, JSON.stringify(all), 'utf8')
  console.error('\n✅ 科学史馆数据已写入', OUT_FILE)
  for (const [k, v] of Object.entries(stats)) {
    console.error(`  ${CATS[k].label}：人物 ${v.persons} + 种子 ${v.seeds} + 著作 ${v.books}`)
  }
  console.error(`  合计 ${all.length} 件`)

  // 抽样打印首条验证字段
  if (all[0]) {
    const s = all[0]
    console.error('\n样例：', JSON.stringify({ id: s.id, name: s.name, era: s.era, date: s.date, imageUrl: s.imageUrl.slice(0, 80) }, null, 1))
  }
}

main().catch((err) => {
  console.error('采集失败：', err)
  process.exit(1)
})
