import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { PostInfo, Result, Settings } from '../shared/types'
import { runDownloads } from './download-queue'
import { fetchPreview, isInstagramCdnUrl } from './preview'
import type { Store } from './store'
import { parseInstagramUrl } from './url'
import type { YtDlp } from './ytdlp'

const ok = <T>(data: T): Result<T> => ({ ok: true, data, error: null })
const fail = <T>(e: unknown): Result<T> => ({
  ok: false, data: null, error: e instanceof Error ? e.message : 'Something went wrong.'
})

/** Posts fetched in this session, keyed by shortcode. Downloads only use these, never renderer-supplied URLs. */
const fetchedPosts = new Map<string, PostInfo>()
const MAX_CACHED_POSTS = 20
let downloadsRunning = false

export function registerIpc(win: BrowserWindow, store: Store, ytdlp: YtDlp, canMerge: boolean): void {
  ipcMain.handle('post:fetch', async (_e, raw: unknown) => {
    const parsed = parseInstagramUrl(typeof raw === 'string' ? raw : '')
    if (!parsed.ok || !parsed.data) return parsed
    try {
      const post = await ytdlp.fetchPost(parsed.data.url, parsed.data.shortcode, store.getSettings().cookiesBrowser)
      fetchedPosts.delete(post.shortcode)
      fetchedPosts.set(post.shortcode, post)
      if (fetchedPosts.size > MAX_CACHED_POSTS) fetchedPosts.delete(fetchedPosts.keys().next().value as string)
      return ok(post)
    } catch (e: unknown) {
      return fail(e)
    }
  })

  ipcMain.handle('post:download', async (_e, shortcode: unknown, itemIds: unknown) => {
    const post = typeof shortcode === 'string' ? fetchedPosts.get(shortcode) : undefined
    if (!post) return fail(new Error('Please fetch the post again before downloading.'))
    if (!Array.isArray(itemIds) || !itemIds.every((i) => typeof i === 'string')) {
      return fail(new Error('Invalid selection.'))
    }
    if (downloadsRunning) return fail(new Error('A download is already in progress.'))

    downloadsRunning = true
    try {
      const { downloadDir, cookiesBrowser } = store.getSettings()
      const failures = await runDownloads(post, itemIds, { downloadDir, browser: cookiesBrowser, canMerge }, {
        ytdlp,
        emit: (p) => { if (!win.isDestroyed()) win.webContents.send('download:progress', p) },
        onSaved: (entry) => store.addHistory([entry]),
        isAllowedMediaUrl: isInstagramCdnUrl
      })
      return failures === 0 ? ok(null) : fail(new Error(`${failures} item(s) failed to download.`))
    } catch (e: unknown) {
      return fail(e)
    } finally {
      downloadsRunning = false
    }
  })

  ipcMain.handle('preview:get', async (_e, url: unknown) => {
    try {
      return ok(await fetchPreview(typeof url === 'string' ? url : ''))
    } catch (e: unknown) {
      return fail(e)
    }
  })

  ipcMain.handle('settings:get', () => store.getSettings())
  // The download folder can only be changed through the native folder picker below.
  ipcMain.handle('settings:update', (_e, patch: unknown) => {
    const p = typeof patch === 'object' && patch !== null ? (patch as Partial<Settings>) : {}
    return store.updateSettings({ cookiesBrowser: p.cookiesBrowser })
  })
  ipcMain.handle('settings:chooseDir', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose download folder',
      defaultPath: store.getSettings().downloadDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled || !res.filePaths[0] ? store.getSettings() : store.updateSettings({ downloadDir: res.filePaths[0] })
  })

  ipcMain.handle('history:get', () => store.getHistory())
  ipcMain.handle('history:clear', () => store.clearHistory())
  ipcMain.handle('file:reveal', (_e, filePath: unknown) => {
    // Only reveal files this app saved.
    if (store.getHistory().some((h) => h.filePath === filePath)) shell.showItemInFolder(filePath as string)
  })

  ipcMain.handle('tool:status', () => ytdlp.status())
  ipcMain.handle('tool:install', async () => {
    try {
      return ok(await ytdlp.install())
    } catch (e: unknown) {
      return fail(e)
    }
  })
}
