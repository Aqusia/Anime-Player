import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { api, type MyAnime } from '../api'
import { weightedScore } from '../lib'
import { addSearchHistory, clearSearchHistory, getSearchHistory, removeSearchHistory } from '../searchHistory'
import Card from '../components/Card'
import MyCard from '../components/MyCard'
import { PosterGridSkeleton } from '../components/Skeleton'

type Tab = 'all' | 'me' | 'my'

export default function Search() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const q = (params.get('q') || '').trim()
  const list = useStore((s) => s.list)
  const meta = useStore((s) => s.meta)
  const [tab, setTab] = useState<Tab>('all')
  const [my, setMy] = useState<MyAnime[] | null>(null)
  const [myLoading, setMyLoading] = useState(false)
  const [history, setHistory] = useState<string[]>(getSearchHistory())

  // record every searched term so it shows up in history (here + the nav box)
  useEffect(() => {
    if (q) setHistory(addSearchHistory(q))
  }, [q])

  // anime1 (primary) — instant, from the in-memory list, ranked by rating.
  const me = useMemo(() => {
    if (!q) return []
    const lc = q.toLowerCase()
    return list
      .filter((a) => a.title.toLowerCase().includes(lc))
      .sort((a, b) => weightedScore(meta[b.catId]) - weightedScore(meta[a.catId]))
      .slice(0, 200)
  }, [q, list, meta])

  // myself (secondary) — async, fuzzy across the whole cached catalog.
  useEffect(() => {
    if (!q) {
      setMy(null)
      return
    }
    setMyLoading(true)
    let cancelled = false
    api
      .myselfSearch(q)
      .then((r) => !cancelled && setMy(r))
      .catch(() => !cancelled && setMy([]))
      .finally(() => !cancelled && setMyLoading(false))
    return () => {
      cancelled = true
    }
  }, [q])

  const tabs: { key: Tab; label: string; count: number | null }[] = [
    { key: 'all', label: '全部', count: me.length + (my?.length ?? 0) },
    { key: 'me', label: 'anime1（主來源）', count: me.length },
    { key: 'my', label: 'Myself 動漫', count: my?.length ?? (myLoading ? null : 0) }
  ]

  const showMe = tab === 'all' || tab === 'me'
  const showMy = tab === 'all' || tab === 'my'

  return (
    <div className="pt-24 pb-20">
      <h1 className="px-8 text-2xl font-bold mb-4">
        搜尋：<span className="text-brand">{q}</span>
      </h1>

      <div className="px-8 flex gap-2 mb-7 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              t.key === tab ? 'bg-brand text-white' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{t.count ?? '…'}</span>
          </button>
        ))}
      </div>

      {!q ? (
        <div className="px-8">
          {history.length > 0 ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-semibold text-zinc-200">最近搜尋</h2>
                <button
                  onClick={() => setHistory(clearSearchHistory())}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  清除全部
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((h) => (
                  <span
                    key={h}
                    className="group/h flex items-center bg-white/10 hover:bg-white/15 rounded-full overflow-hidden"
                  >
                    <button
                      onClick={() => nav(`/search?q=${encodeURIComponent(h)}`)}
                      className="pl-4 pr-2 py-1.5 text-sm text-zinc-200"
                    >
                      {h}
                    </button>
                    <button
                      onClick={() => setHistory(removeSearchHistory(h))}
                      title="移除"
                      className="pr-3 pl-1 py-1.5 text-zinc-500 hover:text-white"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-zinc-400">輸入關鍵字以搜尋。</p>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {showMe && (
            <section>
              {tab === 'all' && (
                <h2 className="px-8 text-lg font-semibold mb-3 text-zinc-200">
                  anime1（主來源） <span className="text-sm font-normal text-zinc-500">{me.length}</span>
                </h2>
              )}
              {me.length ? (
                <div className="flex flex-wrap gap-x-3 gap-y-5 px-8">
                  {me.map((a) => (
                    <Card key={a.catId} anime={a} />
                  ))}
                </div>
              ) : (
                <p className="px-8 text-zinc-500 text-sm">anime1 沒有符合的作品。</p>
              )}
            </section>
          )}

          {showMy && (
            <section>
              {tab === 'all' && (
                <h2 className="px-8 text-lg font-semibold mb-3 text-zinc-200">
                  Myself 動漫{' '}
                  <span className="text-sm font-normal text-zinc-500">{my?.length ?? '…'}</span>
                </h2>
              )}
              {myLoading && my === null ? (
                <div className="px-8">
                  <PosterGridSkeleton count={6} />
                </div>
              ) : my && my.length ? (
                <div className="flex flex-wrap gap-x-3 gap-y-5 px-8">
                  {my.map((a) => (
                    <MyCard key={a.id} a={a} />
                  ))}
                </div>
              ) : (
                <p className="px-8 text-zinc-500 text-sm">Myself 沒有符合的作品。</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
