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

  return (
    <div className="card" onClick={() => onOpen(exhibit.id)}>
      <div
        className="card-visual"
        style={{ background: hall.theme.gradient }}
      >
        {exhibit.imageUrl ? (
          <img src={exhibit.imageUrl} alt={exhibit.name} />
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
        <div className="card-meta">
          {exhibit.origin} · {exhibit.date}
        </div>
        <div className="card-tag-row">
          {category && (
            <span className={`tag ${hall.id === 'industry' ? 'steel' : ''}`}>
              {category.icon} {category.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
