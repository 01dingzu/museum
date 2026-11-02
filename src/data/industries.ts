import type { Exhibit } from '../types'

// 工业馆「产业时间轴」：九大产业泳道定义
// 顺序即叙事顺序：工业革命的起点（纺织）一路走到机器人与自动化
export interface Industry {
  id: string
  name: string
  icon: string
  description: string
}

export const INDUSTRIES: Industry[] = [
  { id: 'textile', name: '纺织产业', icon: '🧵', description: '从珍妮纺纱机到动力织机——工业革命的第一批机器' },
  { id: 'metallurgy', name: '钢铁与冶金', icon: '🔩', description: '焦炭高炉、搅炼法到转炉与平炉——材料革命' },
  { id: 'power', name: '动力与机械', icon: '⚙️', description: '蒸汽机、内燃机、汽轮机与工业母机' },
  { id: 'energy', name: '能源与电气', icon: '⚡', description: '煤炭、石油、发电机、电灯与核能' },
  { id: 'transport', name: '交通与航空', icon: '🚂', description: '铁路、轮船、汽车、飞机与航天器' },
  { id: 'communication', name: '通信产业', icon: '📡', description: '电报、电话、无线电与广播电视' },
  { id: 'computing', name: '信息与计算', icon: '💻', description: '从机械计算器到电子计算机' },
  { id: 'precision', name: '精密仪器', icon: '🕰️', description: '钟表、望远镜、显微镜与照相机' },
  { id: 'robotics', name: '机器人与自动化', icon: '🤖', description: '机械臂、工业机器人与自动化产线' },
]

export const industryMap: Record<string, Industry> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.id, i]),
)

// 与 scripts/industry-timeline.mjs 的分类规则保持一致（作数据缺 industryId 时的兜底）
const CATEGORY_INDUSTRY: Record<string, string> = {
  'industrial-revolution': 'power',
  'power-machinery': 'power',
  transport: 'transport',
  communication: 'communication',
  'energy-electric': 'energy',
  'computing-space': 'computing',
  robotics: 'robotics',
  timekeeping: 'precision',
  optics: 'precision',
}

// 与 scripts/lib/industry-rules.mjs 保持同步；英文关键词必须带词边界
// （/lace/ 会误伤 "placed"、/iron/ 会误伤 "environmental"）
const MIXED_CATEGORIES = new Set(['industrial-revolution', 'power-machinery', 'computing-space'])
const TEXTILE_RE = /\b(spinn\w*|jenny|looms?\b|textil\w*|cotton|silk|weav\w*|sewing machine|knitt\w*|lace|hosiery|worsted|flax|linen)|纺|纱|梭|棉|缝纫|印染|纺织|织布|织机|提花/i
const TRANSPORT_RE = /机车|火车|铁路|轮船|汽船|汽车|飞机|舰/
const METALLURGY_RE = /\b(steels?\b|iron\w*|furnace|bessemer|forg\w*|foundr\w*|metall\w*|puddl\w*|rolling mill|coke|smelt\w*|blast|tinplate|wrought iron)|钢|高炉|平炉|转炉|坩埚炉|电弧炉|熔炉|炼炉|鼓风炉|反射炉|搅炼炉|冶炼|铸造|锻造|轧材|炼铁|炼钢|生铁|熟铁|铸铁|铁水/i
const SPACE_RE_FE = /rocket|spacecraft|satellite|space shuttle|space station|apollo|lunar|vostok|soyuz|sputnik|space|火箭|卫星|飞船|航天|太空|登月|阿波罗/i

export function industryOf(e: Exhibit): string {
  if (e.industryId && industryMap[e.industryId]) return e.industryId
  // 兜底：用户自录展品 / 旧数据（与脚本规则同步）
  if (MIXED_CATEGORIES.has(e.categoryId)) {
    const text = [e.name, e.description, ...(e.tags ?? [])].join(' ')
    if (TEXTILE_RE.test(text)) return 'textile'
    if (TRANSPORT_RE.test(text)) return 'transport'
    if (METALLURGY_RE.test(text)) return 'metallurgy'
    if (CATEGORY_INDUSTRY[e.categoryId] === 'computing' && SPACE_RE_FE.test(text)) {
      return 'transport'
    }
  }
  return CATEGORY_INDUSTRY[e.categoryId] ?? 'power'
}

// 时代分段（泳道内的横轴）
export interface Era {
  id: string
  label: string
  note: string
  from: number
  to: number
}

export const ERAS: Era[] = [
  { id: 'pre-1750', label: '1750 年前', note: '手工与工场时代', from: -Infinity, to: 1750 },
  { id: 'e1750-1800', label: '1750–1800', note: '工业革命启动', from: 1750, to: 1800 },
  { id: 'e1800-1850', label: '1800–1850', note: '蒸汽与铁路时代', from: 1800, to: 1850 },
  { id: 'e1850-1880', label: '1850–1880', note: '钢铁与机器大工业', from: 1850, to: 1880 },
  { id: 'e1880-1900', label: '1880–1900', note: '电气革命前夜', from: 1880, to: 1900 },
  { id: 'e1900-1930', label: '1900–1930', note: '电气化与流水线', from: 1900, to: 1930 },
  { id: 'e1930-1950', label: '1930–1950', note: '战时工业与雷达', from: 1930, to: 1950 },
  { id: 'e1950-1970', label: '1950–1970', note: '战后黄金年代与航天竞赛', from: 1950, to: 1970 },
  { id: 'e1970-1990', label: '1970–1990', note: '微电子革命', from: 1970, to: 1990 },
  { id: 'e1990-2010', label: '1990–2010', note: '信息时代', from: 1990, to: 2010 },
  { id: 'post-2010', label: '2010 年后', note: '智能制造与当代', from: 2010, to: Infinity },
]

export function eraOfYear(year?: number): string {
  if (year == null) return 'unknown'
  const era = ERAS.find((e) => year >= e.from && year < e.to)
  return era?.id ?? 'post-2010'
}
