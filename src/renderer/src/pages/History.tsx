import { useEffect, useState, type ReactNode } from 'react'
import { api, type Progress } from '../api'
import { useStore } from '../store'
import { dedupeBy } from '../lib'
import HistoryCard from '../components/HistoryCard'
import WatchedCard from '../components/WatchedCard'

const PAGE_H = 12 // 最近觀看 shown before "顯示更多" (~one screen)
const PAGE_W = 18 // 已看完 posters shown before "顯示更多"

/** Collapsible section with a count + show-more cap, so the page stays ~one
 *  screen by default but everything is reachable. */
function Section({
  title,
  count,
  open,
  onToggle,
  children
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="mb-8">
      <button onClick={onToggle} className="flex items-center gap-2 mb-3 text-zinc-200 hover:text-white">
        <span className={`text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-xl font-bold">{title}</span>
        <span className="text-sm font-normal text-zinc-500">{count}</span>
      </button>
      {open && children}
    </section>
  )
}

export default function History() {
  const byId = useStore((s) => s.byId)
  const watched = useStore((s) => s.watched)
  const toggleWatched = useStore((s) => s.toggleWatched)
  const myById = useStore((s) => s.myById)
  const loadMyCatalog = useStore((s) => s.loadMyCatalog)
  const [progress, setProgress] = useState<Progress[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openHist, setOpenHist] = useState(true)
  const [openDone, setOpenDone] = useState(true)
  const [histAll, setHistAll] = useState(false)
  const [doneAll, setDoneAll] = useState(false)

  const refresh = (): void => {
    api
      .progressList()
      .then(setProgress)
      .catch(() => {})
      .finally(() => setLoaded(true))
  }
  useEffect(refresh, [])

  const watchedSet = new Set(watched)
  const hasMy = progress.some((p) => p.catId.startsWith('my:')) || watched.some((c) => c.startsWith('my:'))
  useEffect(() => {
    if (hasMy) loadMyCatalog()
  }, [hasMy, loadMyCatalog])

  // 最近觀看 = progress (one per anime, newest first), EXCLUDING ones marked 已看完.
  const history = dedupeBy(
    progress.filter((p) => (p.catId.startsWith('my:') || byId[p.catId]) && !watchedSet.has(p.catId)),
    (p) => p.catId
  )
  // 已看完 = the watched set, resolvable to a title/cover.
  const doneList = watched.filter((c) => (c.startsWith('my:') ? myById[c.slice(3)] : byId[c]))

  const removeHist = async (catId: string): Promise<void> => {
    await api.progressRemoveAnime(catId)
    refresh()
  }
  const clearAll = async (): Promise<void> => {
    if (!confirm('確定清除所有觀看紀錄？（不影響「已看完」標記）')) return
    await api.progressClear()
    setProgress([])
  }

  const histShown = histAll ? history : history.slice(0, PAGE_H)
  const doneShown = doneAll ? doneList : doneList.slice(0, PAGE_W)

  return (
    <div className="pt-24 px-8 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">觀看紀錄</h1>
        {history.length > 0 && (
          <button onClick={clearAll} className="text-sm text-zinc-400 hover:text-white">
            清除紀錄
          </button>
        )}
      </div>

      {!loaded ? (
        <p className="text-zinc-400">載入中…</p>
      ) : history.length === 0 && doneList.length === 0 ? (
        <p className="text-zinc-400">還沒有觀看紀錄。看過的動畫會出現在這裡。</p>
      ) : (
        <>
          <Section title="最近觀看" count={history.length} open={openHist} onToggle={() => setOpenHist((o) => !o)}>
            {history.length === 0 ? (
              <p className="text-zinc-500 text-sm">沒有進行中的紀錄。</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-5">
                  {histShown.map((p) => (
                    <HistoryCard
                      key={p.catId}
                      p={p}
                      onRemove={() => removeHist(p.catId)}
                      onMarkWatched={() => toggleWatched(p.catId)}
                    />
                  ))}
                </div>
                {history.length > PAGE_H && (
                  <button onClick={() => setHistAll((s) => !s)} className="mt-4 text-sm text-zinc-400 hover:text-white">
                    {histAll ? '收合' : `顯示更多（還有 ${history.length - PAGE_H}）`}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="已看完" count={doneList.length} open={openDone} onToggle={() => setOpenDone((o) => !o)}>
            {doneList.length === 0 ? (
              <p className="text-zinc-500 text-sm">還沒有標記已看完的動畫。在動畫頁、或上面卡片左上角打勾即可標記。</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-5">
                  {doneShown.map((c) => (
                    <WatchedCard key={c} catId={c} onUnmark={() => toggleWatched(c)} />
                  ))}
                </div>
                {doneList.length > PAGE_W && (
                  <button onClick={() => setDoneAll((s) => !s)} className="mt-4 text-sm text-zinc-400 hover:text-white">
                    {doneAll ? '收合' : `顯示更多（還有 ${doneList.length - PAGE_W}）`}
                  </button>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
