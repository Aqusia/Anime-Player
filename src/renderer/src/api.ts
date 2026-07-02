export interface Anime {
  catId: string
  title: string
  episodes: string
  year: string
  season: string
  group: string
}

export interface Episode {
  postId: string
  title: string
  apireq: string
}

export interface Meta {
  found: boolean
  cover?: string
  description?: string
  score?: number
  votes?: number
  rank?: number
  matchedTitle?: string
  bgmId?: number
  tags?: string[]
}

export interface MetaLite {
  found: boolean
  cover?: string
  score?: number
  votes?: number
  rank?: number
  bgmId?: number
  tags?: string[]
}

export interface MetaStatus {
  building: boolean
  done: number
  total: number
  builtAt: number
}

export interface BgmEp {
  ep: number
  name: string
  desc: string
}

export interface Progress {
  catId: string
  postId: string
  position: number
  duration: number
  episodeTitle: string
  animeTitle: string
  episodeNum?: number
  totalEpisodes?: number
  cover?: string
  updatedAt: number
}

export type DownloadStatus = 'pending' | 'downloading' | 'done' | 'error'

export interface EpDownload {
  postId: string
  title: string
  episodeNum?: number
  status: DownloadStatus
  bytes: number
  total: number
}

export interface AnimeDownload {
  catId: string
  title: string
  cover?: string
  addedAt: number
  episodes: Record<string, EpDownload>
}

export interface DownloadReqEpisode {
  postId: string
  title: string
  episodeNum?: number
  apireq?: string
}

export type MyKind = 'airing' | 'completed'

export interface MyAnime {
  id: string
  title: string
  cover?: string
  episodes: number
  views: number
  kind: MyKind
  year?: number
  score?: number
  votes?: number
}

export interface MyEpisode {
  vid: string
  name: string
}

export interface MyDetails {
  id: string
  title: string
  cover?: string
  description: string
  category: string[]
  premiere: string
  episodes: MyEpisode[]
}

interface Api {
  list: (force?: boolean) => Promise<Anime[]>
  episodes: (catId: string) => Promise<Episode[]>
  metaAll: () => Promise<Record<string, MetaLite>>
  metaGet: (catId: string) => Promise<Meta | null>
  metaStatus: () => Promise<MetaStatus>
  metaEpisodes: (bgmId: number) => Promise<BgmEp[]>
  onMetaProgress: (cb: (s: MetaStatus) => void) => () => void
  streamUrl: (p: { catId: string; postId: string; apireq: string }) => Promise<string>
  downloadStart: (p: {
    catId: string
    title: string
    cover?: string
    episodes: DownloadReqEpisode[]
  }) => Promise<Record<string, AnimeDownload>>
  downloadDelete: (catId: string) => Promise<Record<string, AnimeDownload>>
  downloadAll: () => Promise<Record<string, AnimeDownload>>
  onDownloadProgress: (cb: (s: Record<string, AnimeDownload>) => void) => () => void
  myselfCatalog: () => Promise<MyAnime[]>
  onMyselfEnriched: (cb: () => void) => () => void
  myselfSearch: (query: string) => Promise<MyAnime[]>
  myselfDetails: (id: string) => Promise<MyDetails>
  myselfEpisodes: (id: string, title: string) => Promise<BgmEp[]>
  myselfStreamUrl: (tid: string, vid: string) => Promise<{ url: string; hls: boolean }>
  setProgress: (p: Progress) => Promise<void>
  progressList: () => Promise<Progress[]>
  progressOne: (catId: string, postId: string) => Promise<Progress | null>
  progressRemoveAnime: (catId: string) => Promise<void>
  progressClear: () => Promise<void>
  myList: () => Promise<string[]>
  toggleMyList: (catId: string) => Promise<string[]>
  watchedGet: () => Promise<string[]>
  watchedToggle: (catId: string) => Promise<string[]>
  watchedMark: (catId: string) => Promise<string[]>
  prefsGet: () => Promise<{ volume?: number; rate?: number }>
  prefsSet: (p: { volume?: number; rate?: number }) => Promise<void>
  searchHistoryGet: () => Promise<string[]>
  searchHistorySet: (list: string[]) => Promise<void>
}

export const api = (window as unknown as { api: Api }).api
