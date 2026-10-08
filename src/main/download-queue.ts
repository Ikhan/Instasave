import { mkdir } from 'node:fs/promises'
import type { BrowserName, DownloadProgress, HistoryEntry, MediaItem, PostInfo } from '../shared/types'
import { downloadToFile } from './download'
import { buildFileName, uniquePath } from './files'
import type { YtDlp } from './ytdlp'

export interface QueueDeps {
  readonly ytdlp: YtDlp
  readonly emit: (p: DownloadProgress) => void
  readonly onSaved: (entry: HistoryEntry) => void
  /** Media URLs come from yt-dlp's JSON (untrusted); only hosts passing this check are fetched. */
  readonly isAllowedMediaUrl: (url: string) => boolean
}

const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024

export interface QueueOptions {
  readonly downloadDir: string
  readonly browser: BrowserName
  /** Whether ffmpeg is available so yt-dlp can merge separate HD video/audio streams. */
  readonly canMerge: boolean
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Unexpected error')

async function downloadOne(post: PostInfo, item: MediaItem, opts: QueueOptions, deps: QueueDeps): Promise<void> {
  deps.emit({ itemId: item.id, status: 'downloading', fraction: 0 })
  const outPath = uniquePath(opts.downloadDir, buildFileName(post.username, post.shortcode, item.index, item.ext))

  const useYtDlp = item.url === null || (item.kind === 'video' && item.hdAvailable && opts.canMerge)
  if (!useYtDlp && item.url) {
    await downloadToFile(
      item.url,
      outPath,
      (fraction) => deps.emit({ itemId: item.id, status: 'downloading', fraction }),
      { isAllowed: deps.isAllowedMediaUrl, maxBytes: MAX_MEDIA_BYTES }
    )
  } else {
    // HD or DASH-only video: let yt-dlp fetch and merge the separate streams.
    deps.emit({ itemId: item.id, status: 'downloading', fraction: null })
    await deps.ytdlp.downloadItem(post.sourceUrl, opts.browser, item.index, outPath)
  }

  deps.emit({ itemId: item.id, status: 'done', fraction: 1, filePath: outPath })
  deps.onSaved({
    id: `${item.id}-${Date.now()}`,
    shortcode: post.shortcode,
    username: post.username,
    kind: item.kind,
    filePath: outPath,
    downloadedAt: Date.now()
  })
}

/** Downloads the selected items one at a time (gentle on Instagram's rate limits). Returns failure count. */
export async function runDownloads(
  post: PostInfo,
  itemIds: readonly string[],
  opts: QueueOptions,
  deps: QueueDeps
): Promise<number> {
  const wanted = new Set(itemIds)
  const items = post.items.filter((i) => wanted.has(i.id))
  items.forEach((i) => deps.emit({ itemId: i.id, status: 'queued', fraction: 0 }))
  await mkdir(opts.downloadDir, { recursive: true })

  let failures = 0
  for (const item of items) {
    try {
      await downloadOne(post, item, opts, deps)
    } catch (e: unknown) {
      failures += 1
      deps.emit({ itemId: item.id, status: 'error', fraction: null, error: errorMessage(e) })
    }
  }
  return failures
}
