import { useMuseumStore } from '../store/museumStore'

export default function TopBar() {
  const view = useMuseumStore((s) => s.view)
  const navigateHome = useMuseumStore((s) => s.navigateHome)

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand" onClick={navigateHome}>
          <span className="brand-icon">🏛️</span>
          <span>集合世界博物馆</span>
        </div>
        <div className="topbar-actions">
          <button
            className={`nav-btn ${view.name === 'home' ? 'active' : ''}`}
            onClick={navigateHome}
          >
            首页
          </button>
        </div>
      </div>
    </header>
  )
}
