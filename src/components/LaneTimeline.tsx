import { useMemo, useState } from 'react'
import type { Exhibit, Hall } from '../types'
import ExhibitCard from './ExhibitCard'

// 通用「泳道 × 时代分段」时间轴组件（工业馆 / 音乐馆共用）
export interface TimelineLane {
  id: string
  name: string
  icon: string
  description: string
}

export interface TimelineEra {
  id: string
  label: string
  note: string
  from: number
  to: number
}

export interface TimelineConfig {
  lanes: TimelineLane[]
  laneOf: (e: Exhibit) => string
  eras: TimelineEra[]
  eraOfYear: (year?: number) => string
  intro: string
  densityTitle: string
  // 浏览方式切换按钮的文案
  toggleLabel?: string
}

interface Props {
  exhibits: Exhibit[]
  hall: Hall
  onOpen: (id: string) => void
  config: TimelineConfig
}

// 每个时代分段默认展示的卡片数（其余收进「展开全部」）
const BUCKET_PAGE = 12

function fmtYear(y?: number) {
  if (y == null) return ''
  return y < 0 ? `公元前 ${-y}` : `${y}`
}

export default function LaneTimeline({ exhibits, hall, onOpen, config }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { lanes, laneOf, eras, eraOfYear, intro, densityTitle } = config

  const laneData = useMemo(() => {
    const byLane = new Map<string, Exhibit[]>()
    for (const e of exhibits) {
      const id = laneOf(e)
      const arr = byLane.get(id)
      if (arr) arr.push(e)
      else byLane.set(id, [e])
    }
    return lanes.filter((l) => byLane.has(l.id)).map((lane) => {
      const items = byLane.get(lane.id)!
      const dated = items
        .filter((e) => e.year != null)
        .sort((a, b) => (a.year as number) - (b.year as number))
      const undated = items.filter((e) => e.year == null)
      const buckets = eras.map((era) => ({
        era,
        items: dated.filter((e) => eraOfYear(e.year) === era.id),
      })).filter((b) => b.items.length > 0)
      return {
        lane,
        buckets,
        undated,
        total: items.length,
        min: dated[0]?.year,
        max: dated[dated.length - 1]?.year,
        datedCount: dated.length,
      }
    })
  }, [exhibits, lanes, laneOf, eras, eraOfYear])

  if (laneData.length === 0) return null

  const toggle = (key: string) =>
    setExpanded((s) => ({ ...s, [key]: !s[key] }))

  const renderBucket = (
    laneKey: string,
    bucketId: string,
    label: string,
    note: string,
    items: Exhibit[],
  ) => {
    const key = `${laneKey}:${bucketId}`
    const open = !!expanded[key]
    const shown = open ? items : items.slice(0, BUCKET_PAGE)
    return (
      <div className="era-bucket" key={bucketId}>
        <div className="era-head">
          <span className="era-label">{label}</span>
          <span className="era-note">{note}</span>
          <span className="era-count">{items.length} 件</span>
        </div>
        <div className="exhibits-grid">
          {shown.map((e, idx) => (
            <ExhibitCard key={e.id} exhibit={e} hall={hall} onOpen={onOpen} index={idx} />
          ))}
        </div>
        {items.length > BUCKET_PAGE && (
          <button className="era-more" onClick={() => toggle(key)}>
            {open ? '收起' : `展开全部 ${items.length.toLocaleString()} 件`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="industry-timeline">
      <div className="timeline-intro">{intro}</div>
      {laneData.map(({ lane, buckets, undated, total, min, max, datedCount }) => {
        const laneKey = lane.id
        // 密度条：每个时代一根小柱，柱高 ∝ √件数（避免大泳道完全压扁小泳道）
        const counts = eras.map(
          (era) => datedCount ? buckets.find((b) => b.era.id === era.id)?.items.length ?? 0 : 0,
        )
        const maxCount = Math.max(...counts, 1)
        return (
          <section className="industry-lane" key={lane.id} id={`lane-${lane.id}`}>
            <div className="lane-header">
              <span className="lane-icon">{lane.icon}</span>
              <div className="lane-title">
                <div className="lane-name">{lane.name}</div>
                <div className="lane-desc">{lane.description}</div>
              </div>
              <div className="lane-meta">
                <div className="lane-count">
                  {total.toLocaleString()} 件
                  {datedCount > 0 && (
                    <span className="lane-span">
                      {' '}
                      · {fmtYear(min)} — {fmtYear(max)}
                    </span>
                  )}
                </div>
                <div className="lane-density" title={densityTitle}>
                  {counts.map((c, i) => (
                    <div
                      key={i}
                      className="lane-density-bar"
                      style={{
                        height: `${Math.max(3, Math.round((Math.sqrt(c) / Math.sqrt(maxCount)) * 26))}px`,
                        opacity: c > 0 ? 1 : 0.12,
                        background: c > 0 ? hall.theme.primary : undefined,
                      }}
                      title={`${eras[i].label}：${c} 件`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="lane-body">
              {buckets.map(({ era, items }) =>
                renderBucket(laneKey, era.id, era.label, era.note, items),
              )}
              {undated.length > 0 &&
                renderBucket(
                  laneKey,
                  'unknown',
                  '年代待考',
                  '数据源未收录确切年份',
                  undated,
                )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
