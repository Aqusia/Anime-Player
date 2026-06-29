import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { useStore } from '../store'
import { api } from '../api'
import { fmtTime } from '../lib'
import { getSavedVolume, saveVolume, getSavedRate, saveRate } from '../playerPrefs'

const Icon = {
  play: <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
  pause: <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>,
  prev: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zM20 6v12l-9-6z" /></svg>,
  next: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l9 6-9 6z" /></svg>,
  back: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>,
  volume: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" /></svg>,
  mute: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13 1.5l2.5-2.5 1 1L17 12.5l2.5 2.5-1 1L16 13.5 13.5 16l-1-1 2.5-2.5L12.5 10l1-1L16 11.5z" /></svg>,
  fullscreen: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>,
  pip: <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z" /></svg>
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

interface Ep {
  id: string
  label: string
  apireq?: string
}

export default function Player() {
  const { source = 'me', animeId = '', epId = '' } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const isMy = source === 'my'
  const byId = useStore((s) => s.byId)
  const markWatched = useStore((s) => s.markWatched)
  const notePlayed = useStore((s) => s.notePlayed)
  const myById = useStore((s) => s.myById)
  const loadMyCatalog = useStore((s) => s.loadMyCatalog)
  const [myTitle, setMyTitle] = useState('')
  const [myCover, setMyCover] = useState('')
  const st = loc.state as { title?: string; cover?: string } | null
  const title = isMy ? st?.title || myTitle : byId[animeId]?.title || ''
  const cover = isMy ? myCover || st?.cover || '' : ''
  const progCat = isMy ? `my:${animeId}` : animeId

  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const [eps, setEps] = useState<Ep[]>([])
  const [src, setSrc] = useState('')
  const [isHls, setIsHls] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [buf, setBuf] = useState(0)
  const [vol, setVol] = useState(getSavedVolume)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(getSavedRate)
  const [speedMenu, setSpeedMenu] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null) // auto-next overlay (s)
  const [buffering, setBuffering] = useState(true)
  const [showUI, setShowUI] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const [hover, setHover] = useState<{ ratio: number; t: number } | null>(null)

  const idx = eps.findIndex((e) => e.id === epId)
  const ep = idx >= 0 ? eps[idx] : undefined
  const nextEp = idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : undefined
  const prevEp = idx > 0 ? eps[idx - 1] : undefined
  const isLocal = src.includes('/file/')

  const resumeRef = useRef(0)
  const lastSave = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const overBarRef = useRef(false)
  const scrubbingRef = useRef(false)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPreviewT = useRef(0)

  const go = useCallback(
    (id: string) => nav(`/watch/${source}/${animeId}/${id}`, isMy ? { state: { title } } : undefined),
    [nav, source, animeId, isMy, title]
  )

  // myself catalog gives us `kind` (連載中 vs 完結) so we don't auto-mark an
  // airing show 已看完 just because the latest episode ended.
  useEffect(() => {
    if (isMy) loadMyCatalog()
  }, [isMy, loadMyCatalog])

  useEffect(() => {
    if (!animeId) return
    if (isMy)
      api
        .myselfDetails(animeId)
        .then((d) => {
          setMyTitle(d.title)
          if (d.cover) setMyCover(d.cover)
          setEps(d.episodes.map((e) => ({ id: e.vid, label: e.name })))
        })
        .catch(() => {})
    else
      api
        .episodes(animeId)
        .then((l) => setEps(l.map((e) => ({ id: e.postId, label: e.title, apireq: e.apireq }))))
        .catch(() => {})
  }, [animeId, isMy])

  useEffect(() => {
    let cancelled = false
    setErr(null)
    setSrc('')
    setIsHls(false)
    setBuffering(true)
    if (!ep) return
    if (isMy) {
      api
        .myselfStreamUrl(animeId, epId)
        .then(({ url, hls }) => {
          if (cancelled) return
          setSrc(url)
          setIsHls(hls)
        })
        .catch((e) => !cancelled && setErr(String(e?.message || e)))
    } else {
      api
        .streamUrl({ catId: animeId, postId: epId, apireq: ep.apireq || '' })
        .then((u) => !cancelled && setSrc(u))
        .catch((e) => !cancelled && setErr(String(e?.message || e)))
    }
    return () => {
      cancelled = true
    }
  }, [ep?.id])

  // HLS sources (myself-bbs) aren't natively playable in Chromium — attach via hls.js.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src || !isHls) return
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src // native HLS (e.g. Safari) — not Electron, but harmless
      return
    }
    if (!Hls.isSupported()) {
      setErr('此裝置不支援 HLS 串流播放。')
      return
    }
    const hls = new Hls({ maxBufferLength: 30 })
    hls.loadSource(src)
    hls.attachMedia(v)
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      else {
        setErr('影片載入失敗，可能來源已更新或無法連線，請返回重試。')
        hls.destroy()
      }
    })
    return () => hls.destroy()
  }, [src, isHls])

  // Seek-preview source for HLS (myself). The main <video> is busy playing, so the
  // hidden preview video gets its OWN lightweight hls.js instance — that's what
  // restores the scrub thumbnail on the myself source. (mp4/anime1 just uses the
  // preview <video>'s plain `src` attribute.) Small buffers keep it from competing
  // with playback.
  useEffect(() => {
    const pv = previewRef.current
    if (!pv || !src || !isHls) return
    if (pv.canPlayType('application/vnd.apple.mpegurl')) {
      pv.src = src
      return
    }
    if (!Hls.isSupported()) return
    const hls = new Hls({ maxBufferLength: 4, maxMaxBufferLength: 8 })
    hls.loadSource(src)
    hls.attachMedia(pv)
    return () => hls.destroy()
  }, [src, isHls])

  useEffect(() => {
    resumeRef.current = 0
    api.progressOne(progCat, epId).then((p) => (resumeRef.current = p?.position || 0))
  }, [progCat, epId])

  const saveProgress = useCallback(
    (position: number, duration: number) => {
      const p = {
        catId: progCat,
        postId: epId,
        position,
        duration,
        episodeTitle: ep?.label || '',
        animeTitle: title,
        episodeNum: idx >= 0 ? idx + 1 : undefined,
        totalEpisodes: eps.length || undefined,
        cover: cover || undefined,
        updatedAt: Date.now()
      }
      api.setProgress(p)
      notePlayed(p) // keep poster status markers fresh without a refetch
    },
    [progCat, epId, ep?.label, title, idx, eps.length, cover, notePlayed]
  )

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    if (!scrubbing) setCur(v.currentTime)
    const now = Date.now()
    if (v.duration && now - lastSave.current > 4000) {
      lastSave.current = now
      saveProgress(v.currentTime, v.duration)
    }
  }

  const onLoadedMeta = () => {
    const v = videoRef.current
    if (!v) return
    setDur(v.duration)
    if (resumeRef.current > 5 && resumeRef.current < v.duration - 10) v.currentTime = resumeRef.current
    v.volume = vol
    v.playbackRate = rate
    v.play().catch(() => {})
  }

  const onBuffer = () => {
    const v = videoRef.current
    if (!v || !v.buffered.length || !v.duration) return
    setBuf((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
  }

  const onEnded = () => {
    const v = videoRef.current
    if (v) saveProgress(v.duration, v.duration)
    // Netflix-style: count down, then auto-advance — but let the user cancel.
    if (nextEp) setCountdown(5)
    // finished the last available episode → mark the whole anime 已看完, UNLESS
    // it's a still-airing myself show (more episodes are coming).
    else if (!(isMy && myById[animeId]?.kind === 'airing')) markWatched(progCat)
  }

  const cancelAutoNext = useCallback(() => setCountdown(null), [])

  // reset any pending auto-next when the episode changes
  useEffect(() => setCountdown(null), [epId])

  // tick the auto-next countdown; advance when it reaches 0
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      if (nextEp) go(nextEp.id)
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, nextEp, go])

  const togglePlay = useCallback(() => {
    setCountdown(null) // a manual play/pause means the user isn't waiting on auto-next
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }, [])

  const seek = (t: number) => {
    setCountdown(null)
    const v = videoRef.current
    if (!v) return
    const nt = Math.max(0, Math.min(t, v.duration || t))
    v.currentTime = nt
    setCur(nt)
  }

  const ratioFromX = (clientX: number) => {
    const el = barRef.current
    if (!el || !dur) return 0
    const rect = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  // hover preview: throttle-seek a hidden video and paint its frame to canvas
  const onBarHover = (clientX: number) => {
    if (!dur) return
    const ratio = ratioFromX(clientX)
    const t = ratio * dur
    setHover({ ratio, t })
    lastPreviewT.current = t
    if (!previewTimer.current) {
      previewTimer.current = setTimeout(() => {
        previewTimer.current = null
        const pv = previewRef.current
        if (pv && isFinite(lastPreviewT.current)) {
          try {
            pv.currentTime = lastPreviewT.current
          } catch {
            /* not seekable yet */
          }
        }
      }, 80)
    }
  }
  const onPreviewSeeked = () => {
    const pv = previewRef.current
    const cv = canvasRef.current
    if (!pv || !cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(pv, 0, 0, cv.width, cv.height)
    } catch {
      /* tainted / not ready */
    }
  }

  const setSpeed = (r: number) => {
    setRate(r)
    saveRate(r)
    if (videoRef.current) videoRef.current.playbackRate = r
    setSpeedMenu(false)
  }

  const setVolume = (nv: number) => {
    const v = Math.min(1, Math.max(0, nv))
    setVol(v)
    saveVolume(v)
    if (videoRef.current) {
      videoRef.current.volume = v
      videoRef.current.muted = v === 0
    }
  }

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen().catch(() => {})
  }, [])

  const togglePiP = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      /* ignore */
    }
  }, [])

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const revealUI = useCallback(() => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      // Never auto-hide while the user is interacting with the seek bar.
      if (
        videoRef.current &&
        !videoRef.current.paused &&
        !overBarRef.current &&
        !scrubbingRef.current
      )
        setShowUI(false)
    }, 3000)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current
      revealUI()
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          if (v) seek(v.currentTime + 10)
          break
        case 'ArrowLeft':
          if (v) seek(v.currentTime - 10)
          break
        case 'ArrowUp':
          setVolume(vol + 0.1)
          break
        case 'ArrowDown':
          setVolume(vol - 0.1)
          break
        case '>':
        case '.':
          setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(rate) + 1)] || rate)
          break
        case '<':
        case ',':
          setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(rate) - 1)] || rate)
          break
        case 'f':
          toggleFullscreen()
          break
        case 'p':
          togglePiP()
          break
        case 'n':
          if (nextEp) go(nextEp.id)
          break
        case 'Escape':
          if (!document.fullscreenElement) nav(-1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleFullscreen, togglePiP, revealUI, nextEp, dur, rate, vol])

  const playedPct = dur ? (cur / dur) * 100 : 0
  const volPct = (muted ? 0 : vol) * 100

  return (
    <div
      ref={containerRef}
      onMouseMove={revealUI}
      onDoubleClick={toggleFullscreen}
      className="relative w-screen h-screen bg-black overflow-hidden select-none"
      style={{ cursor: showUI ? 'default' : 'none' }}
    >
      {src ? (
        <video
          ref={videoRef}
          src={isHls ? undefined : src}
          className="w-full h-full"
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true)
            revealUI()
          }}
          onPause={() => {
            setPlaying(false)
            setShowUI(true)
          }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMeta}
          onProgress={onBuffer}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={onEnded}
          onEnterPictureInPicture={() => setIsPiP(true)}
          onLeavePictureInPicture={() => setIsPiP(false)}
          onVolumeChange={() => {
            const v = videoRef.current
            if (v) setMuted(v.muted)
          }}
          onError={() => {
            // For HLS, hls.js owns error handling; ignore spurious element errors.
            if (!isHls) setErr('影片載入失敗，可能來源已更新或無法連線，請返回重試。')
          }}
        />
      ) : (
        !err && <div className="absolute inset-0 flex items-center justify-center text-zinc-400">載入影片中…</div>
      )}

      {/* hidden video used only to render seek-preview frames (mp4 + HLS).
          src is set imperatively above (plain src for mp4, hls.js for HLS). */}
      {src && (
        <video
          ref={previewRef}
          src={isHls ? undefined : src}
          crossOrigin="anonymous"
          muted
          preload="auto"
          onSeeked={onPreviewSeeked}
          className="absolute opacity-0 pointer-events-none w-px h-px -z-10"
        />
      )}

      {buffering && src && !err && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-14 w-14 border-[3px] border-white/25 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {!playing && src && !buffering && !err && countdown === null && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto h-20 w-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 hover:scale-105 transition-all"
        >
          <span className="ml-1">{Icon.play}</span>
        </button>
      )}

      {/* auto-play-next countdown (cancelable) */}
      {countdown !== null && countdown > 0 && nextEp && (
        <div className="absolute bottom-24 right-6 z-40 w-72 bg-zinc-900/95 border border-white/15 rounded-lg shadow-2xl p-4">
          <div className="text-xs text-zinc-400 mb-1">{countdown} 秒後播放下一集</div>
          <div className="text-sm font-semibold text-white truncate mb-3">{nextEp.label}</div>
          <div className="flex gap-2">
            <button
              onClick={() => go(nextEp.id)}
              className="flex-1 bg-white text-black rounded py-1.5 text-sm font-semibold hover:bg-zinc-200 flex items-center justify-center gap-1.5"
            >
              {Icon.next} 立即播放
            </button>
            <button
              onClick={cancelAutoNext}
              className="px-3 bg-white/15 rounded py-1.5 text-sm text-white hover:bg-white/25"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <p className="text-zinc-300">{err}</p>
          <button onClick={() => nav(-1)} className="bg-white/20 px-5 py-2 rounded hover:bg-white/30">返回</button>
        </div>
      )}

      {/* top bar */}
      <div className={`absolute top-0 inset-x-0 px-5 pt-5 pb-12 bg-gradient-to-b from-black/80 to-transparent transition-all duration-300 ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        <button onClick={() => nav(-1)} className="text-white/90 hover:text-white flex items-center gap-1.5 text-sm">
          {Icon.back} 返回
        </button>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() =>
              nav(isMy ? `/myself/anime/${animeId}` : `/anime/${animeId}`, isMy ? { state: { title } } : undefined)
            }
            title="回到動畫介紹頁"
            className="text-xl font-semibold drop-shadow hover:text-brand transition-colors"
          >
            {title}
          </button>
          {ep && <span className="text-zinc-300">— {ep.label}</span>}
          {isMy && <span className="text-[11px] bg-emerald-500/20 text-emerald-300 rounded-full px-2 py-0.5">Myself</span>}
          {isLocal && <span className="text-[11px] bg-sky-500/20 text-sky-300 rounded-full px-2 py-0.5">離線</span>}
        </div>
      </div>

      {/* bottom controls */}
      <div className={`absolute bottom-0 inset-x-0 px-6 pb-5 pt-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-all duration-300 ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        {/* seek bar + hover preview */}
        <div
          ref={barRef}
          onPointerDown={(e) => {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            scrubbingRef.current = true
            setScrubbing(true)
            seek(ratioFromX(e.clientX) * dur)
          }}
          onPointerMove={(e) => {
            if (scrubbing) seek(ratioFromX(e.clientX) * dur)
            onBarHover(e.clientX)
          }}
          onPointerUp={() => {
            scrubbingRef.current = false
            setScrubbing(false)
          }}
          onMouseEnter={() => {
            overBarRef.current = true
            revealUI()
          }}
          onMouseLeave={() => {
            overBarRef.current = false
            setHover(null)
            revealUI()
          }}
          className="group/seek relative h-4 flex items-center cursor-pointer"
        >
          {hover && dur > 0 && (
            <div
              className="absolute bottom-7 -translate-x-1/2 pointer-events-none"
              style={{ left: `${Math.min(93, Math.max(7, hover.ratio * 100))}%` }}
            >
              <canvas ref={canvasRef} width={168} height={94} className="rounded-md border border-white/25 bg-black shadow-2xl" />
              <div className="text-center text-xs mt-1 tabular-nums text-white drop-shadow">{fmtTime(hover.t)}</div>
            </div>
          )}
          <div className="relative w-full h-1 group-hover/seek:h-1.5 transition-all rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full" style={{ width: `${buf}%` }} />
            <div className="absolute inset-y-0 left-0 bg-brand rounded-full" style={{ width: `${playedPct}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3.5 w-3.5 rounded-full bg-brand shadow scale-0 group-hover/seek:scale-100 transition-transform" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button onClick={togglePlay} className="text-white hover:text-brand transition-colors">{playing ? Icon.pause : Icon.play}</button>
          <button onClick={() => prevEp && go(prevEp.id)} disabled={!prevEp} className="text-white/90 hover:text-brand disabled:opacity-30 transition-colors" title="上一集">{Icon.prev}</button>
          <button onClick={() => nextEp && go(nextEp.id)} disabled={!nextEp} className="text-white/90 hover:text-brand disabled:opacity-30 transition-colors" title="下一集 (N)">{Icon.next}</button>

          {/* volume — always-visible custom slider */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white/90 hover:text-brand transition-colors">{muted || vol === 0 ? Icon.mute : Icon.volume}</button>
            <div
              onPointerDown={(e) => {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                const r = e.currentTarget.getBoundingClientRect()
                setVolume((e.clientX - r.left) / r.width)
                ;(e.currentTarget as HTMLElement).dataset.drag = '1'
              }}
              onPointerMove={(e) => {
                if ((e.currentTarget as HTMLElement).dataset.drag !== '1') return
                const r = e.currentTarget.getBoundingClientRect()
                setVolume((e.clientX - r.left) / r.width)
              }}
              onPointerUp={(e) => ((e.currentTarget as HTMLElement).dataset.drag = '')}
              className="group/vol relative h-4 w-20 flex items-center cursor-pointer"
            >
              <div className="relative w-full h-1 rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 bg-white rounded-full" style={{ width: `${volPct}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3 w-3 rounded-full bg-white shadow opacity-0 group-hover/vol:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          </div>

          <span className="tabular-nums text-sm text-zinc-200 ml-1">
            {fmtTime(cur)} <span className="text-zinc-500">/ {fmtTime(dur)}</span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            {/* speed */}
            <div className="relative">
              <button
                onClick={() => setSpeedMenu((v) => !v)}
                className={`px-2 py-1 rounded text-sm font-semibold hover:text-brand transition-colors ${rate !== 1 ? 'text-brand' : 'text-white/90'}`}
                title="播放速度"
              >
                {rate}x
              </button>
              {speedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-white/10 rounded-lg py-1 shadow-2xl">
                  {SPEEDS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setSpeed(r)}
                      className={`block w-20 text-left px-3 py-1.5 text-sm hover:bg-white/10 ${r === rate ? 'text-brand font-semibold' : 'text-zinc-200'}`}
                    >
                      {r}x{r === 1 ? ' (正常)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={togglePiP} className={`hover:text-brand transition-colors ${isPiP ? 'text-brand' : 'text-white/90'}`} title="子母畫面 / 懸浮視窗 (P)">{Icon.pip}</button>
            <button onClick={toggleFullscreen} className="text-white/90 hover:text-brand transition-colors" title="全螢幕 (F)">{Icon.fullscreen}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
