import { app } from 'electron'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { URL } from 'node:url'
import { resolveSource } from './anime1/resolve'
import { UA, ORIGIN } from './anime1/http'
import { resolveMyself } from './myself/resolve'
import { MY_UA } from './myself/http'
import { db } from './store'
import type { AnimeDownload, DownloadRequestEpisode } from './types'

const DL_DIR = path.join(app.getPath('userData'), 'downloads')

// myself catIds are "my:<tid>" — the colon is illegal in Windows paths, so sanitize.
function dirFor(catId: string): string {
  return path.join(DL_DIR, catId.replace(/:/g, '_'))
}
function isMy(catId: string): boolean {
  return catId.startsWith('my:')
}
// anime1: a single .mp4 per episode. myself: a folder per episode (HLS playlist + .ts).
function fileFor(catId: string, postId: string): string {
  return path.join(dirFor(catId), postId + '.mp4')
}
function hlsDirFor(catId: string, postId: string): string {
  return path.join(dirFor(catId), postId)
}
function hlsPlaylist(catId: string, postId: string): string {
  return path.join(hlsDirFor(catId, postId), 'playlist.m3u8')
}

// In-memory state (source of truth); persisted to electron-store on status changes.
let mem: Record<string, AnimeDownload> | null = null
function state(): Record<string, AnimeDownload> {
  if (!mem) mem = db.getDownloads()
  return mem
}
function persist(): void {
  if (mem) db.setDownloads(mem)
}

let onProgress: (s: Record<string, AnimeDownload>) => void = () => {}
export function setDownloadProgressHandler(fn: (s: Record<string, AnimeDownload>) => void): void {
  onProgress = fn
}

// throttle progress broadcasts (byte updates are frequent)
let lastEmit = 0
function emit(force = false): void {
  const now = Date.now()
  if (!force && now - lastEmit < 500) return
  lastEmit = now
  onProgress(state())
}

export function getDownloads(): Record<string, AnimeDownload> {
  return state()
}

export function isDownloaded(catId: string, postId: string): boolean {
  const ep = state()[catId]?.episodes?.[postId]
  if (!ep || ep.status !== 'done') return false
  return fs.existsSync(isMy(catId) ? hlsPlaylist(catId, postId) : fileFor(catId, postId))
}

export function getLocalFile(catId: string, postId: string): string | null {
  return isDownloaded(catId, postId) ? fileFor(catId, postId) : null
}

/** Local file under a downloaded myself episode folder (playlist.m3u8 or a .ts). */
export function getMyLocalFile(tid: string, vid: string, file: string): string | null {
  const catId = `my:${tid}`
  if (!isDownloaded(catId, vid)) return null
  const full = path.join(hlsDirFor(catId, vid), path.basename(file))
  return fs.existsSync(full) ? full : null
}

// ---- queue ----
const queue: Array<{ catId: string; ep: DownloadRequestEpisode }> = []
const cancelled = new Set<string>()
let active = false
let current: { catId: string; req: import('node:http').ClientRequest; ws: fs.WriteStream; tmp: string } | null =
  null

export function startDownload(
  catId: string,
  title: string,
  episodes: DownloadRequestEpisode[],
  cover?: string
): void {
  const s = state()
  if (!s[catId]) s[catId] = { catId, title, cover, addedAt: Date.now(), episodes: {} }
  else if (cover && !s[catId].cover) s[catId].cover = cover
  cancelled.delete(catId)
  for (const e of episodes) {
    const cur = s[catId].episodes[e.postId]
    if (cur && cur.status === 'done' && isDownloaded(catId, e.postId)) continue
    s[catId].episodes[e.postId] = {
      postId: e.postId,
      title: e.title,
      episodeNum: e.episodeNum,
      status: 'pending',
      bytes: 0,
      total: 0
    }
    queue.push({ catId, ep: e })
  }
  persist()
  emit(true)
  void pump()
}

export function deleteDownload(catId: string): void {
  cancelled.add(catId)
  // drop queued items for this anime
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].catId === catId) queue.splice(i, 1)
  // abort if currently downloading this anime
  if (current?.catId === catId) {
    try {
      current.req.destroy()
      current.ws.destroy()
      if (fs.existsSync(current.tmp)) fs.unlinkSync(current.tmp)
    } catch {
      /* ignore */
    }
    current = null
  }
  // remove files + state
  try {
    fs.rmSync(dirFor(catId), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  const s = state()
  delete s[catId]
  persist()
  emit(true)
}

async function pump(): Promise<void> {
  if (active) return
  active = true
  while (queue.length) {
    const job = queue.shift()!
    const { catId, ep } = job
    if (cancelled.has(catId)) continue
    const epState = state()[catId]?.episodes?.[ep.postId]
    if (!epState) continue
    if (epState.status === 'done' && isDownloaded(catId, ep.postId)) continue

    epState.status = 'downloading'
    epState.bytes = 0
    persist()
    emit(true)
    try {
      await downloadOne(catId, ep, (bytes, total) => {
        epState.bytes = bytes
        epState.total = total
        emit()
      })
      epState.status = 'done'
      persist()
      emit(true)
    } catch {
      if (!cancelled.has(catId)) {
        epState.status = 'error'
        persist()
        emit(true)
      }
    }
  }
  active = false
}

function downloadOne(
  catId: string,
  ep: DownloadRequestEpisode,
  onByte: (bytes: number, total: number) => void
): Promise<void> {
  if (isMy(catId)) return downloadHls(catId, ep, onByte)
  return downloadMp4(catId, ep, onByte)
}

/** GET a URL to a file, resolving on finish. Tracks the request for cancellation. */
function getToFile(url: string, dest: string, catId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const ws = fs.createWriteStream(dest)
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'GET',
        headers: { 'User-Agent': MY_UA, Referer: 'https://v.myself-bbs.com/' }
      },
      (up) => {
        if (up.statusCode !== 200 && up.statusCode !== 206) {
          up.resume()
          ws.destroy()
          reject(new Error('http ' + up.statusCode))
          return
        }
        up.pipe(ws)
        ws.on('finish', () => ws.close(() => resolve()))
        up.on('error', (e) => {
          ws.destroy()
          reject(e)
        })
      }
    )
    current = { catId, req, ws, tmp: dest }
    ws.on('error', reject)
    req.on('error', reject)
    req.end()
  })
}

/** Download a myself episode as offline HLS: fetch the playlist + every segment
 *  into a per-episode folder and write a local playlist.m3u8 (same relative
 *  segment names) so hls.js can play it back from disk via the proxy. */
async function downloadHls(
  catId: string,
  ep: DownloadRequestEpisode,
  onByte: (bytes: number, total: number) => void
): Promise<void> {
  const tid = catId.slice(3)
  const vid = ep.postId
  const m3u8Url = await resolveMyself(tid, vid)
  const base = m3u8Url.replace(/[^/]*$/, '')
  const playlist = await fetchText(m3u8Url)
  const segs = playlist
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (!segs.length) throw new Error('empty playlist')

  const dir = hlsDirFor(catId, vid)
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < segs.length; i++) {
    if (cancelled.has(catId)) throw new Error('cancelled')
    const seg = segs[i]
    const dest = path.join(dir, path.basename(seg))
    const tmp = dest + '.part'
    await getToFile(base + seg, tmp, catId)
    fs.renameSync(tmp, dest)
    current = null
    onByte(i + 1, segs.length) // progress measured in segments, not bytes
  }
  // Local playlist references the segments by their (basename) names — same as
  // the original, since they're same-directory relative. Write it last = "done".
  fs.writeFileSync(hlsPlaylist(catId, vid), playlist)
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'GET',
        headers: { 'User-Agent': MY_UA, Referer: 'https://v.myself-bbs.com/' }
      },
      (up) => {
        if (up.statusCode !== 200) {
          up.resume()
          reject(new Error('http ' + up.statusCode))
          return
        }
        let d = ''
        up.setEncoding('utf8')
        up.on('data', (c) => (d += c))
        up.on('end', () => resolve(d))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function downloadMp4(
  catId: string,
  ep: DownloadRequestEpisode,
  onByte: (bytes: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    resolveSource(ep.apireq || '')
      .then((r) => {
        fs.mkdirSync(dirFor(catId), { recursive: true })
        const tmp = fileFor(catId, ep.postId) + '.part'
        const final = fileFor(catId, ep.postId)
        const target = new URL(r.src)
        const ws = fs.createWriteStream(tmp)
        const req = https.request(
          {
            hostname: target.hostname,
            path: target.pathname + target.search,
            method: 'GET',
            headers: { 'User-Agent': UA, Referer: ORIGIN + '/', Cookie: r.cookie }
          },
          (up) => {
            if (up.statusCode !== 200 && up.statusCode !== 206) {
              up.resume()
              ws.destroy()
              reject(new Error('http ' + up.statusCode))
              return
            }
            const total = parseInt((up.headers['content-length'] as string) || '0', 10)
            let bytes = 0
            up.on('data', (c) => {
              bytes += c.length
              onByte(bytes, total)
            })
            up.pipe(ws)
            ws.on('finish', () => {
              ws.close(() => {
                current = null
                try {
                  fs.renameSync(tmp, final)
                  resolve()
                } catch (e) {
                  reject(e)
                }
              })
            })
            up.on('error', (e) => {
              ws.destroy()
              reject(e)
            })
          }
        )
        current = { catId, req, ws, tmp }
        ws.on('error', reject)
        req.on('error', reject)
        req.end()
      })
      .catch(reject)
  })
}
