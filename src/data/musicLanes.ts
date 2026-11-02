import type { Exhibit } from '../types'
import type { TimelineLane, TimelineEra } from '../components/LaneTimeline'

// 音乐乐器馆「音乐时间轴」：六条泳道（五大乐器家族 + 乐谱与手稿）
export const MUSIC_LANES: TimelineLane[] = [
  { id: 'string', name: '弦乐器', icon: '🎻', description: '从琉特琴与提琴家族到吉他与电贝斯' },
  { id: 'keyboard', name: '键盘乐器', icon: '🎹', description: '羽管键琴、古钢琴到现代钢琴与电子琴' },
  { id: 'woodwind', name: '木管乐器', icon: '🪈', description: '竖笛、长笛、单簧管与萨克斯' },
  { id: 'brass', name: '铜管乐器', icon: '🎺', description: '小号、圆号、长号与大号' },
  { id: 'percussion', name: '打击乐器', icon: '🥁', description: '定音鼓、木琴到马林巴与架子鼓' },
  { id: 'scores', name: '乐谱与手稿', icon: '🎼', description: '公版乐谱影像——从巴赫手稿到印象派总谱' },
]

export const musicLaneMap: Record<string, TimelineLane> = Object.fromEntries(
  MUSIC_LANES.map((l) => [l.id, l]),
)

// 泳道归属：数据里 categoryId 即乐器家族；未知分类兜底进弦乐（与 HallPage 分类 tab 一致）
export function musicLaneOf(e: Exhibit): string {
  return musicLaneMap[e.categoryId] ? e.categoryId : 'string'
}

// 时代分段（乐器的历史分期，横轴）
export const MUSIC_ERAS: TimelineEra[] = [
  { id: 'pre-1500', label: '1500 年前', note: '古代与中世纪：里拉、编钟与管风琴雏形', from: -Infinity, to: 1500 },
  { id: 'e1500-1600', label: '1500–1600', note: '文艺复兴：提琴家族成型', from: 1500, to: 1600 },
  { id: 'e1600-1750', label: '1600–1750', note: '巴洛克：键盘与弦乐的黄金期', from: 1600, to: 1750 },
  { id: 'e1750-1820', label: '1750–1820', note: '古典主义：钢琴取代羽管键琴', from: 1750, to: 1820 },
  { id: 'e1820-1900', label: '1820–1900', note: '浪漫主义：交响乐队的标准化', from: 1820, to: 1900 },
  { id: 'e1900-1950', label: '1900–1950', note: '近现代：爵士乐器与电吉他登场', from: 1900, to: 1950 },
  { id: 'post-1950', label: '1950 年后', note: '当代：电声、合成器与数字乐器', from: 1950, to: Infinity },
]

export function musicEraOfYear(year?: number): string {
  if (year == null) return 'unknown'
  const era = MUSIC_ERAS.find((e) => year >= e.from && year < e.to)
  return era?.id ?? 'post-1950'
}

// 音乐时间轴配置（HallPage 消费）
export const musicTimelineConfig = {
  lanes: MUSIC_LANES,
  laneOf: musicLaneOf,
  eras: MUSIC_ERAS,
  eraOfYear: musicEraOfYear,
  intro:
    '沿乐器演进脉络巡礼：每条泳道是一个乐器家族，横轴按音乐史分期——可以看到管风琴与打击乐几乎与文明同龄，提琴与键盘在巴洛克定型，电声乐器直到 20 世纪才点亮。',
  densityTitle: '各时代展品数量分布（左→右：1500 年前 → 当代）',
  toggleLabel: '🎼 音乐时间轴',
}
