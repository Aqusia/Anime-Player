// Player preferences that must persist across episodes AND app restarts
// (volume + playback speed).
//
// localStorage is the fast, synchronous read cache (Player reads these during
// render), but Chromium flushes localStorage to disk lazily, so an unclean exit
// (force-quit / crash / power loss) can drop the most recent writes. To make them
// durable we ALSO mirror every write to electron-store (a synchronous atomic disk
// write via the main process) and, on boot, reconcile localStorage from that
// durable copy. Net effect: values survive any shutdown, reads stay synchronous.
import { api } from './api'

const VOL_KEY = 'anime1:volume'
const RATE_KEY = 'anime1:rate'

export function getSavedVolume(): number {
  const v = parseFloat(localStorage.getItem(VOL_KEY) || '')
  return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

export function saveVolume(v: number): void {
  localStorage.setItem(VOL_KEY, String(v))
  void api.prefsSet({ volume: v }).catch(() => {})
}

export function getSavedRate(): number {
  const r = parseFloat(localStorage.getItem(RATE_KEY) || '')
  return isFinite(r) && r > 0 ? r : 1
}

export function saveRate(r: number): void {
  localStorage.setItem(RATE_KEY, String(r))
  void api.prefsSet({ rate: r }).catch(() => {})
}

// Pull the durable copy back into localStorage at startup (electron-store wins,
// since localStorage may have lost the last session's writes). Call once on boot.
export async function reconcilePrefs(): Promise<void> {
  try {
    const p = await api.prefsGet()
    if (!p) return
    if (typeof p.volume === 'number') localStorage.setItem(VOL_KEY, String(p.volume))
    if (typeof p.rate === 'number') localStorage.setItem(RATE_KEY, String(p.rate))
  } catch {
    /* ignore — fall back to whatever localStorage has */
  }
}
