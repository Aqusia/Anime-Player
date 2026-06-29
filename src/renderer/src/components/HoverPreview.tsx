import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

/**
 * Netflix-style hover preview video box. Mount it (only while a card is hovered)
 * and it resolves the episode's stream, plays a muted clip, and tears everything
 * down on unmount — so only the hovered card ever streams. Render-only the 16:9
 * video; the parent positions the popover and adds any caption.
 */
export default function HoverPreview({ resolve }: { resolve: () => Promise<{ url: string; hls: boolean }> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<{ url: string; hls: boolean } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    resolve()
      .then((s) => !cancelled && setSrc(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    v.muted = true
    let hls: Hls | null = null
    const onMeta = () => {
      setReady(true)
      // skip past the opening so the preview shows actual content
      try {
        if (v.duration && isFinite(v.duration)) v.currentTime = Math.min(v.duration * 0.2, 90)
      } catch {
        /* not seekable yet */
      }
      v.play().catch(() => {})
    }
    v.addEventListener('loadedmetadata', onMeta)
    if (src.hls && !v.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 8 })
      hls.loadSource(src.url)
      hls.attachMedia(v)
    } else {
      v.src = src.url
    }
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      if (hls) hls.destroy()
      v.removeAttribute('src')
      try {
        v.load()
      } catch {
        /* ignore */
      }
    }
  }, [src])

  return (
    <div className="relative aspect-video rounded-md overflow-hidden bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted preload="metadata" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
