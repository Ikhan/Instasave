import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserName, PostInfo, ToolStatus } from '../shared/types'
import { downloadToFile, readCapped, safeFetch, sha256File } from './download'
import { GITHUB_DOWNLOAD_POLICY as GITHUB_POLICY } from './github'
import { isExecutable, run } from './process'
import { parseYtDlpJson } from './parse'
import { binaryAssetName, buildDownloadArgs, buildInfoArgs, friendlyError, parseChecksum } from './ytdlp-args'

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const INFO_TIMEOUT_MS = 90_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000
const VERSION_TIMEOUT_MS = 120_000
export interface YtDlp {
  status(): Promise<ToolStatus>
  install(): Promise<ToolStatus>
  fetchPost(url: string, shortcode: string, browser: BrowserName): Promise<PostInfo>
  downloadItem(url: string, browser: BrowserName, index: number, outPath: string): Promise<void>
}

/** Manages a private copy of the standalone yt-dlp binary in the app's data folder. */
export function createYtDlp(binDir: string, ffmpegPath: string | null): YtDlp {
  const binPath = join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

  const ensureInstalled = (): void => {
    if (!isExecutable(binPath)) throw new Error('The downloader engine is not installed yet. Click "Install engine" in Settings.')
  }

  const readVersion = async (): Promise<string | null> => {
    try {
      const res = await run({ bin: binPath, args: ['--version'] }, VERSION_TIMEOUT_MS)
      return res.code === 0 ? res.stdout.trim() || null : null
    } catch {
      return null
    }
  }

  // "Installed" only depends on the file being present: the first launch of the binary can take
  // 30s+ while macOS scans it, and that must not make the app think the engine is missing.
  const status = async (): Promise<ToolStatus> => {
    if (!isExecutable(binPath)) return { installed: false, version: null, ffmpegPath }
    return { installed: true, version: await readVersion(), ffmpegPath }
  }

  const installOnce = async (): Promise<ToolStatus> => {
    await mkdir(binDir, { recursive: true })
    const asset = binaryAssetName(process.platform)
    const sumsRes = await safeFetch(`${RELEASE_BASE}/SHA2-256SUMS`, GITHUB_POLICY, 60_000)
    if (!sumsRes.ok) throw new Error('Could not download the engine checksum list. Check your internet connection.')
    const expected = parseChecksum((await readCapped(sumsRes, 1024 * 1024)).toString('utf8'), asset)
    if (!expected) throw new Error('Could not find a checksum for the engine download.')

    // Download to a temp name, verify, then swap in, so a bad download never replaces a working engine.
    const tmpPath = `${binPath}.download`
    try {
      await downloadToFile(`${RELEASE_BASE}/${asset}`, tmpPath, () => {}, GITHUB_POLICY)
      if ((await sha256File(tmpPath)) !== expected) {
        throw new Error('The engine download failed its integrity check. Please try again.')
      }
      if (process.platform !== 'win32') await chmod(tmpPath, 0o755)
      await rename(tmpPath, binPath)
    } finally {
      await rm(tmpPath, { force: true })
    }
    const version = await readVersion()
    if (!version) throw new Error('The downloader engine was downloaded but could not be started.')
    return { installed: true, version, ffmpegPath }
  }

  let inFlight: Promise<ToolStatus> | null = null
  const install = (): Promise<ToolStatus> => {
    inFlight ??= installOnce().finally(() => { inFlight = null })
    return inFlight
  }

  const fetchPost = async (url: string, shortcode: string, browser: BrowserName): Promise<PostInfo> => {
    ensureInstalled()
    const res = await run({ bin: binPath, args: buildInfoArgs(url, browser) }, INFO_TIMEOUT_MS)
    if (res.code !== 0 || !res.stdout.trim()) {
      throw new Error(friendlyError(res.stderr || 'Timed out while contacting Instagram.'))
    }
    let json: unknown
    try {
      json = JSON.parse(res.stdout)
    } catch {
      throw new Error('Received an unreadable response from the downloader engine.')
    }
    const post = parseYtDlpJson(json, url, shortcode)
    if (post.items.length === 0) throw new Error('No photos or videos were found in this post.')
    return post
  }

  const downloadItem = async (url: string, browser: BrowserName, index: number, outPath: string): Promise<void> => {
    ensureInstalled()
    const res = await run({ bin: binPath, args: buildDownloadArgs(url, browser, index, outPath, ffmpegPath) }, DOWNLOAD_TIMEOUT_MS)
    if (res.code !== 0) throw new Error(friendlyError(res.stderr))
  }

  return { status, install, fetchPost, downloadItem }
}
