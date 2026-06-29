import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import { URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveSource } from './anime1/resolve'
import { UA, ORIGIN } from './anime1/http'
import { getLocalFile, getMyLocalFile } from './download'
import { resolveMyself } from './myself/resolve'
import { MY_UA } from './myself/http'

interface Entry {
  apireq: string
  src?: string
  cookie?: string
  expiresAt: number
}

const entries = new Map<string, Entry>()
let port = 0

export function getProxyPort(): number {
  return port
}

/** Register / refresh the apireq behind a stream token. */
export function registerStream(token: string, apireq: string): void {
  const existing = entries.get(token)
  if (existing) {
    if (existing.apireq !== apireq) {
      existing.apireq = apireq
      existing.expiresAt = 0 // force re-resolve
    }
  } else {
    entries.set(token, { apireq, expiresAt: 0 })
  }
}

async function ensureResolved(entry: Entry): Promise<void> {
  if (!entry.src || !entry.cookie || Date.now() > entry.expiresAt) {
    const r = await resolveSource(entry.apireq)
    entry.src = r.src
    entry.cookie = r.cookie
    entry.expiresAt = r.expiresAt
  }
}

function pipeUpstream(
  entry: Entry,
  req: IncomingMessage,
  res: ServerResponse,
  allowRetry: boolean
): void {
  const target = new URL(entry.src!)
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: ORIGIN + '/',
    Cookie: entry.cookie || '',
    Accept: '*/*'
  }
  if (req.headers.range) headers['Range'] = req.headers.range as string

  const upstream = https.request(
    {
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: 'GET',
      headers
    },
    (up) => {
      // Cookies expired or rotated -> re-resolve once and retry.
      if (up.statusCode === 403 && allowRetry) {
        up.resume()
        entry.expiresAt = 0
        ensureResolved(entry)
          .then(() => pipeUpstream(entry, req, res, false))
          .catch((e) => {
            if (!res.headersSent) res.statusCode = 502
            res.end(String(e?.message || e))
          })
        return
      }

      res.statusCode = up.statusCode || 502
      for (const h of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'last-modified',
        'etag'
      ]) {
        const v = up.headers[h]
        if (v) res.setHeader(h, v as string)
      }
      up.pipe(res)
    }
  )

  upstream.on('error', (e) => {
    if (!res.headersSent) res.statusCode = 502
    res.end(String(e?.message || e))
  })

  // If the renderer aborts (e.g. seeking), tear down the upstream request.
  req.on('close', () => upstream.destroy())
  upstream.end()
}

// cache of resolved myself-bbs episode -> {playlist URL, its CDN directory}.
// The m3u8 filename/path differs by format (old "/vpx/<tid>/<vid>/720p.m3u8",
// newer "/hls/xx/xx/xx/<token>/index.m3u8") but its .ts segments are always
// same-directory relative, so caching the base covers segment requests.
interface MyResolved {
  url: string
  base: string
  expiresAt: number
}
const myCache = new Map<string, MyResolved>()
const MY_TTL = 30 * 60 * 1000

/** Resolve (and memoize) an episode's HLS playlist URL + its CDN directory. */
async function myResolved(tid: string, vid: string): Promise<MyResolved> {
  const key = `${tid}/${vid}`
  const hit = myCache.get(key)
  if (hit && Date.now() < hit.expiresAt) return hit
  const url = await resolveMyself(tid, vid)
  const r: MyResolved = { url, base: url.replace(/[^/]*$/, ''), expiresAt: Date.now() + MY_TTL }
  myCache.set(key, r)
  return r
}

/**
 * Proxy an arbitrary external video URL, injecting Referer and forwarding Range.
 * Follows 3xx redirects in-process (CDNs like Tencent VOD/myqcloud often 302 to a
 * signed edge URL — the <video> element can't follow that itself while keeping our
 * Referer, so we chase it here).
 */
function pipeExternal(
  mp4: string,
  referer: string,
  ua: string,
  req: IncomingMessage,
  res: ServerResponse,
  hops = 0
): void {
  const target = new URL(mp4)
  const headers: Record<string, string> = { 'User-Agent': ua, Referer: referer, Accept: '*/*' }
  if (req.headers.range) headers['Range'] = req.headers.range as string

  const client = target.protocol === 'http:' ? http : https
  const upstream = client.request(
    { hostname: target.hostname, port: target.port || undefined, path: target.pathname + target.search, method: 'GET', headers },
    (up) => {
      const status = up.statusCode || 502
      // Follow redirects (max 5 hops) while preserving Referer.
      if (status >= 300 && status < 400 && up.headers.location && hops < 5) {
        up.resume()
        const next = new URL(up.headers.location as string, target).href
        pipeExternal(next, referer, ua, req, res, hops + 1)
        return
      }
      res.statusCode = status
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
        const v = up.headers[h]
        if (v) res.setHeader(h, v as string)
      }
      up.pipe(res)
    }
  )
  upstream.on('error', (e) => {
    if (!res.headersSent) res.statusCode = 502
    res.end(String(e?.message || e))
  })
  req.on('close', () => upstream.destroy())
  upstream.end()
}

/** Serve a local file with HTTP Range support (for seeking). */
function serveLocalFile(file: string, req: IncomingMessage, res: ServerResponse): void {
  const stat = fs.statSync(file)
  const range = req.headers.range as string | undefined
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Accept-Ranges', 'bytes')
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    const start = m && m[1] ? parseInt(m[1], 10) : 0
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    res.setHeader('Content-Length', end - start + 1)
    const stream = fs.createReadStream(file, { start, end })
    req.on('close', () => stream.destroy())
    stream.pipe(res)
  } else {
    res.statusCode = 200
    res.setHeader('Content-Length', stat.size)
    const stream = fs.createReadStream(file)
    req.on('close', () => stream.destroy())
    stream.pipe(res)
  }
}

export function startProxy(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        // allow the renderer's <canvas> to read frames for the seek preview
        res.setHeader('Access-Control-Allow-Origin', '*')
        const u = new URL(req.url || '', 'http://127.0.0.1')

        // Local downloaded file: /file/<catId>/<postId>
        if (u.pathname.startsWith('/file/')) {
          const [catId, postId] = u.pathname.slice('/file/'.length).split('/')
          const file = getLocalFile(decodeURIComponent(catId), decodeURIComponent(postId || ''))
          if (!file) {
            res.statusCode = 404
            res.end('not downloaded')
            return
          }
          serveLocalFile(file, req, res)
          return
        }

        // Downloaded myself HLS (offline): /myfile/<tid>/<vid>/<file> served from
        // the local download folder (playlist.m3u8 + .ts), so hls.js plays offline.
        if (u.pathname.startsWith('/myfile/')) {
          const [tid, vid, ...rest] = u.pathname.slice('/myfile/'.length).split('/')
          const file = rest.join('/') || 'playlist.m3u8'
          const local = getMyLocalFile(decodeURIComponent(tid), decodeURIComponent(vid), file)
          if (!local) {
            res.statusCode = 404
            res.end('not downloaded')
            return
          }
          res.setHeader(
            'Content-Type',
            file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t'
          )
          const stat = fs.statSync(local)
          res.setHeader('Content-Length', stat.size)
          const stream = fs.createReadStream(local)
          req.on('close', () => stream.destroy())
          stream.pipe(res)
          return
        }

        // myself-bbs HLS: /myself/<tid>/<vid>/<file>. The CDN only allows its own
        // origin (CORS), so we fetch the playlist + segments here (server-side, no
        // CORS) and re-serve them with Access-Control-Allow-Origin:* for hls.js.
        // The sentinel "playlist.m3u8" maps to the resolved m3u8 (whatever its real
        // name/path); everything else is a relative segment off the playlist's CDN
        // directory. Segments are same-directory relative in the m3u8, so they come
        // back here under the same path prefix and map straight onto the base.
        if (u.pathname.startsWith('/myself/')) {
          const parts = u.pathname.slice('/myself/'.length).split('/')
          const [tid, vid, ...rest] = parts
          const file = rest.join('/')
          if (!tid || !vid) {
            res.statusCode = 400
            res.end('bad myself path')
            return
          }
          const r = await myResolved(decodeURIComponent(tid), decodeURIComponent(vid))
          const target = !file || file === 'playlist.m3u8' ? r.url : r.base + file
          pipeExternal(target, 'https://v.myself-bbs.com/', MY_UA, req, res)
          return
        }

        if (!u.pathname.startsWith('/stream/')) {
          res.statusCode = 404
          res.end('not found')
          return
        }
        const token = decodeURIComponent(u.pathname.slice('/stream/'.length))
        const entry = entries.get(token)
        if (!entry) {
          res.statusCode = 404
          res.end('unknown token')
          return
        }
        await ensureResolved(entry)
        pipeUpstream(entry, req, res, true)
      } catch (err: any) {
        if (!res.headersSent) res.statusCode = 500
        res.end(String(err?.message || err))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port
      resolve(port)
    })
  })
}
