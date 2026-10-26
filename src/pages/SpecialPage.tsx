import { useEffect, useMemo, useState } from 'react'
import type { Exhibit, HallId, SpecialId } from '../types'
import { hallMap } from '../data/halls'
import { useMuseumStore } from '../store/museumStore'
import ExhibitCard from '../components/ExhibitCard'

/* ---------- 数据结构（对齐 scripts/gen-specials.mjs 输出） ---------- */

interface RevNode {
  id: string
  name: string
  year: number
  dateLabel: string
  era: string
  imageUrl: string
}
interface RevLane {
  id: string
  name: string
  color: string
  icon: string
  nodes: RevNode[]
}
interface RevData {
  title: string
  subtitle: string
  lanes: RevLane[]
  range: [number, number]
}

interface ArtistWork {
  id: string
  name: string
  imageUrl: string
}
interface Artist {
  name: string
  cn: string | null
  count: number
  works: ArtistWork[]
}
interface ArtistsData {
  title: string
  subtitle: string
  artists: Artist[]
}

interface AntiItem {
  id: string
  name: string
  year: number
  span: boolean
  dateLabel: string
  era: string
  categoryId: string
  imageUrl: string
}
interface AntiData {
  title: string
  subtitle: string
  items: AntiItem[]
  failed: number
}

/* ---------- 通用：轻量条目 → Exhibit（复用 ExhibitCard 与详情页） ---------- */

function toExhibit(base: Partial<Exhibit> & { id: string; name: string }, hallId: HallId): Exhibit {
  return {
    hall: hallId,
    categoryId: '',
    origin: '',
    era: '',
    date: '',
    location: '',
    collection: '',
    description: '',
    tags: [],
    icon: '🖼️',
    ...base,
  }
}

/* ---------- 展区一：工业革命主轴 ---------- */

const AXIS_TICKS = [1764, 1800, 1850, 1900, 1950, 1981]

function RevolutionAxis() {
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const loadSpecial = useMuseumStore((s) => s.loadSpecial)
  const data = useMuseumStore((s) => s.specials['industrial-revolution']) as RevData | undefined
  const [error, setError] = useState(false)

  useEffect(() => {
    loadSpecial('industrial-revolution').catch(() => setError(true))
  }, [loadSpecial])

  if (error) return <div className="empty"><p>主轴数据加载失败，请刷新重试。</p></div>
  if (!data) return <Loading />

  const [y0, y1] = data.range
  const pos = (year: number) => ((year - y0) / (y1 - y0)) * 100

  return (
    <div className="rev-axis-wrap">
      <div className="rev-axis-scroll">
        <div className="rev-axis-inner" style={{ minWidth: 960 }}>
          <div className="rev-axis-ruler">
            {AXIS_TICKS.map((t) => (
              <span key={t} style={{ left: `${pos(t)}%` }}>
                {t}
              </span>
            ))}
          </div>
          {data.lanes.map((lane) => (
            <div className="rev-lane" key={lane.id}>
              <div className="rev-lane-head">
                <span className="rev-lane-icon">{lane.icon}</span>
                <span className="rev-lane-name" style={{ color: lane.color }}>
                  {lane.name}
                </span>
              </div>
              <div className="rev-lane-track">
                <div className="rev-lane-line" style={{ background: lane.color }} />
                {lane.nodes.map((n, i) => (
                  <button
                    key={n.id}
                    className={`rev-node ${i % 2 === 1 ? 'rev-node-down' : ''}`}
                    style={{ left: `${pos(n.year)}%` }}
                    onClick={() => navigateDetail(n.id)}
                    title={n.era}
                  >
                    <span className="rev-node-dot" style={{ background: lane.color }} />
                    <span className="rev-node-year">{n.year}</span>
                    <span className="rev-node-name">{n.name}</span>
                    <span className="rev-node-era">{n.era}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="rev-note">
        19 件里程碑沿四条线并进——动力、交通、信息、计算。点任意节点查看详情。
      </p>
    </div>
  )
}

/* ---------- 展区二：古物年表长廊 ---------- */

interface CenturyBucket {
  key: string
  label: string
  from: number
  to: number
  items: AntiItem[]
}

function buildBuckets(items: AntiItem[]): CenturyBucket[] {
  const map = new Map<string, CenturyBucket>()
  for (const it of items) {
    let from: number
    let label: string
    if (it.year < 0) {
      const k = Math.ceil(-it.year / 500) * 500
      from = -k
      label = `前 ${k.toLocaleString()} 年`
    } else {
      const c = Math.floor(it.year / 100)
      from = c * 100
      label = `${c + 1} 世纪`
    }
    const to = it.year < 0 ? from + 500 : from + 100
    const key = String(from)
    let b = map.get(key)
    if (!b) {
      b = { key, label, from, to, items: [] }
      map.set(key, b)
    }
    b.items.push(it)
  }
  return [...map.values()].sort((a, b) => a.from - b.from)
}

function AntiquityTimeline() {
  const hall = hallMap['antiquity']
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const loadSpecial = useMuseumStore((s) => s.loadSpecial)
  const data = useMuseumStore((s) => s.specials['antiquity-timeline']) as AntiData | undefined
  const [error, setError] = useState(false)
  const [bucketKey, setBucketKey] = useState<string | null>(null)

  useEffect(() => {
    loadSpecial('antiquity-timeline').catch(() => setError(true))
  }, [loadSpecial])

  const buckets = useMemo(() => (data ? buildBuckets(data.items) : []), [data])
  const maxCount = useMemo(() => Math.max(1, ...buckets.map((b) => b.items.length)), [buckets])
  const active = buckets.find((b) => b.key === bucketKey) || null
  const PAGE = 60
  const [visible, setVisible] = useState(PAGE)

  if (error) return <div className="empty"><p>年表数据加载失败，请刷新重试。</p></div>
  if (!data) return <Loading />

  return (
    <div>
      <div className="anti-overview">
        {buckets.map((b) => (
          <button
            key={b.key}
            className={`anti-bar ${bucketKey === b.key ? 'active' : ''}`}
            style={{ height: `${Math.max(6, (b.items.length / maxCount) * 100)}px` }}
            title={`${b.label}：${b.items.length} 件`}
            onClick={() => {
              setBucketKey(bucketKey === b.key ? null : b.key)
              setVisible(PAGE)
            }}
          />
        ))}
      </div>
      <div className="anti-overview-label">
        每根柱是一个时代（公元前按 500 年、公元后按世纪），高度 = 展品数。共{' '}
        {data.items.length.toLocaleString()} 件已排入年表{data.failed > 0 && `，${data.failed} 件暂无法断代` }。
      </div>

      {active ? (
        <>
          <div className="anti-active-head">
            <button className="anti-back" onClick={() => setBucketKey(null)}>
              ← 返回全览
            </button>
            <h3>
              {active.label} · {active.items.length} 件
            </h3>
          </div>
          <div className="exhibits-grid">
            {active.items.slice(0, visible).map((it) => (
              <ExhibitCard
                key={it.id}
                exhibit={toExhibit(
                  {
                    id: it.id,
                    name: it.name,
                    date: it.dateLabel,
                    era: it.era,
                    origin: it.era,
                    categoryId: it.categoryId,
                    imageUrl: it.imageUrl,
                    icon: '🏺',
                  },
                  'antiquity',
                )}
                hall={hall}
                onOpen={navigateDetail}
              />
            ))}
          </div>
          {visible < active.items.length && (
            <div className="load-more">
              <button className="anti-more" onClick={() => setVisible((v) => v + PAGE)}>
                继续显示（{visible} / {active.items.length}）
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="anti-hint">点击柱子查看对应时代的展品。</p>
      )}
    </div>
  )
}

/* ---------- 展区三：艺术家长厅 ---------- */

function ArtistsHall() {
  const hall = hallMap['art']
  const navigateDetail = useMuseumStore((s) => s.navigateDetail)
  const loadSpecial = useMuseumStore((s) => s.loadSpecial)
  const featured = useMuseumStore((s) => s.featured['art'])
  const loadManifest = useMuseumStore((s) => s.loadManifest)
  const manifestLoaded = useMuseumStore((s) => s.manifestLoaded)
  const data = useMuseumStore((s) => s.specials['artists']) as ArtistsData | undefined
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Artist | null>(null)

  useEffect(() => {
    loadSpecial('artists').catch(() => setError(true))
    if (!manifestLoaded) loadManifest()
  }, [loadSpecial, loadManifest, manifestLoaded])

  if (error) return <div className="empty"><p>长厅数据加载失败，请刷新重试。</p></div>
  if (!data) return <Loading />

  // 选中某位艺术家：全作品视图
  if (selected) {
    return (
      <div>
        <div className="anti-active-head">
          <button className="anti-back" onClick={() => setSelected(null)}>
            ← 返回长厅
          </button>
          <h3>
            {selected.cn || selected.name} · {selected.count} 件
          </h3>
          {selected.cn && <div className="anti-active-sub">{selected.name}</div>}
        </div>
        <div className="exhibits-grid">
          {selected.works.map((w) => (
            <ExhibitCard
              key={w.id}
              exhibit={toExhibit(
                { id: w.id, name: w.name, imageUrl: w.imageUrl, icon: '🎨' },
                'art',
              )}
              hall={hall}
              onOpen={navigateDetail}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {featured && featured.length > 0 && (
        <>
          <h3 className="section-title">镇馆之墙</h3>
          <div className="featured-grid art-masterwall">
            {featured.map((ex, i) => (
              <ExhibitCard
                key={ex.id}
                exhibit={ex}
                hall={hall}
                onOpen={navigateDetail}
                index={i}
              />
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">艺术家长厅 · {data.artists.length} 位</h3>
      <div className="artist-grid">
        {data.artists.map((a) => (
          <button className="artist-card" key={a.name} onClick={() => setSelected(a)}>
            <div className="artist-strip">
              {a.works.slice(0, 3).map((w) => (
                <img key={w.id} src={w.imageUrl} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
            <div className="artist-body">
              <div className="artist-name">{a.cn || a.name}</div>
              {a.cn && <div className="artist-name-en">{a.name}</div>}
              <div className="artist-count">{a.count} 件馆藏</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- 容器 ---------- */

const SPECIAL_META: Record<
  SpecialId,
  { title: string; subtitle: string; icon: string; hallId: HallId }
> = {
  'industrial-revolution': {
    title: '革命主轴',
    subtitle: '1764–1981：动力、交通、信息、计算四条线如何把世界拧成现代的样子',
    icon: '⚙️',
    hallId: 'industry',
  },
  'antiquity-timeline': {
    title: '年表长廊',
    subtitle: '把数千年文明史按年代排开——从史前工具到近代器物',
    icon: '🏺',
    hallId: 'antiquity',
  },
  artists: {
    title: '艺术家长厅',
    subtitle: '以艺术家为厅：每位作品超过十件的艺术家，都值得单独一间展厅',
    icon: '🎨',
    hallId: 'art',
  },
}

function Loading() {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p>正在加载展区数据…</p>
    </div>
  )
}

export default function SpecialPage({ specialId }: { specialId: SpecialId }) {
  const navigateHome = useMuseumStore((s) => s.navigateHome)
  const meta = SPECIAL_META[specialId]
  const theme = hallMap[meta.hallId].theme

  return (
    <div className="container page">
      <div className="hall-header special-header" style={{ borderLeftColor: theme.primary }}>
        <div className="breadcrumb">
          <button onClick={navigateHome}>首页</button>
          <span> / 特别展区 / {meta.title}</span>
        </div>
        <h1>
          <span className="special-icon">{meta.icon}</span> {meta.title}
        </h1>
        <div className="hall-subtitle">{meta.subtitle}</div>
      </div>
      {specialId === 'industrial-revolution' && <RevolutionAxis />}
      {specialId === 'antiquity-timeline' && <AntiquityTimeline />}
      {specialId === 'artists' && <ArtistsHall />}
    </div>
  )
}
