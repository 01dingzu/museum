import { useEffect } from 'react'
import { halls } from '../data/halls'
import { useMuseumStore } from '../store/museumStore'
import ExhibitCard from '../components/ExhibitCard'
import type { HallId, SpecialId } from '../types'

const hallIcons: Record<string, string> = {
  antiquity: '🏺',
  industry: '⚙️',
  nature: '🦕',
  finance: '🪙',
  art: '🎨',
  music: '🎻',
}

const specials: {
  id: SpecialId
  icon: string
  name: string
  desc: string
  hall: HallId
}[] = [
  {
    id: 'industrial-revolution',
    icon: '⚙️',
    name: '革命主轴',
    desc: '1764–1981：动力、交通、信息、计算四线并进的 19 件里程碑',
    hall: 'industry',
  },
  {
    id: 'antiquity-timeline',
    icon: '🏺',
    name: '年表长廊',
    desc: '把数千件古物按年代排开：从史前工具到近代器物',
    hall: 'antiquity',
  },
  {
    id: 'artists',
    icon: '🎨',
    name: '艺术家长厅',
    desc: '以艺术家为厅——从丢勒到梵高，每位都有一间自己的展厅',
    hall: 'art',
  },
]

export default function HomePage() {
  const navigateHall = useMuseumStore((s) => s.navigateHall)
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const navigateSpecial = useMuseumStore((s) => s.navigateSpecial)
  const customExhibits = useMuseumStore((s) => s.customExhibits)
  const favorites = useMuseumStore((s) => s.favorites)
  const hallCounts = useMuseumStore((s) => s.hallCounts)
  const featured = useMuseumStore((s) => s.featured)
  const loadManifest = useMuseumStore((s) => s.loadManifest)

  useEffect(() => {
    loadManifest()
  }, [loadManifest])

  const countOf = (hallId: HallId) => {
    const builtIn = hallCounts[hallId] ?? 0
    const custom = customExhibits.filter((e) => e.hall === hallId).length
    return builtIn + custom
  }

  const featuredList = halls
    .flatMap((hall) => (featured[hall.id] || []).slice(0, 4))
    .slice(0, 12)

  return (
    <div className="container page">
      <section className="hero">
        <div className="hero-eyebrow">Collection of the World</div>
        <h1 className="hero-title">集合世界博物馆</h1>
        <p className="hero-subtitle">
          一座线上展馆，同时收藏跨越千年的古物、改变世界的工业科学发明、地球亿万年的自然实证、货币演进的财富史、绘画雕塑的艺术瑰宝与人类音乐史上的乐器。
        </p>
        <div className="hero-stats">
          {halls.map((hall) => (
            <div className="stat" key={hall.id}>
              <div className="stat-num">
                {hallCounts[hall.id] !== undefined
                  ? countOf(hall.id).toLocaleString()
                  : '—'}
              </div>
              <div className="stat-label">{hall.name}展品</div>
            </div>
          ))}
          <div className="stat">
            <div className="stat-num">{favorites.length}</div>
            <div className="stat-label">我的收藏</div>
          </div>
        </div>
      </section>

      <div className="halls-grid">
        {halls.map((hall) => (
          <div
            key={hall.id}
            className="hall-card"
            style={{ background: hall.theme.gradient }}
            onClick={() => navigateHall(hall.id)}
          >
            <span className="hall-count">
              共 {hallCounts[hall.id] !== undefined ? countOf(hall.id).toLocaleString() : '…'} 件
            </span>
            <div className="hall-icon">{hallIcons[hall.id]}</div>
            <h2>{hall.name}</h2>
            <div className="hall-subtitle">{hall.subtitle}</div>
            <p>{hall.description}</p>
            <span className="hall-enter" style={{ color: hall.theme.primary }}>
              进入展馆 →
            </span>
          </div>
        ))}
      </div>

      <h3 className="section-title">特别展区</h3>
      <div className="specials-grid">
        {specials.map((sp) => {
          const theme = halls.find((h) => h.id === sp.hall)!.theme
          return (
            <div
              key={sp.id}
              className="special-card"
              style={{ borderColor: theme.primary }}
              onClick={() => navigateSpecial(sp.id)}
            >
              <span className="special-icon">{sp.icon}</span>
              <h4>{sp.name}</h4>
              <p>{sp.desc}</p>
              <span className="special-enter" style={{ color: theme.primary }}>
                进入展区 →
              </span>
            </div>
          )
        })}
      </div>

      {featuredList.length > 0 && (
        <>
          <h3 className="section-title">精选展品</h3>
          <div className="featured-grid">
            {featuredList.map((exhibit, idx) => (
              <ExhibitCard
                key={exhibit.id}
                exhibit={exhibit}
                hall={halls.find((h) => h.id === exhibit.hall)!}
                onOpen={navigateDetail}
                index={idx}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
