import https from 'https'

// Best-effort Japanese → Traditional Chinese translation for Bangumi episode
// names/synopses (Bangumi only stores a single Japanese desc for many shows).
// Uses the keyless Google translate web endpoint; failures fall back silently to
// the original text. Results are memoised per-process (the episode list itself is
// persisted by the caller, so a translated list is only built once per show).

// Actual kana syllables only — excludes the katakana middle dot ・(・) so a
// Chinese string like "炎柱・煉獄杏壽郎" is NOT mistaken for Japanese.
const KANA = /[ぁ-ゖァ-ヺー]/

/** True if the text contains Japanese kana (i.e. needs translating). */
export function hasJapanese(s: string): boolean {
  return KANA.test(s)
}

const cache = new Map<string, string>()

function once(q: string): Promise<string> {
  return new Promise((resolve) => {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-TW&dt=t&q=' +
      encodeURIComponent(q)
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          return resolve('')
        }
        let d = ''
        res.setEncoding('utf-8')
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            const j = JSON.parse(d)
            resolve((j[0] || []).map((seg: [string]) => seg[0]).join(''))
          } catch {
            resolve('')
          }
        })
      }
    )
    req.on('error', () => resolve(''))
    req.on('timeout', () => {
      req.destroy()
      resolve('')
    })
  })
}

/** Translate ja→zh-TW (best-effort, cached). Returns '' on failure. */
export async function translateJa(text: string): Promise<string> {
  const t = text.trim()
  if (!t) return ''
  if (cache.has(t)) return cache.get(t) as string
  const out = await once(t)
  if (out && out !== t) cache.set(t, out)
  return out
}
