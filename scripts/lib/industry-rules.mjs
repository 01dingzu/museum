// industry-rules.mjs — 工业馆产业分类与年份解析的共享规则
// 被 scripts/industry-timeline.mjs 与 scripts/build-manifest.mjs 共同引用；
// 前端 src/data/industries.ts 的兜底逻辑与之保持一致（改动需三方同步）。
//
// 英文关键词必须带词边界：/lace/ 会误伤 "placed"、/iron/ 会误伤 "environmental"。

export const CATEGORY_INDUSTRY = {
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

// 只对混类来源做关键词改判，transport / robotics 等干净类目直接映射
export const MIXED_CATEGORIES = new Set(['industrial-revolution', 'power-machinery', 'computing-space'])

const TEXTILE_RE = /\b(spinn\w*|jenny|looms?\b|textil\w*|cotton|silk|weav\w*|sewing machine|knitt\w*|lace|hosiery|worsted|flax|linen)|纺|纱|梭|棉|缝纫|印染|纺织|织布|织机|提花/i
const TRANSPORT_RE = /机车|火车|铁路|轮船|汽船|汽车|飞机|舰/
const METALLURGY_RE = /\b(steels?\b|iron\w*|furnace|bessemer|forg\w*|foundr\w*|metall\w*|puddl\w*|rolling mill|coke|smelt\w*|blast|tinplate|wrought iron)|钢|高炉|平炉|转炉|坩埚炉|电弧炉|熔炉|炼炉|鼓风炉|反射炉|搅炼炉|冶炼|铸造|锻造|轧材|炼铁|炼钢|生铁|熟铁|铸铁|铁水/i
const SPACE_RE = /rocket|spacecraft|satellite|space shuttle|space station|apollo|lunar|vostok|soyuz|sputnik|space suit|space capsule|space telescope|space food|space (?:telemetry|module|plane)|spaceplane|火箭|卫星|飞船|航天|太空|登月|阿波罗/i

export function industryOf(e) {
  const base = CATEGORY_INDUSTRY[e.categoryId] || 'power'
  if (MIXED_CATEGORIES.has(e.categoryId)) {
    const text = [e.name, e.description, ...(e.tags || [])].join(' ')
    if (TEXTILE_RE.test(text)) return 'textile'
    if (TRANSPORT_RE.test(text)) return 'transport'
    if (METALLURGY_RE.test(text)) return 'metallurgy'
    if (base === 'computing' && SPACE_RE.test(text)) return 'transport'
  }
  return base
}

// 从 date 字符串解析数值年份（「1776 年」→ 1776，「公元前 196 年」→ -196）
export function parseDateField(s) {
  if (!s) return null
  const bc = /公元前|BC\b/.test(s)
  const m = /(\d{3,4})/.exec(s)
  if (!m) return null
  const y = parseInt(m[1], 10)
  return bc ? -y : y
}

// 补齐单件展品的时间轴字段（幂等：已有字段不覆盖）
export function fillTimelineFields(e) {
  if (e.year == null) {
    const y = parseDateField(e.date)
    if (y != null) e.year = y
  }
  if (!e.industryId) e.industryId = industryOf(e)
  return e
}
