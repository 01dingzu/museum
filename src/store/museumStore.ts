import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Exhibit, HallId, View } from '../types'

interface MuseumState {
  view: View
  customExhibits: Exhibit[]
  favorites: string[]
  // 大数据加载：按馆缓存的展品 + 首页元数据
  exhibitsByHall: Partial<Record<HallId, Exhibit[]>>
  hallCounts: Partial<Record<HallId, number>>
  featured: Partial<Record<HallId, Exhibit[]>>
  manifestLoaded: boolean
  addExhibit: (exhibit: Exhibit) => void
  removeExhibit: (id: string) => void
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  navigateHome: () => void
  navigateHall: (hallId: HallId) => void
  navigateDetail: (exhibitId: string) => void
  loadHall: (hallId: HallId) => Promise<Exhibit[]>
  loadManifest: () => Promise<void>
  findExhibit: (id: string) => Promise<Exhibit | undefined>
}

let idCounter = 0
function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

const BASE = import.meta.env.BASE_URL

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// 从 id 解析出所属展馆（id 格式：{hallId}-{source}-{objectId}）
function hallOf(id: string): HallId {
  if (id.startsWith('antiquity-')) return 'antiquity'
  if (id.startsWith('industry-')) return 'industry'
  if (id.startsWith('nature-')) return 'nature'
  if (id.startsWith('finance-')) return 'finance'
  if (id.startsWith('art-')) return 'art'
  if (id.startsWith('music-')) return 'music'
  return 'antiquity'
}

export const useMuseumStore = create<MuseumState>()(
  persist(
    (set, get) => ({
      view: { name: 'home' },
      customExhibits: [],
      favorites: [],
      exhibitsByHall: {},
      hallCounts: {},
      featured: {},
      manifestLoaded: false,

      addExhibit: (exhibit) =>
        set((s) => ({
          customExhibits: [
            { ...exhibit, id: exhibit.id || genId('custom'), custom: true },
            ...s.customExhibits,
          ],
        })),

      removeExhibit: (id) =>
        set((s) => ({
          customExhibits: s.customExhibits.filter((e) => e.id !== id),
          favorites: s.favorites.filter((f) => f !== id),
        })),

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),

      isFavorite: (id) => get().favorites.includes(id),

      navigateHome: () => set({ view: { name: 'home' } }),
      navigateHall: (hallId) => set({ view: { name: 'hall', hallId } }),
      navigateDetail: (exhibitId) => set({ view: { name: 'detail', exhibitId } }),

      loadHall: async (hallId) => {
        const cached = get().exhibitsByHall[hallId]
        if (cached) return cached
        const data = await fetchJson<Exhibit[]>(`${BASE}data/${hallId}.json`)
        set((s) => ({
          exhibitsByHall: { ...s.exhibitsByHall, [hallId]: data },
        }))
        return data
      },

      loadManifest: async () => {
        if (get().manifestLoaded) return
        try {
          const m = await fetchJson<{
            [K in HallId]?: { count: number; featured: Exhibit[] }
          }>(`${BASE}data/manifest.json`)
          const hallCounts: Partial<Record<HallId, number>> = {}
          const featured: Partial<Record<HallId, Exhibit[]>> = {}
          for (const k of ['antiquity', 'industry', 'nature', 'finance', 'art', 'music'] as HallId[]) {
            if (m[k]) {
              hallCounts[k] = m[k]!.count
              featured[k] = m[k]!.featured
            }
          }
          set({ hallCounts, featured, manifestLoaded: true })
        } catch (_err) {
          // manifest 缺失时降级为空，不阻塞首页
          set({ manifestLoaded: true })
        }
      },

      findExhibit: async (id) => {
        // 1. 用户自定义展品
        const custom = get().customExhibits.find((e) => e.id === id)
        if (custom) return custom
        // 2. 首页精选
        for (const list of Object.values(get().featured)) {
          const hit = list.find((e) => e.id === id)
          if (hit) return hit
        }
        // 3. 已缓存的馆数据
        for (const list of Object.values(get().exhibitsByHall)) {
          const hit = list.find((e) => e.id === id)
          if (hit) return hit
        }
        // 4. 兜底：按 id 前缀加载对应馆
        const hallId = hallOf(id)
        const list = await get().loadHall(hallId)
        return list.find((e) => e.id === id)
      },
    }),
    {
      name: 'museum-store',
      partialize: (s) => ({
        customExhibits: s.customExhibits,
        favorites: s.favorites,
      }),
    },
  ),
)
