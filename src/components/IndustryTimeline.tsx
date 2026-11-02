import { useMemo, useState } from 'react'
import type { Exhibit, Hall } from '../types'
import { INDUSTRIES, industryOf, ERAS, eraOfYear } from '../data/industries'
import ExhibitCard from './ExhibitCard'

interface Props {
  exhibits: Exhibit[]
  hall: Hall
  onOpen: (id: string) => void
}

// 每个时代分段默认展示的卡片数（其余收进「展开全部」）
const BUCKET_PAGE = 12

function fmtYear(y?: number) {
  if (y == null) return ''
  return y < 0 ? `公元前 ${-y}` : `${y}`
}

export default function IndustryTimeline({ exhibits, hall, onOpen }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const lanes = useMemo(() => {
    const byIndustry = new Map<string, Exhibit[]>()
    for (const e of exhibits) {
      const id = industryOf(e)
      const arr = byIndustry.get(id)
      if (arr) arr.push(e)
      else byIndustry.set(id, [e])
    }
    return INDUSTRIES.filter((i) => byIndustry.has(i.id)).map((industry) => {
      const items = byIndustry.get(industry.id)!
      const dated = items
        .filter((e) => e.year != null)
        .sort((a, b) => (a.year as number) - (b.year as number))
      const undated = items.filter((e) => e.year == null)
      const buckets = ERAS.map((era) => ({
        era,
        items: dated.filter((e) => eraOfYear(e.year) === era.id),
      })).filter((b) => b.items.length > 0)
      return {
        industry,
        buckets,
        undated,
        total: items.length,
        min: dated[0]?.year,
        max: dated[dated.length - 1]?.year,
        datedCount: dated.length,
      }
    })
  }, [exhibits])

  if (lanes.length === 0) return null

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
      <div className="timeline-intro">
        沿产业发展脉络巡礼：每条泳道是一个产业，横轴按时代分段——可以直观看到纺织与冶金率先点亮，
        电气与交通接棒，信息与机器人在战后爆发。
      </div>
      {lanes.map(({ industry, buckets, undated, total, min, max, datedCount }) => {
        const laneKey = industry.id
        // 密度条：每个时代一根小柱，柱高 ∝ √件数（避免大泳道完全压扁小泳道）
        const counts = ERAS.map(
          (era) => datedCount ? buckets.find((b) => b.era.id === era.id)?.items.length ?? 0 : 0,
        )
        const maxCount = Math.max(...counts, 1)
        return (
          <section className="industry-lane" key={industry.id} id={`lane-${industry.id}`}>
            <div className="lane-header">
              <span className="lane-icon">{industry.icon}</span>
              <div className="lane-title">
                <div className="lane-name">{industry.name}</div>
                <div className="lane-desc">{industry.description}</div>
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
                <div
                  className="lane-density"
                  title="各时代展品数量分布（左→右：18 世纪前 → 当代）"
                >
                  {counts.map((c, i) => (
                    <div
                      key={i}
                      className="lane-density-bar"
                      style={{
                        height: `${Math.max(3, Math.round((Math.sqrt(c) / Math.sqrt(maxCount)) * 26))}px`,
                        opacity: c > 0 ? 1 : 0.12,
                        background: c > 0 ? hall.theme.primary : undefined,
                      }}
                      title={`${ERAS[i].label}：${c} 件`}
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
                  'Wikidata 未收录确切年份',
                  undated,
                )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
