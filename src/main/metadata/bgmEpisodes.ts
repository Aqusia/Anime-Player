import { toTraditional } from './convert'
import { translateJa, hasJapanese } from './translate'

export interface BgmEp {
  ep: number
  name: string
  desc: string
}

const UA = 'anime1-netflix/1.0 (personal media client)'

/** Translate any still-Japanese episode names/synopses to Traditional Chinese.
 *  Bangumi stores a single Japanese `desc` for many shows; the user wants 中文.
 *  Best-effort + cached: each distinct string is translated once, gentle
 *  concurrency, and on failure the original (kanji→Traditional) text is kept. */
async function localizeEps(eps: BgmEp[]): Promise<void> {
  const targets = [...new Set(eps.flatMap((e) => [e.name, e.desc]).filter(hasJapanese))]
  if (!targets.length) return
  const zh = new Map<string, string>()
  let i = 0
  async function worker(): Promise<void> {
    while (i < targets.length) {
      const s = targets[i++]
      const out = await translateJa(s)
      if (out) zh.set(s, toTraditional(out))
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  for (const e of eps) {
    if (zh.has(e.name)) e.name = zh.get(e.name) as string
    if (zh.has(e.desc)) e.desc = zh.get(e.desc) as string
  }
}

/** Fetch Bangumi main-episode list (names + synopses) for a subject. */
export async function fetchBgmEpisodes(bgmId: number): Promise<BgmEp[]> {
  try {
    const res = await fetch(
      `https://api.bgm.tv/v0/episodes?subject_id=${bgmId}&type=0&limit=100`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    )
    if (!res.ok) return []
    const json: any = await res.json()
    const data: any[] = json?.data || []
    const eps: BgmEp[] = data.map((e) => ({
      ep: typeof e.sort === 'number' ? e.sort : e.ep || 0,
      name: toTraditional(e.name_cn || e.name || ''),
      desc: toTraditional(e.desc || '')
    }))
    await localizeEps(eps)
    return eps
  } catch {
    return []
  }
}
