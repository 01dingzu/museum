import { useEffect, useState } from 'react'
import { hallMap } from '../data/halls'
import { useMuseumStore } from '../store/museumStore'
import type { Exhibit } from '../types'

interface Props {
  exhibitId: string
}

export default function DetailPage({ exhibitId }: Props) {
  const favorites = useMuseumStore((s) => s.favorites)
  const toggleFavorite = useMuseumStore((s) => s.toggleFavorite)
  const removeExhibit = useMuseumStore((s) => s.removeExhibit)
  const navigateHall = useMuseumStore((s) => s.navigateHall)
  const navigateHome = useMuseumStore((s) => s.navigateHome)
  const findExhibit = useMuseumStore((s) => s.findExhibit)

  const [exhibit, setExhibit] = useState<Exhibit | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setExhibit(null)
    findExhibit(exhibitId)
      .then((e) => {
        if (alive) setExhibit(e || null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [exhibitId, findExhibit])

  if (loading) {
    return (
      <div className="container page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>正在加载展品…</p>
        </div>
      </div>
    )
  }

  if (!exhibit) {
    return (
      <div className="container page">
        <div className="empty">
          <div className="empty-icon">🏛️</div>
          <p>未找到该展品，可能已被删除。</p>
          <button
            className="back-btn"
            style={{ marginTop: 12 }}
            onClick={navigateHome}
          >
            ← 返回首页
          </button>
        </div>
      </div>
    )
  }

  const hall = hallMap[exhibit.hall]
  const category = hall.categories.find((c) => c.id === exhibit.categoryId)
  const favorite = favorites.includes(exhibit.id)
  const image = exhibit.imageLarge || exhibit.imageUrl
  const tagClass = exhibit.hall === 'industry' ? 'steel' : exhibit.hall === 'nature' ? 'nature' : ''

  const infoItems: Array<[string, string]> = [
    ['国别 / 文明', exhibit.origin],
    ['时代 / 时期', exhibit.era],
    ['年代', exhibit.date],
    ['出土地 / 制造地', exhibit.location],
    ['现藏 / 机构', exhibit.collection],
    ['材质 / 技术', exhibit.material],
    ['尺寸 / 规格', exhibit.dimensions],
  ].filter(
    (item): item is [string, string] =>
      typeof item[1] === 'string' && item[1].trim() !== '',
  )

  return (
    <div className="container page">
      <div className="detail-wrap">
        <button className="back-btn" onClick={() => navigateHall(exhibit.hall)}>
          ← 返回{hall.name}
        </button>

        <div
          className="detail-hero"
          style={{ background: hall.theme.gradient }}
        >
          {image ? (
            <img src={image} alt={exhibit.name} loading="lazy" />
          ) : (
            <span>{exhibit.icon}</span>
          )}
          <button
            className="detail-fav"
            onClick={() => toggleFavorite(exhibit.id)}
          >
            {favorite ? '⭐ 已收藏' : '☆ 收藏'}
          </button>
        </div>

        <div className="detail-body">
          <h1 className="detail-name">{exhibit.name}</h1>
          <div className="detail-sub">
            {category && `${category.icon} ${category.name}`} · {hall.name}
            {exhibit.custom && ' · 我的展品'}
          </div>

          <p className="detail-desc">{exhibit.description}</p>

          {exhibit.tags.length > 0 && (
            <div className="detail-tags">
              {exhibit.tags.map((t) => (
                <span key={t} className={`tag ${tagClass}`}>
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="info-table">
            {infoItems.map(([label, value]) => (
              <div className="info-row" key={label}>
                <div className="info-label">{label}</div>
                <div>{value}</div>
              </div>
            ))}
          </div>

          {exhibit.source && (
            <div className="detail-source">
              <span className="detail-source-label">数据来源</span>
              {exhibit.sourceUrl ? (
                <a
                  href={exhibit.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {exhibit.source} ↗
                </a>
              ) : (
                <span>{exhibit.source}</span>
              )}
            </div>
          )}

          {exhibit.custom && (
            <div className="detail-actions">
              <button
                className="btn-danger"
                onClick={() => {
                  removeExhibit(exhibit.id)
                  navigateHall(exhibit.hall)
                }}
              >
                删除此展品
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
