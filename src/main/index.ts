import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { defaultSearchDirs, findFfmpeg } from './ffmpeg'
import { registerIpc } from './ipc'
import { createStore } from './store'
import { createYtDlp } from './ytdlp'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'InstaSave',
    backgroundColor: '#0f0f14',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never navigate the app window; open external links in the default browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  // The app needs no camera, mic, notifications, etc.
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  const dataDir = app.getPath('userData')
  const store = createStore(dataDir, join(app.getPath('downloads'), 'InstaSave'))
  const ffmpegPath = findFfmpeg(defaultSearchDirs(process.platform), process.platform)
  const ytdlp = createYtDlp(join(dataDir, 'bin'), ffmpegPath)
  const win = createWindow()
  registerIpc(win, store, ytdlp, ffmpegPath !== null)
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.on('window-all-closed', () => app.quit())
