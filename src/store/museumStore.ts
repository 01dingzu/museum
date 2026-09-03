import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Exhibit, View } from '../types'

interface MuseumState {
  view: View
  customExhibits: Exhibit[]
  favorites: string[]
  addExhibit: (exhibit: Exhibit) => void
  removeExhibit: (id: string) => void
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  navigateHome: () => void
  navigateHall: (hallId: 'antiquity' | 'industry') => void
  navigateDetail: (exhibitId: string) => void
}

let idCounter = 0
function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export const useMuseumStore = create<MuseumState>()(
  persist(
    (set, get) => ({
      view: { name: 'home' },
      customExhibits: [],
      favorites: [],

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
