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

/** Full metadata for one anime (from Bangumi). */
export interface Meta {
  catId: string
  found: boolean
  definitiveMiss?: boolean
  cover?: string
  description?: string
  score?: number
  votes?: number
  rank?: number
  matchedTitle?: string
  bgmId?: number
  tags?: string[]
  fetchedAt: number
}

/** Lightweight metadata sent to the renderer in bulk (no description). */
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

export interface ResolvedSource {
  src: string
  cookie: string
  expiresAt: number
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
  cover?: string // poster, stored for sources without a Bangumi meta map (myself)
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

/** What the renderer needs to start a download. anime1 episodes carry `apireq`;
 *  myself episodes are HLS and identified by the `my:<tid>` catId + postId=vid. */
export interface DownloadRequestEpisode {
  postId: string
  title: string
  episodeNum?: number
  apireq?: string
}

// ---- myself-bbs.com (secondary source: large, complete catalog) ----
export type MyKind = 'airing' | 'completed'

export interface MyAnime {
  id: string // thread id, e.g. "44182"
  title: string
  cover?: string
  episodes: number // episode count from the listing
  views: number
  kind: MyKind
  year?: number // premiere year (filled in by background enrichment; 0 = tried, unknown)
  score?: number // Bangumi rating (filled in by background enrichment)
  votes?: number // Bangumi rating count (for Bayesian-weighted ranking)
}

export interface MyEpisode {
  vid: string // episode code within the thread, e.g. "001"
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
