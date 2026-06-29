// Player preferences that should persist across episodes AND app restarts
// (volume + playback speed). UI-only state, so localStorage — not electron-store.

const VOL_KEY = 'anime1:volume'
const RATE_KEY = 'anime1:rate'

export function getSavedVolume(): number {
  const v = parseFloat(localStorage.getItem(VOL_KEY) || '')
  return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

export function saveVolume(v: number): void {
  localStorage.setItem(VOL_KEY, String(v))
}

export function getSavedRate(): number {
  const r = parseFloat(localStorage.getItem(RATE_KEY) || '')
  return isFinite(r) && r > 0 ? r : 1
}

export function saveRate(r: number): void {
  localStorage.setItem(RATE_KEY, String(r))
}
