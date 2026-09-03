import { hallMap } from '../data/halls'
import { builtInExhibits } from '../data/exhibits'
import { useMuseumStore } from '../store/museumStore'

interface Props {
  exhibitId: string
}

export default function DetailPage({ exhibitId }: Props) {
  const customExhibits = useMuseumStore((s) => s.customExhibits)
  const favorites = useMuseumStore((s) => s.favorites)
  const toggleFavorite = useMuseumStore((s) => s.toggleFavorite)
  const removeExhibit = useMuseumStore((s) => s.removeExhibit)
  const navigateHall = useMuseumStore((s) => s.navigateHall)
  const navigateHome = useMuseumStore((s) => s.navigateHome)

  const exhibit = [
    ...customExhibits,
    ...builtInExhibits,
  ].find((e) => e.id === exhibitId)

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
          {exhibit.imageUrl ? (
            <img src={exhibit.imageUrl} alt={exhibit.name} />
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
                <span
                  key={t}
                  className={`tag ${hall.id === 'industry' ? 'steel' : ''}`}
                >
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
