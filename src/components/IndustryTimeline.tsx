import type { Exhibit, Hall } from '../types'
import { INDUSTRIES, industryOf, ERAS, eraOfYear } from '../data/industries'
import LaneTimeline from './LaneTimeline'
import type { TimelineConfig } from './LaneTimeline'

interface Props {
  exhibits: Exhibit[]
  hall: Hall
  onOpen: (id: string) => void
}

// 工业馆「产业时间轴」：九大产业泳道（渲染逻辑在通用 LaneTimeline 中）
export const industryTimelineConfig: TimelineConfig = {
  lanes: INDUSTRIES,
  laneOf: industryOf,
  eras: ERAS,
  eraOfYear,
  intro:
    '沿产业发展脉络巡礼：每条泳道是一个产业，横轴按时代分段——可以直观看到纺织与冶金率先点亮，电气与交通接棒，信息与机器人在战后爆发。',
  densityTitle: '各时代展品数量分布（左→右：18 世纪前 → 当代）',
  toggleLabel: '📈 产业时间轴',
}

export default function IndustryTimeline({ exhibits, hall, onOpen }: Props) {
  return <LaneTimeline exhibits={exhibits} hall={hall} onOpen={onOpen} config={industryTimelineConfig} />
}
