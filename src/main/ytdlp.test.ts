import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createYtDlp } from './ytdlp'

const fakeBinDir = (script: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ytbin-'))
  const bin = join(dir, 'yt-dlp')
  writeFileSync(bin, `#!/bin/sh\n${script}\n`)
  chmodSync(bin, 0o755)
  return dir
}

describe.skipIf(process.platform === 'win32')('createYtDlp.status', () => {
  it('reports not installed when the binary is missing', async () => {
    const status = await createYtDlp(mkdtempSync(join(tmpdir(), 'ytbin-')), null).status()
    expect(status).toEqual({ installed: false, version: null, ffmpegPath: null })
  })

  it('reports the version from the binary', async () => {
    const status = await createYtDlp(fakeBinDir('echo 2026.08.19'), '/ff').status()
    expect(status).toEqual({ installed: true, version: '2026.08.19', ffmpegPath: '/ff' })
  })

  it('still reports installed when the version check fails (e.g. slow first run)', async () => {
    const status = await createYtDlp(fakeBinDir('exit 1'), null).status()
    expect(status).toEqual({ installed: true, version: null, ffmpegPath: null })
  })
})

describe.skipIf(process.platform === 'win32')('createYtDlp.fetchPost', () => {
  it('parses JSON output from the binary', async () => {
    const json = JSON.stringify({ id: 'X', channel: 'nasa', thumbnails: [{ url: 'https://cdn/a.jpg', width: 1080 }] })
    const yt = createYtDlp(fakeBinDir(`echo '${json}'`), null)
    const post = await yt.fetchPost('https://www.instagram.com/p/X/', 'X', 'none')
    expect(post.items[0]).toMatchObject({ kind: 'image', url: 'https://cdn/a.jpg' })
  })

  it('turns yt-dlp errors into friendly messages', async () => {
    const yt = createYtDlp(fakeBinDir('echo "ERROR: HTTP Error 429: Too Many Requests" >&2; exit 1'), null)
    await expect(yt.fetchPost('https://www.instagram.com/p/X/', 'X', 'none')).rejects.toThrow(/too many requests/i)
  })

  it('reports posts with no media', async () => {
    const yt = createYtDlp(fakeBinDir(`echo '{"id":"X"}'`), null)
    await expect(yt.fetchPost('https://www.instagram.com/p/X/', 'X', 'none')).rejects.toThrow(/no photos or videos/i)
  })
})
