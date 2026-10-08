import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserName, HistoryEntry, Settings } from '../shared/types'

export const MAX_HISTORY = 200
export const BROWSERS: readonly BrowserName[] = ['none', 'chrome', 'safari', 'firefox', 'edge', 'brave']

export interface Store {
  getSettings(): Settings
  updateSettings(patch: Partial<Settings>): Settings
  getHistory(): readonly HistoryEntry[]
  addHistory(entries: readonly HistoryEntry[]): readonly HistoryEntry[]
  clearHistory(): readonly HistoryEntry[]
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** Atomic write: write to a temp file then rename, so a crash never leaves half a file. */
function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}

function sanitizeSettings(raw: unknown, defaults: Settings): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const dir = obj.downloadDir
  const browser = obj.cookiesBrowser
  return {
    downloadDir: typeof dir === 'string' && dir.length > 0 ? dir : defaults.downloadDir,
    cookiesBrowser: BROWSERS.includes(browser as BrowserName) ? (browser as BrowserName) : defaults.cookiesBrowser
  }
}

function isHistoryEntry(v: unknown): v is HistoryEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.filePath === 'string' && typeof e.downloadedAt === 'number'
}

/** JSON-file backed store for settings and download history, kept in the app's user-data folder. */
export function createStore(dataDir: string, defaultDownloadDir: string): Store {
  mkdirSync(dataDir, { recursive: true })
  const settingsPath = join(dataDir, 'settings.json')
  const historyPath = join(dataDir, 'history.json')
  const defaults: Settings = { downloadDir: defaultDownloadDir, cookiesBrowser: 'none' }

  let settings = sanitizeSettings(readJson(settingsPath), defaults)
  const rawHistory = readJson(historyPath)
  let history: readonly HistoryEntry[] = Array.isArray(rawHistory) ? rawHistory.filter(isHistoryEntry) : []

  const saveHistory = (next: readonly HistoryEntry[]): readonly HistoryEntry[] => {
    history = next
    writeJson(historyPath, history)
    return history
  }

  return {
    getSettings: () => settings,
    updateSettings: (patch) => {
      settings = sanitizeSettings({ ...settings, ...patch }, settings)
      writeJson(settingsPath, settings)
      return settings
    },
    getHistory: () => history,
    addHistory: (entries) => saveHistory([...entries, ...history].slice(0, MAX_HISTORY)),
    clearHistory: () => saveHistory([])
  }
}
