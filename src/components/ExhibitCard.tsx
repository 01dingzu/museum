import { useState } from 'react'
import type { Exhibit, Hall } from '../types'
import { useMuseumStore } from '../store/museumStore'

interface Props {
  exhibit: Exhibit
  hall: Hall
  onOpen: (id: string) => void
  // 卡片在网格中的位置；前几张标记为高优先级
  index?: number
}

export default function ExhibitCard({ exhibit, hall, onOpen, index = 99 }: Props) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const isFavorite = useMuseumStore((s) => s.isFavorite(exhibit.id))
  const toggleFavorite = useMuseumStore((s) => s.toggleFavorite)
  const favorite = isFavorite

  const category = hall.categories.find((c) => c.id === exhibit.categoryId)
  // 采集类展品（origin/date 为空）时，退而展示描述或来源
  const meta =
    [exhibit.origin, exhibit.date].filter(Boolean).join(' · ') ||
    exhibit.tags?.[0] ||
    exhibit.collection ||
    ''

  // 前 6 张图用 high 优先级（首屏可见），其余让浏览器自行排程
  const fetchpriority = index < 6 ? 'high' : 'low'

  return (
    <div className="card" onClick={() => onOpen(exhibit.id)}>
      <div
        className="card-visual"
        style={{ background: hall.theme.gradient }}
      >
        {exhibit.imageUrl && !imgError ? (
          <img
            src={exhibit.imageUrl}
            alt={exhibit.name}
            loading="lazy"
            decoding="async"
            fetchPriority={fetchpriority as 'high' | 'low' | 'auto'}
            className={imgLoaded ? 'is-loaded' : 'is-loading'}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="card-fallback">
            <span className="card-fallback-icon">{exhibit.icon}</span>
            <span className="card-fallback-name">{exhibit.name}</span>
          </div>
        )}
        {!imgLoaded && exhibit.imageUrl && !imgError && (
          <div className="card-skeleton" aria-hidden="true" />
        )}
        {exhibit.custom && <span className="card-custom-badge">我的展品</span>}
      </div>
      <button
        className="card-fav"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite(exhibit.id)
        }}
        aria-label="收藏"
      >
        {favorite ? '⭐' : '☆'}
      </button>
      <div className="card-body">
        <div className="card-name">{exhibit.name}</div>
        <div className="card-meta">{meta}</div>
        <div className="card-tag-row">
          {category && (
            <span
              className={`tag ${
                hall.id === 'industry'
                  ? 'steel'
                  : hall.id === 'nature'
                    ? 'nature'
                    : ''
              }`}
            >
              {category.icon} {category.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
