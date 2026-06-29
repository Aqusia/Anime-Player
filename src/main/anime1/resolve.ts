import { UA, ORIGIN } from './http'
import type { ResolvedSource } from '../types'

const API = 'https://v.anime1.me/api'

/**
 * Resolve an episode's video source.
 * POST d=<apireq> -> { s:[{ src, type }] } plus HttpOnly cookies (e, p, h)
 * that the CDN requires to serve the file.
 */
export async function resolveSource(apireq: string): Promise<ResolvedSource> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: ORIGIN + '/',
      Origin: ORIGIN,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/javascript, */*; q=0.01'
    },
    body: 'd=' + apireq
  })
  if (!res.ok) throw new Error('api ' + res.status)

  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : []
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')

  const json: any = await res.json()
  let src: string | undefined = json?.s?.[0]?.src
  if (!src) throw new Error('no src in api response')
  if (src.startsWith('//')) src = 'https:' + src

  return { src, cookie, expiresAt: Date.now() + 7 * 3600 * 1000 }
}
