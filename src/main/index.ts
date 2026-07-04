import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { startProxy } from './proxy'
import { registerIpc } from './ipc'
import { getAnimeList } from './anime1/service'
import { buildMetadata } from './metadata/build'
import { ensureMyIndex, enrichMeta } from './myself/service'
import { setDownloadProgressHandler } from './download'
import { db } from './store'

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

function createWindow(): void {
  // Restore the last window size/position/maximized state (ignore a saved
  // position that's no longer on any display, e.g. an unplugged monitor).
  const saved = db.getWinState()
  const b = saved.bounds
  const onScreen =
    b &&
    screen.getAllDisplays().some(
      (d) =>
        b.x < d.bounds.x + d.bounds.width - 40 &&
        b.x + b.width > d.bounds.x + 40 &&
        b.y < d.bounds.y + d.bounds.height - 40 &&
        b.y + b.height > d.bounds.y + 40
    )

  const win = new BrowserWindow({
    width: b?.width || 1360,
    height: b?.height || 860,
    ...(onScreen && b ? { x: b.x, y: b.y } : {}),
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    title: 'Anime1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (saved.maximized) win.maximize()

  // Persist window state (debounced; getNormalBounds so a maximized session
  // still remembers the restored size underneath).
  let saveTimer: NodeJS.Timeout | null = null
  const saveState = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      db.setWinState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() })
    }, 500)
  }
  win.on('resize', saveState)
  win.on('move', saveState)
  win.on('maximize', saveState)
  win.on('unmaximize', saveState)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward renderer console + load failures to the main stdout (dev aid).
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await startProxy()
  registerIpc()
  setDownloadProgressHandler((s) => broadcast('download:progress', s))
  createWindow()

  // Build/refresh Bangumi metadata in the background (non-blocking).
  getAnimeList()
    .then((list) => buildMetadata(list, (s) => broadcast('meta:progress', s)))
    .catch((e) => console.log('[metadata build skipped]', e?.message || e))

  // Warm the myself-bbs catalog index so browse + search are instant when the
  // user needs them (the first build crawls ~120 list pages). Non-blocking. Once
  // it's ready, enrich it with Bangumi score + premiere year in the background
  // (unifies the look with anime1 and powers the year filter).
  ensureMyIndex()
    .then((idx) => {
      console.log('[myself index ready]', idx.length, 'titles')
      return enrichMeta(() => broadcast('my:enriched', null))
    })
    .then(() => console.log('[myself meta enriched]'))
    .catch((e) => console.log('[myself index/meta skipped]', e?.message || e))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
