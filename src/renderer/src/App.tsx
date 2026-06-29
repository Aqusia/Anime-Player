import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import Nav from './components/Nav'
import { useStore } from './store'
import { api } from './api'

export default function App() {
  const load = useStore((s) => s.load)
  const loadMeta = useStore((s) => s.loadMeta)
  const setMetaStatus = useStore((s) => s.setMetaStatus)
  const loadDownloads = useStore((s) => s.loadDownloads)
  const setDownloads = useStore((s) => s.setDownloads)
  const loadProgress = useStore((s) => s.loadProgress)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()
  const navType = useNavigationType()
  const scrollPos = useRef<Record<string, number>>({})

  // Record the scroll position for the current history entry as the user scrolls.
  useEffect(() => {
    const key = location.key
    const onScroll = (): void => {
      scrollPos.current[key] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key])

  // On navigation: forward (PUSH) → top; back/forward (POP) → restore where the
  // user left that page. (Opening a detail while scrolled used to land mid-page.)
  useEffect(() => {
    if (navType === 'POP') {
      const y = scrollPos.current[location.key] || 0
      requestAnimationFrame(() => window.scrollTo(0, y))
    } else {
      window.scrollTo(0, 0)
    }
  }, [location.key, navType])

  useEffect(() => {
    load()
    loadMeta()
    loadDownloads()
    loadProgress()
    // refresh progress when the window regains focus (e.g. after watching)
    const onFocus = (): void => void loadProgress()
    window.addEventListener('focus', onFocus)
    // While metadata builds in the background, refresh the lite map (throttled).
    const offMeta = api.onMetaProgress((s) => {
      setMetaStatus(s)
      if (!reloadTimer.current) {
        reloadTimer.current = setTimeout(() => {
          reloadTimer.current = null
          loadMeta()
        }, 4000)
      }
    })
    const offDl = api.onDownloadProgress((s) => setDownloads(s))
    return () => {
      offMeta()
      offDl()
      window.removeEventListener('focus', onFocus)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [load, loadMeta, setMetaStatus, loadDownloads, setDownloads, loadProgress])

  return (
    <div className="min-h-screen bg-ink text-white">
      <Nav />
      <Outlet />
    </div>
  )
}
