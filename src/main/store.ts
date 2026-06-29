import Store from 'electron-store'
import type { Anime, AnimeDownload, Meta, MetaLite, MyAnime, MyDetails, Progress } from './types'

// list / myList / progress live here (written frequently, kept small)
const dataStore = new Store({ name: 'anime1-data' })
// metadata map lives in its own file (large; written in batches)
const metaStore = new Store({ name: 'anime1-meta' })
// myself-bbs catalog + details cache
const myStore = new Store({ name: 'myself' })

interface ListCache {
  fetchedAt: number
  data: Anime[]
}

// In-memory meta map; flushed to disk in batches during bulk build.
let metaMem: Record<string, Meta> | null = null
function ensureMeta(): Record<string, Meta> {
  if (!metaMem) metaMem = (metaStore.get('metaMap', {}) as Record<string, Meta>) || {}
  return metaMem
}

export const db = {
  // ---- anime list cache ----
  getListCache(): ListCache | undefined {
    return dataStore.get('listCache') as ListCache | undefined
  },
  setListCache(data: Anime[]): void {
    dataStore.set('listCache', { fetchedAt: Date.now(), data })
  },

  // ---- my list ----
  getMyList(): string[] {
    return dataStore.get('myList', []) as string[]
  },
  setMyList(ids: string[]): void {
    dataStore.set('myList', ids)
  },

  // ---- watched / 已看完 (whole-anime, manual mark + auto on finishing the last ep) ----
  getWatched(): string[] {
    return dataStore.get('watched', []) as string[]
  },
  setWatched(ids: string[]): void {
    dataStore.set('watched', ids)
  },

  // ---- watch progress ----
  getProgressMap(): Record<string, Progress> {
    return dataStore.get('progress', {}) as Record<string, Progress>
  },
  setProgress(p: Progress): void {
    dataStore.set('progress.' + p.catId + '_' + p.postId, p)
  },
  // remove every episode entry of one anime (history "✕")
  removeAnimeProgress(catId: string): void {
    const map = dataStore.get('progress', {}) as Record<string, Progress>
    for (const key in map) {
      if (map[key]?.catId === catId) dataStore.delete(('progress.' + key) as 'progress')
    }
  },
  clearProgress(): void {
    dataStore.delete('progress')
  },

  // ---- downloads ----
  getDownloads(): Record<string, AnimeDownload> {
    return dataStore.get('downloads', {}) as Record<string, AnimeDownload>
  },
  setDownloads(d: Record<string, AnimeDownload>): void {
    dataStore.set('downloads', d)
  },

  // ---- metadata (in-memory + batched persistence) ----
  getMeta(catId: string): Meta | undefined {
    return ensureMeta()[catId]
  },
  setMetaMem(meta: Meta): void {
    ensureMeta()[meta.catId] = meta
  },
  flushMeta(): void {
    if (metaMem) metaStore.set('metaMap', metaMem)
  },
  getAllMetaLite(): Record<string, MetaLite> {
    const all = ensureMeta()
    const out: Record<string, MetaLite> = {}
    for (const k in all) {
      const m = all[k]
      if (m.found)
        out[k] = { found: true, cover: m.cover, score: m.score, votes: m.votes, rank: m.rank, bgmId: m.bgmId, tags: m.tags }
    }
    return out
  },
  getMetaBuiltAt(): number {
    return metaStore.get('metaBuiltAt', 0) as number
  },
  setMetaBuiltAt(ts: number): void {
    metaStore.set('metaBuiltAt', ts)
  },

  // tags-schema version: bump in build.ts to drop+rebackfill genre tags when the
  // tag filter logic changes (so stale/noisy tags get re-cleaned).
  getMetaTagsVer(): number {
    return metaStore.get('metaTagsVer', 0) as number
  },
  setMetaTagsVer(v: number): void {
    metaStore.set('metaTagsVer', v)
  },
  clearAllTags(): void {
    const all = ensureMeta()
    for (const k in all) if (all[k].tags) all[k].tags = undefined
    if (metaMem) metaStore.set('metaMap', metaMem)
  },

  // ---- Bangumi per-episode cache ----
  // key versioned (eps2) so adding ja→zh translation invalidates the old
  // Japanese-cached episode lists and they get refetched + translated.
  getBgmEps(bgmId: number): unknown {
    return metaStore.get('eps2.' + bgmId)
  },
  setBgmEps(bgmId: number, eps: unknown): void {
    metaStore.set('eps2.' + bgmId, eps)
  },

  // ---- myself-bbs catalog (full index, for search) ----
  getMyIndex(): { fetchedAt: number; data: MyAnime[] } | undefined {
    return myStore.get('index') as { fetchedAt: number; data: MyAnime[] } | undefined
  },
  setMyIndex(data: MyAnime[]): void {
    myStore.set('index', { fetchedAt: Date.now(), data })
  },

  // bump to force a full re-enrich of myself score/year when the logic improves
  getMyEnrichVer(): number {
    return myStore.get('enrichVer', 0) as number
  },
  setMyEnrichVer(v: number): void {
    myStore.set('enrichVer', v)
  },

  // ---- myself-bbs per-anime details (episodes + cover + synopsis) ----
  getMyDetails(id: string): { fetchedAt: number; data: MyDetails } | undefined {
    return myStore.get('details.' + id) as { fetchedAt: number; data: MyDetails } | undefined
  },
  setMyDetails(id: string, data: MyDetails): void {
    myStore.set('details.' + id, { fetchedAt: Date.now(), data })
  },

  // ---- myself → Bangumi subject id (for per-episode synopses; 0 = no match) ----
  // key is versioned (bgm2) so improving the title-match logic invalidates stale
  // (possibly mis-matched) ids automatically.
  getMyBgm(id: string): number | undefined {
    return myStore.get('bgm2.' + id) as number | undefined
  },
  setMyBgm(id: string, bgmId: number): void {
    myStore.set('bgm2.' + id, bgmId)
  }
}
