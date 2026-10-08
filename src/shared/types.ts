export type MediaKind = 'image' | 'video'

export interface MediaItem {
  readonly id: string
  readonly index: number
  readonly kind: MediaKind
  /** Direct file URL, or null when only DASH streams exist (needs yt-dlp to merge). */
  readonly url: string | null
  readonly previewUrl: string | null
  readonly width: number | null
  readonly height: number | null
  readonly ext: string
  /** True when separate higher-resolution video/audio streams exist (needs ffmpeg to merge). */
  readonly hdAvailable: boolean
}

export interface PostInfo {
  readonly sourceUrl: string
  readonly shortcode: string
  readonly username: string | null
  readonly caption: string | null
  readonly items: readonly MediaItem[]
}

export type BrowserName = 'none' | 'chrome' | 'safari' | 'firefox' | 'edge' | 'brave'

export interface Settings {
  readonly downloadDir: string
  readonly cookiesBrowser: BrowserName
}

export interface HistoryEntry {
  readonly id: string
  readonly shortcode: string
  readonly username: string | null
  readonly kind: MediaKind
  readonly filePath: string
  readonly downloadedAt: number
}

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error'

export interface DownloadProgress {
  readonly itemId: string
  readonly status: DownloadStatus
  /** 0..1, or null when total size is unknown. */
  readonly fraction: number | null
  readonly filePath?: string
  readonly error?: string
}

export interface Result<T> {
  readonly ok: boolean
  readonly data: T | null
  readonly error: string | null
}

export interface ToolStatus {
  readonly installed: boolean
  readonly version: string | null
  readonly ffmpegPath: string | null
}

export interface InstaApi {
  fetchPost(url: string): Promise<Result<PostInfo>>
  downloadItems(post: PostInfo, itemIds: readonly string[]): Promise<Result<null>>
  onProgress(listener: (p: DownloadProgress) => void): () => void
  getPreview(url: string): Promise<Result<string>>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseDownloadDir(): Promise<Settings>
  getHistory(): Promise<readonly HistoryEntry[]>
  clearHistory(): Promise<readonly HistoryEntry[]>
  revealFile(filePath: string): Promise<void>
  toolStatus(): Promise<ToolStatus>
  installTool(): Promise<Result<ToolStatus>>
}
