import { describe, expect, it } from 'vitest'
import { binaryAssetName, buildDownloadArgs, buildInfoArgs, friendlyError, parseChecksum } from './ytdlp-args'

describe('buildInfoArgs', () => {
  it('builds JSON dump args without cookies', () => {
    const args = buildInfoArgs('https://www.instagram.com/p/X/', 'none')
    expect(args).toContain('-J')
    expect(args).toContain('--ignore-no-formats-error')
    expect(args).not.toContain('--cookies-from-browser')
    expect(args.at(-1)).toBe('https://www.instagram.com/p/X/')
    expect(args.at(-2)).toBe('--')
    expect(args).toContain('--ignore-config')
    expect(args).toContain('--no-exec')
  })

  it('adds browser cookies when configured', () => {
    const args = buildInfoArgs('https://www.instagram.com/p/X/', 'chrome')
    const i = args.indexOf('--cookies-from-browser')
    expect(args[i + 1]).toBe('chrome')
  })
})

describe('buildDownloadArgs', () => {
  it('selects the carousel item and output path', () => {
    const args = buildDownloadArgs('https://www.instagram.com/p/X/', 'none', 3, '/tmp/out.mp4')
    expect(args[args.indexOf('--playlist-items') + 1]).toBe('3')
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/out.mp4')
    expect(args).toContain('--merge-output-format')
    expect(args).not.toContain('--ffmpeg-location')
  })

  it('escapes % so the output path is not treated as a template', () => {
    const args = buildDownloadArgs('https://www.instagram.com/p/X/', 'none', 1, '/tmp/100%(id)s/o.mp4')
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/100%%(id)s/o.mp4')
  })

  it('passes the ffmpeg location when known', () => {
    const args = buildDownloadArgs('https://www.instagram.com/p/X/', 'none', 1, '/o.mp4', '/opt/homebrew/bin/ffmpeg')
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe('/opt/homebrew/bin/ffmpeg')
  })
})

describe('binaryAssetName', () => {
  it('maps platforms to release assets', () => {
    expect(binaryAssetName('darwin')).toBe('yt-dlp_macos')
    expect(binaryAssetName('win32')).toBe('yt-dlp.exe')
    expect(binaryAssetName('linux')).toBe('yt-dlp_linux')
  })
})

describe('friendlyError', () => {
  it.each([
    ['ERROR: login required to access this', /logged in/i],
    ['ERROR: Instagram sent an empty media response', /private|log in/i],
    ['curl: (6) Could not resolve host: www.instagram.com', /internet/i],
    ['HTTP Error 429: Too Many Requests', /too many/i],
    ['ERROR: something odd', /something odd/]
  ])('maps %s', (stderr, expected) => {
    expect(friendlyError(stderr)).toMatch(expected)
  })
})

describe('parseChecksum', () => {
  const sums = 'aaa111  yt-dlp\n0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202  yt-dlp_macos\nbbb  yt-dlp_macos.zip\n'
  it('finds the exact asset hash', () => {
    expect(parseChecksum(sums, 'yt-dlp_macos')).toBe('0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202')
  })
  it('returns null when the asset or a valid hash is missing', () => {
    expect(parseChecksum(sums, 'yt-dlp.exe')).toBeNull()
    expect(parseChecksum(sums, 'yt-dlp')).toBeNull()
  })
})
