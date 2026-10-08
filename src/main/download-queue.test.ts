import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DownloadProgress, HistoryEntry, PostInfo } from '../shared/types'
import { runDownloads } from './download-queue'
import type { YtDlp } from './ytdlp'

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/img.jpg') {
      res.writeHead(200, { 'content-length': '3' })
      res.end('IMG')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

const makePost = (): PostInfo => ({
  sourceUrl: 'https://www.instagram.com/p/SC/',
  shortcode: 'SC',
  username: 'nasa',
  caption: null,
  items: [
    { id: 'SC-1', index: 1, kind: 'image', url: `${base}/img.jpg`, previewUrl: null, width: 1, height: 1, ext: 'jpg', hdAvailable: false },
    { id: 'SC-2', index: 2, kind: 'video', url: null, previewUrl: null, width: null, height: null, ext: 'mp4', hdAvailable: false },
    { id: 'SC-3', index: 3, kind: 'image', url: `${base}/gone.jpg`, previewUrl: null, width: 1, height: 1, ext: 'jpg', hdAvailable: false },
    { id: 'SC-4', index: 4, kind: 'video', url: `${base}/img.jpg`, previewUrl: null, width: 1, height: 1, ext: 'mp4', hdAvailable: true }
  ]
})

const fakeYtDlp = (): YtDlp => ({
  status: vi.fn(),
  install: vi.fn(),
  fetchPost: vi.fn(),
  downloadItem: vi.fn(async (_u, _b, _i, out: string) => writeFileSync(out, 'VID'))
})

describe('runDownloads', () => {
  it('downloads direct files, falls back to yt-dlp for DASH videos, and reports failures', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'insta-q-')), 'nested')
    const events: DownloadProgress[] = []
    const saved: HistoryEntry[] = []
    const ytdlp = fakeYtDlp()

    const failures = await runDownloads(makePost(), ['SC-1', 'SC-2', 'SC-3'], { downloadDir: dir, browser: 'none', canMerge: false }, {
      ytdlp, emit: (p) => events.push(p), onSaved: (e) => saved.push(e), isAllowedMediaUrl: () => true
    })

    expect(failures).toBe(1)
    expect(readFileSync(join(dir, 'nasa_SC_1.jpg'), 'utf8')).toBe('IMG')
    expect(readFileSync(join(dir, 'nasa_SC_2.mp4'), 'utf8')).toBe('VID')
    expect(existsSync(join(dir, 'nasa_SC_3.jpg'))).toBe(false)
    expect(ytdlp.downloadItem).toHaveBeenCalledWith('https://www.instagram.com/p/SC/', 'none', 2, join(dir, 'nasa_SC_2.mp4'))
    expect(saved.map((s) => s.kind)).toEqual(['image', 'video'])

    const final = (id: string) => events.filter((e) => e.itemId === id).at(-1)
    expect(final('SC-1')?.status).toBe('done')
    expect(final('SC-2')?.status).toBe('done')
    expect(final('SC-3')).toMatchObject({ status: 'error', error: expect.stringMatching(/404/) })
  })

  it('uses yt-dlp for HD videos only when ffmpeg is available', async () => {
    const withFfmpeg = fakeYtDlp()
    const dir1 = mkdtempSync(join(tmpdir(), 'insta-q-'))
    await runDownloads(makePost(), ['SC-4'], { downloadDir: dir1, browser: 'none', canMerge: true }, {
      ytdlp: withFfmpeg, emit: () => {}, onSaved: () => {}, isAllowedMediaUrl: () => true
    })
    expect(withFfmpeg.downloadItem).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(dir1, 'nasa_SC_4.mp4'), 'utf8')).toBe('VID')

    const noFfmpeg = fakeYtDlp()
    const dir2 = mkdtempSync(join(tmpdir(), 'insta-q-'))
    await runDownloads(makePost(), ['SC-4'], { downloadDir: dir2, browser: 'none', canMerge: false }, {
      ytdlp: noFfmpeg, emit: () => {}, onSaved: () => {}, isAllowedMediaUrl: () => true
    })
    expect(noFfmpeg.downloadItem).not.toHaveBeenCalled()
    expect(readFileSync(join(dir2, 'nasa_SC_4.mp4'), 'utf8')).toBe('IMG')
  })

  it('only downloads the selected items', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'insta-q-'))
    const saved: HistoryEntry[] = []
    await runDownloads(makePost(), ['SC-1'], { downloadDir: dir, browser: 'none', canMerge: false }, {
      ytdlp: fakeYtDlp(), emit: () => {}, onSaved: (e) => saved.push(e), isAllowedMediaUrl: () => true
    })
    expect(saved).toHaveLength(1)
  })

  it('refuses media URLs that are not on the allowed CDN', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'insta-q-'))
    const events: DownloadProgress[] = []
    const failures = await runDownloads(makePost(), ['SC-1'], { downloadDir: dir, browser: 'none', canMerge: false }, {
      ytdlp: fakeYtDlp(), emit: (p) => events.push(p), onSaved: () => {}, isAllowedMediaUrl: () => false
    })
    expect(failures).toBe(1)
    expect(events.at(-1)).toMatchObject({ status: 'error', error: expect.stringMatching(/not allowed/i) })
  })
})
