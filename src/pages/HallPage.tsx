import { useEffect, useMemo, useRef, useState } from 'react'
import type { HallId } from '../types'
import { hallMap } from '../data/halls'
import { useMuseumStore } from '../store/museumStore'
import ExhibitCard from '../components/ExhibitCard'
import AddExhibitModal from '../components/AddExhibitModal'

interface Props {
  hallId: HallId
}

const PAGE_SIZE = 60

export default function HallPage({ hallId }: Props) {
  const hall = hallMap[hallId]
  const navigateHome = useMuseumStore((s) => s.navigateHome)
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const customExhibits = useMuseumStore((s) => s.customExhibits)
  const exhibitsByHall = useMuseumStore((s) => s.exhibitsByHall)
  const loadHall = useMuseumStore((s) => s.loadHall)

  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 懒加载展馆数据
  useEffect(() => {
    // 数据已缓存（loadHall 已把结果写入 store）→ 直接结束加载态
    if (exhibitsByHall[hallId]) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    loadHall(hallId)
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [hallId, exhibitsByHall, loadHall])

  const loaded = exhibitsByHall[hallId] || []

  const exhibits = useMemo(
    () => [
      ...customExhibits.filter((e) => e.hall === hallId),
      ...loaded,
    ],
    [customExhibits, loaded, hallId],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exhibits.filter((e) => {
      if (category !== 'all' && e.categoryId !== category) return false
      if (!q) return true
      const hay = [e.name, e.origin, e.era, e.description, ...e.tags]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [exhibits, category, search])

  // 搜索 / 分类变化时重置滚动
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [category, search])

  // 无限滚动：sentinel 进入视口时加载更多
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) =>
            c < filtered.length ? c + PAGE_SIZE : c,
          )
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [filtered.length])

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="container page">
      <div className="hall-header">
        <div className="breadcrumb">
          <button onClick={navigateHome}>首页</button>
          <span> / {hall.name}</span>
        </div>
        <h1>{hall.name}</h1>
        <div className="hall-subtitle">{hall.subtitle}</div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索展品名称、文明、时代……"
          />
        </div>
        <button
          className="add-btn"
          style={{ background: hall.theme.primary }}
          onClick={() => setShowAdd(true)}
        >
          + 录入展品
        </button>
      </div>

      <div className="category-tabs">
        <button
          className={`cat-tab ${category === 'all' ? 'active' : ''}`}
          style={
            category === 'all' ? { background: hall.theme.primary } : undefined
          }
          onClick={() => setCategory('all')}
        >
          全部（{exhibits.length.toLocaleString()}）
        </button>
        {hall.categories.map((c) => (
          <button
            key={c.id}
            className={`cat-tab ${category === c.id ? 'active' : ''}`}
            style={
              category === c.id ? { background: hall.theme.primary } : undefined
            }
            onClick={() => setCategory(c.id)}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>正在加载展品数据…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <p>没有找到符合条件的展品，试试调整关键词或分类。</p>
        </div>
      ) : (
        <>
          <div className="exhibits-grid">
            {visible.map((exhibit, idx) => (
              <ExhibitCard
                key={exhibit.id}
                exhibit={exhibit}
                hall={hall}
                onOpen={navigateDetail}
                index={idx}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} className="load-more">
              <div className="loading-spinner" />
              <span>
                已显示 {visibleCount.toLocaleString()} /{' '}
                {filtered.length.toLocaleString()} 件，滚动加载更多…
              </span>
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddExhibitModal defaultHall={hallId} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}
