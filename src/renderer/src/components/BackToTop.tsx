import { useEffect, useState } from 'react'

/** Floating 回到頂部 button — the infinite-scroll pages get long fast. */
export default function BackToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setShow(window.scrollY > 800)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="回到頂部"
      className="fixed bottom-6 right-6 z-50 h-11 w-11 rounded-full bg-zinc-800/95 ring-1 ring-white/15 shadow-xl text-white hover:bg-zinc-700 transition-colors flex items-center justify-center"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}
