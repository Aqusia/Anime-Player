import { create } from 'zustand'
import { api, type Anime, type AnimeDownload, type MetaLite, type MetaStatus, type MyAnime, type Progress } from './api'

interface State {
  list: Anime[]
  byId: Record<string, Anime>
  myList: string[]
  watched: string[]
  meta: Record<string, MetaLite>
  metaStatus: MetaStatus
  downloads: Record<string, AnimeDownload>
  myById: Record<string, MyAnime> // myself catalog by thread id (lazy, for my-list rendering)
  progressByCat: Record<string, Progress> // latest progress per anime (for poster status markers)
  loaded: boolean
  loading: boolean
  error: string | null
  load: (force?: boolean) => Promise<void>
  loadMeta: () => Promise<void>
  setMetaStatus: (s: MetaStatus) => void
  loadDownloads: () => Promise<void>
  setDownloads: (d: Record<string, AnimeDownload>) => void
  loadMyCatalog: () => Promise<void>
  toggleMy: (catId: string) => Promise<void>
  toggleWatched: (catId: string) => Promise<void>
  markWatched: (catId: string) => Promise<void>
  loadProgress: () => Promise<void>
  notePlayed: (p: Progress) => void
}

export const useStore = create<State>((set, get) => ({
  list: [],
  byId: {},
  myList: [],
  watched: [],
  meta: {},
  metaStatus: { building: false, done: 0, total: 0, builtAt: 0 },
  downloads: {},
  myById: {},
  progressByCat: {},
  loaded: false,
  loading: false,
  error: null,
  load: async (force?: boolean) => {
    if (get().loading) return
    if (get().loaded && !force) return
    set({ loading: true, error: null })
    try {
      const [list, myList, watched] = await Promise.all([api.list(force), api.myList(), api.watchedGet()])
      const byId: Record<string, Anime> = {}
      for (const a of list) byId[a.catId] = a
      set({ list, byId, myList, watched, loaded: true, loading: false })
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e) })
    }
  },
  loadMeta: async () => {
    try {
      const [meta, status] = await Promise.all([api.metaAll(), api.metaStatus()])
      set({ meta, metaStatus: status })
    } catch {
      /* ignore */
    }
  },
  setMetaStatus: (s: MetaStatus) => set({ metaStatus: s }),
  loadDownloads: async () => {
    try {
      const d = await api.downloadAll()
      set({ downloads: d })
    } catch {
      /* ignore */
    }
  },
  setDownloads: (d: Record<string, AnimeDownload>) => set({ downloads: d }),
  loadMyCatalog: async () => {
    if (Object.keys(get().myById).length) return
    try {
      const c = await api.myselfCatalog()
      const m: Record<string, MyAnime> = {}
      for (const a of c) m[a.id] = a
      set({ myById: m })
    } catch {
      /* ignore */
    }
  },
  toggleMy: async (catId: string) => {
    const next = await api.toggleMyList(catId)
    set({ myList: next })
  },
  toggleWatched: async (catId: string) => {
    const next = await api.watchedToggle(catId)
    set({ watched: next })
  },
  markWatched: async (catId: string) => {
    if (get().watched.includes(catId)) return
    const next = await api.watchedMark(catId)
    set({ watched: next })
  },
  loadProgress: async () => {
    try {
      const list = await api.progressList() // sorted newest-first
      const m: Record<string, Progress> = {}
      for (const p of list) if (!m[p.catId]) m[p.catId] = p // first per anime = latest
      set({ progressByCat: m })
    } catch {
      /* ignore */
    }
  },
  // keep the in-memory map fresh as the player saves, so posters reflect progress
  // immediately when you return to a list (no refetch needed).
  notePlayed: (p: Progress) =>
    set((s) => ({ progressByCat: { ...s.progressByCat, [p.catId]: p } }))
}))
