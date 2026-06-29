import https from 'node:https'
import { URL } from 'node:url'

// myself-bbs.com quirks (verified live):
// - The bare apex `myself-bbs.com` refuses/times out connections; only the
//   `www.` host serves the site. Always use www.
// - Node's global fetch (undici) intermittently CONNECT-times-out against this
//   host, while the classic `https` module with an explicit IPv4 family works
//   reliably. So we talk to it via https.request, not fetch.
// - The site is flaky and returns the occasional timeout/5xx, so we retry.
export const MY_HOST = 'www.myself-bbs.com'
export const MY_ORIGIN = 'https://' + MY_HOST
export const MY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function getOnce(path: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: MY_HOST,
        path,
        method: 'GET',
        family: 4, // force IPv4 — see note above
        timeout: timeoutMs,
        headers: {
          'User-Agent': MY_UA,
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml'
        }
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 400) {
          res.resume()
          reject(new Error(`GET ${path} -> ${status}`))
          return
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
      }
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`GET ${path} -> timeout`))
    })
    req.on('error', reject)
    req.end()
  })
}

/** GET an absolute path on www.myself-bbs.com (e.g. "/forum-113-1.html"), with
 *  retries. Background crawls use the patient defaults; interactive callers
 *  (a user waiting on a detail page) pass fewer/shorter attempts so a slow spell
 *  fails in a sane time and they can retry, instead of hanging ~100s silently. */
export async function myGetHtml(path: string, retries = 4, timeoutMs = 20000): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt))
    try {
      return await getOnce(path, timeoutMs)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Latency-optimised GET for INTERACTIVE callers (a user waiting on a page).
 * A healthy myself-bbs response is sub-second; a bad one is a stuck connection
 * that just sits until the timeout. So instead of waiting a whole timeout before
 * retrying (sequential retries → tens of seconds), we HEDGE: fire a fresh
 * attempt every `hedgeMs` and resolve on the FIRST success. When the site is
 * momentarily stuck-connecting, a fresh socket usually answers in ~1s, so the
 * user waits a couple seconds instead of tens. Rejects once every attempt fails.
 */
export function myGetHtmlHedged(
  path: string,
  { attempts = 4, timeoutMs = 7000, hedgeMs = 2200 } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let launched = 0
    let failed = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn()
    }
    const launch = (): void => {
      if (settled) return
      launched++
      getOnce(path, timeoutMs).then(
        (html) => finish(() => resolve(html)),
        (e) => {
          if (++failed >= attempts) finish(() => reject(e instanceof Error ? e : new Error(String(e))))
        }
      )
      if (launched < attempts) timer = setTimeout(launch, hedgeMs)
    }
    launch()
  })
}

/** Turn a page-relative or apex-host URL into an absolute www URL (covers, links). */
export function myAbs(src: string | undefined): string {
  if (!src) return ''
  let url = src.trim()
  try {
    url = new URL(url, MY_ORIGIN + '/').href
  } catch {
    return ''
  }
  // The site mixes the dead apex host into some asset URLs — rewrite to www.
  return url.replace(/^https?:\/\/(?:www\.)?myself-bbs\.com/i, MY_ORIGIN)
}

/** Normalise a forum href ("forum-113-2.html" / "./forum-113-2.html") to a path. */
export function toPath(href: string | undefined): string | null {
  if (!href) return null
  const m = href.match(/forum-\d+-\d+\.html/)
  return m ? '/' + m[0] : null
}
