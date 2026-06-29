import https from 'node:https'
import crypto from 'node:crypto'

// How myself-bbs resolves a playable stream (verified live, VPX-Player v2.0.17):
// the episode page opens `wss://v.myself-bbs.com/ws`, sends {tid, vid, id} and
// gets back {status:"ok", video:"//vpxNN.myself-bbs.com/vpx/<tid>/<vid>/720p.m3u8"}.
// Electron 31 runs Node 20 (no global WebSocket), so rather than add a dependency
// we speak the tiny one-shot WebSocket handshake by hand over the https module
// (which also lets us force IPv4, matching http.ts). One masked text frame out,
// one server text frame in, done.
const WS_HOST = 'v.myself-bbs.com'

interface VpxReply {
  status: string
  message?: string
  video?: string
  videos?: Record<string, string>
}

interface WsPayload {
  tid: string
  vid: string
  id: string
}

function once(payload: WsPayload, timeoutMs: number): Promise<VpxReply> {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64')
    const req = https.request({
      hostname: WS_HOST,
      path: '/ws',
      method: 'GET',
      family: 4,
      timeout: timeoutMs,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        Origin: 'https://' + WS_HOST,
        'User-Agent': 'Mozilla/5.0'
      }
    })

    let settled = false
    const done = (err: Error | null, val?: VpxReply): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(val as VpxReply)
    }

    req.on('timeout', () => {
      req.destroy()
      done(new Error('ws timeout'))
    })
    req.on('error', (e) => done(e))
    req.on('response', () => done(new Error('ws upgrade rejected')))

    req.on('upgrade', (_res, socket) => {
      // Client frames must be masked (RFC 6455). Payload is tiny (<126 bytes).
      const frame = Buffer.from(JSON.stringify(payload))
      const mask = crypto.randomBytes(4)
      const header = Buffer.from([0x81, 0x80 | frame.length]) // FIN + text, masked
      const masked = Buffer.alloc(frame.length)
      for (let i = 0; i < frame.length; i++) masked[i] = frame[i] ^ mask[i % 4]
      socket.write(Buffer.concat([header, mask, masked]))

      let buf = Buffer.alloc(0)
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        if (buf.length < 2) return
        let off = 2
        let len = buf[1] & 0x7f
        if (len === 126) {
          if (buf.length < 4) return
          len = buf.readUInt16BE(2)
          off = 4
        } else if (len === 127) {
          if (buf.length < 10) return
          len = Number(buf.readBigUInt64BE(2))
          off = 10
        }
        if (buf.length < off + len) return // frame not fully arrived yet
        const text = buf.slice(off, off + len).toString('utf8')
        socket.destroy()
        try {
          done(null, JSON.parse(text) as VpxReply)
        } catch (e) {
          done(e as Error)
        }
      })
      socket.on('error', (e) => done(e))
      socket.on('timeout', () => {
        socket.destroy()
        done(new Error('ws socket timeout'))
      })
      socket.on('close', () => done(new Error('ws closed before reply')))
    })

    req.end()
  })
}

/**
 * Resolve a myself-bbs episode to its absolute HLS playlist URL.
 * @param tid thread id (the anime), e.g. "44182"
 * @param vid episode id: a numeric episode code ("001", old format) OR an opaque
 *   player token ("AgAD…", newer format). Numeric → WS {tid,vid}; token → WS {id}.
 */
export async function resolveMyself(tid: string, vid: string, retries = 3): Promise<string> {
  const payload: WsPayload = /^\d+$/.test(vid)
    ? { tid, vid, id: '' }
    : { tid: '', vid: '', id: vid }
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt))
    try {
      const reply = await once(payload, 12000)
      const v = reply.video || reply.videos?.['720P'] || reply.videos?.['Auto']
      if (reply.status === 'ok' && v) {
        // The CDN returns a protocol-relative URL ("//vpx05...").
        return v.startsWith('//') ? 'https:' + v : v
      }
      throw new Error(reply.message || 'resolve failed')
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
