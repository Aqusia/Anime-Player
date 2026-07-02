import { ipcMain } from 'electron'
import { getAnimeList } from './anime1/service'
import { fetchEpisodes } from './anime1/episodes'
import { db } from './store'
import { registerStream, getProxyPort } from './proxy'
import { getMetaStatus } from './metadata/build'
import { fetchBgmEpisodes, type BgmEp } from './metadata/bgmEpisodes'
import { hasJapanese } from './metadata/translate'
import {
  startDownload,
  deleteDownload,
  getDownloads,
  isDownloaded
} from './download'
import { getMyCatalog, searchMy, getMyDetails, getMyEpisodeInfo } from './myself/service'
import type { DownloadRequestEpisode, Progress } from './types'

export function registerIpc(): void {
  ipcMain.handle('anime:list', async (_e, force?: boolean) => getAnimeList(force))

  ipcMain.handle('anime:episodes', async (_e, catId: string) => fetchEpisodes(catId))

  // ---- metadata ----
  ipcMain.handle('meta:all', () => db.getAllMetaLite())
  ipcMain.handle('meta:get', (_e, catId: string) => db.getMeta(catId) || null)
  ipcMain.handle('meta:status', () => getMetaStatus())
  ipcMain.handle('meta:episodes', async (_e, bgmId: number) => {
    if (!bgmId) return []
    const cached = db.getBgmEps(bgmId)
    if (cached) return cached
    const eps = await fetchBgmEpisodes(bgmId)
    // Only persist a fully-localized list, so a transient translation outage
    // doesn't bake Japanese descs into the permanent cache.
    if (eps.length && !eps.some((e: BgmEp) => hasJapanese(e.desc) || hasJapanese(e.name)))
      db.setBgmEps(bgmId, eps)
    return eps
  })

  // ---- streaming ----
  ipcMain.handle(
    'stream:url',
    async (_e, payload: { catId: string; postId: string; apireq: string }) => {
      const port = getProxyPort()
      // Prefer the local downloaded file (instant, offline) when available.
      if (isDownloaded(payload.catId, payload.postId)) {
        return `http://127.0.0.1:${port}/file/${payload.catId}/${payload.postId}`
      }
      const token = `${payload.catId}_${payload.postId}`
      registerStream(token, payload.apireq)
      return `http://127.0.0.1:${port}/stream/${token}`
    }
  )

  // ---- downloads ----
  ipcMain.handle(
    'download:start',
    (_e, payload: { catId: string; title: string; cover?: string; episodes: DownloadRequestEpisode[] }) => {
      startDownload(payload.catId, payload.title, payload.episodes, payload.cover)
      return getDownloads()
    }
  )
  ipcMain.handle('download:delete', (_e, catId: string) => {
    deleteDownload(catId)
    return getDownloads()
  })
  ipcMain.handle('download:all', () => getDownloads())

  // ---- myself-bbs.com (secondary source) ----
  ipcMain.handle('my:catalog', () => getMyCatalog())
  ipcMain.handle('my:search', (_e, query: string) => searchMy(query))
  ipcMain.handle('my:details', (_e, id: string) => getMyDetails(id))
  ipcMain.handle('my:episodes', (_e, id: string, title: string) => getMyEpisodeInfo(id, title))
  ipcMain.handle('my:streamUrl', (_e, tid: string, vid: string) => {
    // Always HLS. Prefer the offline download (local playlist) when present; else
    // go through the proxy, which the CDN requires (CORS is locked to its origin)
    // and which resolves the real URL via the WebSocket handshake on first hit.
    const port = getProxyPort()
    const base = isDownloaded(`my:${tid}`, vid) ? 'myfile' : 'myself'
    const url = `http://127.0.0.1:${port}/${base}/${encodeURIComponent(tid)}/${encodeURIComponent(vid)}/playlist.m3u8`
    return { url, hls: true }
  })

  // ---- progress ----
  ipcMain.handle('progress:set', (_e, p: Progress) => db.setProgress(p))
  ipcMain.handle('progress:list', () =>
    Object.values(db.getProgressMap())
      // drop history from the removed anime1.cc source (no longer playable)
      .filter((p) => !p.catId.startsWith('cc:'))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  )
  ipcMain.handle('progress:getOne', (_e, catId: string, postId: string) =>
    db.getProgressMap()[`${catId}_${postId}`] || null
  )
  ipcMain.handle('progress:removeAnime', (_e, catId: string) => db.removeAnimeProgress(catId))
  ipcMain.handle('progress:clear', () => db.clearProgress())

  // ---- my list ----
  ipcMain.handle('mylist:get', () => db.getMyList())
  ipcMain.handle('mylist:toggle', (_e, catId: string) => {
    const cur = db.getMyList()
    const next = cur.includes(catId) ? cur.filter((x) => x !== catId) : [catId, ...cur]
    db.setMyList(next)
    return next
  })

  // ---- watched / 已看完 ----
  ipcMain.handle('watched:get', () => db.getWatched())
  ipcMain.handle('watched:toggle', (_e, catId: string) => {
    const cur = db.getWatched()
    const next = cur.includes(catId) ? cur.filter((x) => x !== catId) : [catId, ...cur]
    db.setWatched(next)
    return next
  })
  // add-only (idempotent) — used when the player finishes the last episode
  ipcMain.handle('watched:mark', (_e, catId: string) => {
    const cur = db.getWatched()
    const next = cur.includes(catId) ? cur : [catId, ...cur]
    db.setWatched(next)
    return next
  })

  // ---- UI prefs + search history (durable mirror of renderer localStorage) ----
  ipcMain.handle('prefs:get', () => db.getPrefs())
  ipcMain.handle('prefs:set', (_e, p: { volume?: number; rate?: number }) => db.setPrefs(p))
  ipcMain.handle('searchHistory:get', () => db.getSearchHistory())
  ipcMain.handle('searchHistory:set', (_e, list: string[]) => db.setSearchHistory(list))
}
