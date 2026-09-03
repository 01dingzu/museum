import { halls } from '../data/halls'
import { builtInExhibits } from '../data/exhibits'
import { useMuseumStore } from '../store/museumStore'
import ExhibitCard from '../components/ExhibitCard'

const hallIcons: Record<string, string> = {
  antiquity: '🏺',
  industry: '⚙️',
}

export default function HomePage() {
  const navigateHall = useMuseumStore((s) => s.navigateHall)
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const customExhibits = useMuseumStore((s) => s.customExhibits)
  const favorites = useMuseumStore((s) => s.favorites)

  const allExhibits = [...customExhibits, ...builtInExhibits]

  const featured = [
    ...builtInExhibits.filter((e) => e.hall === 'antiquity').slice(0, 4),
    ...builtInExhibits.filter((e) => e.hall === 'industry').slice(0, 4),
  ]

  return (
    <div className="container page">
      <section className="hero">
        <div className="hero-eyebrow">Collection of the World</div>
        <h1 className="hero-title">集合世界博物馆</h1>
        <p className="hero-subtitle">
          一座线上展馆，同时收藏跨越千年的古物与改变世界的工业科学发明。
        </p>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-num">
              {allExhibits.filter((e) => e.hall === 'antiquity').length}
            </div>
            <div className="stat-label">古物馆展品</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              {allExhibits.filter((e) => e.hall === 'industry').length}
            </div>
            <div className="stat-label">工业科学馆展品</div>
          </div>
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
              共 {allExhibits.filter((e) => e.hall === hall.id).length} 件
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

      <h3 className="section-title">精选展品</h3>
      <div className="featured-grid">
        {featured.map((exhibit) => (
          <ExhibitCard
            key={exhibit.id}
            exhibit={exhibit}
            hall={halls.find((h) => h.id === exhibit.hall)!}
            onOpen={navigateDetail}
          />
        ))}
      </div>
    </div>
  )
}
