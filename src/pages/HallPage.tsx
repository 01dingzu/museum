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

// 首屏图加载耗时统计：监听所有 <img> 的 load/error 事件，打印到 console
function watchFirstPaintPerf(hallId: string) {
  if (typeof window === 'undefined') return () => {}
  const start = performance.now()
  const imgs = Array.from(document.images)
  let loaded = 0
  let failed = 0
  const total = imgs.length
  if (total === 0) return () => {}
  const onDone = () => {
    const elapsed = Math.round(performance.now() - start)
    const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
      (r) => r.initiatorType === 'img' && /metmuseum|britishmuseum|wikimedia|galloromeinsmuseum/.test(r.name),
    )
    const actualBytes = resources.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0)
    console.log(
      `[museum perf] ${hallId} 首屏图: ${loaded}/${total} 加载完成, ${failed} 失败, 耗时 ${elapsed}ms, 传输 ~${(actualBytes / 1024).toFixed(0)}KB (${resources.length} 个图床请求)`,
    )
  }
  const handler = (e: Event) => {
    if (e.type === 'load') loaded++
    if (e.type === 'error') failed++
    if (loaded + failed >= total) onDone()
  }
  imgs.forEach((i) => {
    if (i.complete) {
      if (i.naturalWidth > 0) loaded++
      else failed++
    } else {
      i.addEventListener('load', handler, { once: true })
      i.addEventListener('error', handler, { once: true })
    }
  })
  if (loaded + failed >= total) onDone()
  return () => imgs.forEach((i) => {
    i.removeEventListener('load', handler)
    i.removeEventListener('error', handler)
  })
}

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

  // 首屏图加载耗时统计：进馆后约 200ms（等待图片元素挂载）启动一次
  useEffect(() => {
    const cleanup = setTimeout(() => watchFirstPaintPerf(hallId), 200)
    return () => clearTimeout(cleanup)
  }, [hallId])

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
