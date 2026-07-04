import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { addSearchHistory, getSearchHistory, removeSearchHistory, clearSearchHistory } from '../searchHistory'

export default function Nav() {
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false) // distinguishes active typing from a retained prior query
  const [history, setHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // `/` from anywhere (except while typing in a field) jumps to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inField =
        t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || !!t?.isContentEditable
      if (e.key === '/' && !inField) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goSearch = (query: string) => {
    const term = query.trim()
    if (!term) return
    setHistory(addSearchHistory(term))
    setQ(term)
    setTyping(false)
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
    nav(`/search?q=${encodeURIComponent(term)}`)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    goSearch(q)
  }

  // Highlight the section even on its sub-pages (e.g. /myself/anime/… → Myself).
  const active = (p: string) =>
    (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))
      ? 'text-white'
      : 'text-zinc-400 hover:text-white'

  // On focus we show recent searches; once the user actually types, we narrow to
  // matches. A retained prior query (typing=false) still shows the full history
  // (minus the exact current term) so re-focusing always surfaces past searches.
  const term = q.trim()
  const base = history.filter((h) => h !== term)
  const suggestions = typing && term ? base.filter((h) => h.toLowerCase().includes(term.toLowerCase())) : base

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-ink/95 shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="flex items-center gap-6 px-8 h-16">
        {loc.pathname !== '/' && (
          <button
            onClick={() => nav(-1)}
            title="返回"
            className="flex items-center gap-1 text-zinc-300 hover:text-white -ml-2"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            <span className="text-sm">返回</span>
          </button>
        )}
        <Link to="/" className="text-brand font-extrabold text-2xl tracking-tight">
          ANIME1
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link to="/" className={active('/')}>
            首頁
          </Link>
          <Link to="/mylist" className={active('/mylist')}>
            我的片單
          </Link>
          <Link to="/history" className={active('/history')}>
            觀看紀錄
          </Link>
          <Link to="/downloads" className={active('/downloads')}>
            離線下載
          </Link>
          <Link to="/myself" className={active('/myself')}>
            Myself 動漫
          </Link>
        </nav>
        <div
          className="ml-auto relative"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
          }}
        >
          <form onSubmit={submit} className="relative">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setTyping(true)
              }}
              onFocus={() => {
                setHistory(getSearchHistory())
                setOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false)
                  e.currentTarget.blur()
                }
              }}
              placeholder="搜尋動畫…（/）"
              className="bg-black/60 border border-white/20 rounded pl-3 pr-8 py-1.5 text-sm w-56 focus:w-72 transition-all outline-none focus:border-white/50"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('')
                  setTyping(true)
                }}
                title="清除"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </form>

          {open && suggestions.length > 0 && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-zinc-900 border border-white/10 rounded-lg py-1 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-500">
                <span>最近搜尋</span>
                <button
                  type="button"
                  onClick={() => setHistory(clearSearchHistory())}
                  className="hover:text-zinc-300"
                >
                  清除全部
                </button>
              </div>
              {suggestions.map((h) => (
                <div key={h} className="group/h flex items-center hover:bg-white/10">
                  <button
                    type="button"
                    onClick={() => goSearch(h)}
                    className="flex-1 flex items-center gap-2 text-left px-3 py-1.5 text-sm text-zinc-200 truncate"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500 shrink-0"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                    <span className="truncate">{h}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistory(removeSearchHistory(h))}
                    title="移除"
                    className="px-2 text-zinc-500 hover:text-white opacity-0 group-hover/h:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
