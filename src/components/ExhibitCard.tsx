import type { Exhibit, Hall } from '../types'
import { useMuseumStore } from '../store/museumStore'

interface Props {
  exhibit: Exhibit
  hall: Hall
  onOpen: (id: string) => void
}

export default function ExhibitCard({ exhibit, hall, onOpen }: Props) {
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

  return (
    <div className="card" onClick={() => onOpen(exhibit.id)}>
      <div
        className="card-visual"
        style={{ background: hall.theme.gradient }}
      >
        {exhibit.imageUrl ? (
          <img
            src={exhibit.imageUrl}
            alt={exhibit.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>{exhibit.icon}</span>
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
