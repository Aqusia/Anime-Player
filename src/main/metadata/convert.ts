import * as OpenCC from 'opencc-js'

type Conv = (s: string) => string

let _tw2s: Conv | null = null
let _s2t: Conv | null = null

/** Traditional (TW) -> Simplified — used to query Bangumi (indexed in Simplified). */
export function toSimplified(s: string): string {
  if (!s) return s
  if (!_tw2s) _tw2s = OpenCC.Converter({ from: 'tw', to: 'cn' })
  try {
    return _tw2s(s)
  } catch {
    return s
  }
}

/** Simplified -> Traditional (TW) — used to display Bangumi names/summaries. */
export function toTraditional(s: string): string {
  if (!s) return s
  if (!_s2t) _s2t = OpenCC.Converter({ from: 'cn', to: 'tw' })
  try {
    return _s2t(s)
  } catch {
    return s
  }
}
