import { BrowserWindow, ipcMain, shell } from 'electron'
import type { ProfileProgress, Result } from '../shared/types'
import { parseUsername } from './gallery-args'
import type { GalleryDl } from './gallerydl'
import { getProfileInfo, startProfileJob, type ProfileJob } from './profile-job'
import type { Store } from './store'

const ok = <T>(data: T): Result<T> => ({ ok: true, data, error: null })
const fail = <T>(e: unknown): Result<T> => ({
  ok: false, data: null, error: e instanceof Error ? e.message : String(e)
})

let currentJob: ProfileJob | null = null
let lastProgress: ProfileProgress | null = null

/** Stops a running profile download (used on app quit so the engine isn't left running in the background). */
export function stopProfileJob(force = false): void {
  currentJob?.stop(force)
}

export function registerProfileIpc(win: BrowserWindow, store: Store, gallery: GalleryDl): void {
  ipcMain.handle('profile:engineStatus', () => gallery.status())
  ipcMain.handle('profile:installEngine', async () => {
    try {
      return ok(await gallery.install())
    } catch (e: unknown) {
      return fail(e)
    }
  })

  ipcMain.handle('profile:info', (_e, input: unknown) => {
    const parsed = parseUsername(typeof input === 'string' ? input : '')
    if (!parsed.ok || !parsed.data) return parsed
    return ok(getProfileInfo(parsed.data, store.getSettings().downloadDir))
  })

  ipcMain.handle('profile:start', (_e, input: unknown, quick: unknown) => {
    const parsed = parseUsername(typeof input === 'string' ? input : '')
    if (!parsed.ok || !parsed.data) return parsed
    if (currentJob) return fail('A profile download is already running.')
    const { downloadDir, cookiesBrowser } = store.getSettings()
    if (cookiesBrowser === 'none') {
      return fail('Profile downloads need an Instagram login. In Settings, choose the browser where you are logged in.')
    }

    const job = startProfileJob(
      { username: parsed.data, downloadDir, browser: cookiesBrowser, quick: quick === true },
      {
        command: (args) => gallery.command(args),
        emit: (p) => {
          lastProgress = p
          if (!win.isDestroyed()) win.webContents.send('profile:progress', p)
        }
      }
    )
    currentJob = job
    void job.done.finally(() => { if (currentJob === job) currentJob = null })
    return ok(null)
  })

  ipcMain.handle('profile:stop', () => stopProfileJob())
  ipcMain.handle('profile:current', () => lastProgress)

  ipcMain.handle('profile:openFolder', async (_e, username: unknown) => {
    const parsed = parseUsername(typeof username === 'string' ? username : '')
    if (!parsed.ok || !parsed.data) return
    const info = getProfileInfo(parsed.data, store.getSettings().downloadDir)
    if (info.fileCount > 0) await shell.openPath(info.folder)
  })
}
