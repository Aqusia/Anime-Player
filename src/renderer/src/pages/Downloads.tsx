import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { api } from '../api'

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return Math.round(bytes / 1e6) + ' MB'
  return Math.round(bytes / 1e3) + ' KB'
}

export default function Downloads() {
  const downloads = useStore((s) => s.downloads)
  const byId = useStore((s) => s.byId)
  const meta = useStore((s) => s.meta)
  const nav = useNavigate()

  const items = Object.values(downloads)
    .filter((d) => Object.keys(d.episodes).length > 0)
    .sort((a, b) => b.addedAt - a.addedAt)

  const sizeOf = (d: (typeof items)[number]) =>
    Object.values(d.episodes).reduce((s, e) => s + (e.status === 'done' ? e.bytes : 0), 0)
  const totalBytes = items.reduce((sum, d) => sum + sizeOf(d), 0)

  return (
    <div className="pt-24 pb-20 px-8">
      <h1 className="text-2xl font-bold mb-1">離線下載</h1>
      <p className="text-sm text-zinc-400 mb-6">
        共 {items.length} 部 · 佔用空間 {fmtSize(totalBytes)}
      </p>

      {items.length === 0 ? (
        <p className="text-zinc-400">
          尚未下載任何動畫。在動畫詳細頁點「⬇ 下載整部」即可離線保存。
        </p>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {items.map((d) => {
            const eps = Object.values(d.episodes)
            const done = eps.filter((e) => e.status === 'done').length
            const downloading = eps.some((e) => e.status === 'downloading' || e.status === 'pending')
            const err = eps.some((e) => e.status === 'error')
            const isMy = d.catId.startsWith('my:')
            const cover = meta[d.catId]?.cover || d.cover
            const goDetail = (): void =>
              isMy
                ? nav(`/myself/anime/${d.catId.slice(3)}`, { state: { title: d.title, cover: d.cover } })
                : nav(`/anime/${d.catId}`)
            return (
              <div
                key={d.catId}
                className="flex items-center gap-4 bg-panel rounded-lg p-3 ring-1 ring-white/5"
              >
                <div
                  className="w-12 h-16 rounded overflow-hidden bg-zinc-800 shrink-0 cursor-pointer"
                  onClick={goDetail}
                >
                  {cover && (
                    <img src={cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={goDetail}>
                  <div className="font-semibold truncate">{byId[d.catId]?.title || d.title}</div>
                  <div className="text-xs text-zinc-400">
                    已下載 {done} 集 · {fmtSize(sizeOf(d))}
                    {downloading && <span className="text-sky-400"> · 下載中…</span>}
                    {err && <span className="text-red-400"> · 部分失敗</span>}
                  </div>
                </div>
                <button
                  onClick={() => api.downloadDelete(d.catId)}
                  className="bg-white/10 hover:bg-red-600/30 px-4 py-2 rounded text-sm shrink-0"
                >
                  🗑 刪除
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
