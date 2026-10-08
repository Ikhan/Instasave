import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '../shared/types'
import { createStore, MAX_HISTORY } from './store'

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'insta-store-'))

const entry = (id: string): HistoryEntry => ({
  id, shortcode: 'S', username: 'u', kind: 'image', filePath: `/x/${id}.jpg`, downloadedAt: 1
})

describe('store', () => {
  it('returns default settings when no file exists', () => {
    const store = createStore(tempDir(), '/Downloads')
    expect(store.getSettings()).toEqual({ downloadDir: '/Downloads', cookiesBrowser: 'none' })
  })

  it('persists settings updates and returns a new object', () => {
    const dir = tempDir()
    const store = createStore(dir, '/Downloads')
    const before = store.getSettings()
    const after = store.updateSettings({ cookiesBrowser: 'chrome' })
    expect(before.cookiesBrowser).toBe('none')
    expect(after.cookiesBrowser).toBe('chrome')
    expect(createStore(dir, '/Downloads').getSettings().cookiesBrowser).toBe('chrome')
  })

  it('ignores invalid settings values', () => {
    const store = createStore(tempDir(), '/Downloads')
    const result = store.updateSettings({ cookiesBrowser: 'netscape' as never, downloadDir: '' })
    expect(result).toEqual({ downloadDir: '/Downloads', cookiesBrowser: 'none' })
  })

  it('recovers from a corrupted file', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'settings.json'), '{not json')
    expect(createStore(dir, '/D').getSettings().downloadDir).toBe('/D')
  })

  it('prepends history entries, caps the list and can clear', () => {
    const dir = tempDir()
    const store = createStore(dir, '/D')
    store.addHistory([entry('a')])
    const list = store.addHistory([entry('b')])
    expect(list.map((e) => e.id)).toEqual(['b', 'a'])
    expect(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'))).toHaveLength(2)

    const many = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => entry(`n${i}`))
    expect(store.addHistory(many)).toHaveLength(MAX_HISTORY)
    expect(store.clearHistory()).toEqual([])
    expect(store.getHistory()).toEqual([])
  })
})
