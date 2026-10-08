import { describe, expect, it } from 'vitest'
import { hasHigherQualityStreams, parseYtDlpJson, pickBestThumbnail, pickBestVideoUrl } from './parse'

const thumbs = [
  { url: 'https://cdn/small.jpg', width: 150, height: 150 },
  { url: 'https://cdn/large.jpg', width: 1080, height: 1350 }
]

const videoEntry = {
  id: 'VID1',
  formats: [
    { format_id: 'dash-1', url: 'https://cdn/dash.mp4', height: 1920, ext: 'mp4' },
    { format_id: '101', url: 'https://cdn/low.mp4', width: 360, height: 640, ext: 'mp4' },
    { format_id: '102', url: 'https://cdn/high.mp4', width: 720, height: 1280, ext: 'mp4' }
  ],
  thumbnails: thumbs
}

describe('pickBestVideoUrl', () => {
  it('prefers the tallest progressive (non-DASH) format', () => {
    expect(pickBestVideoUrl(videoEntry.formats)).toEqual({
      url: 'https://cdn/high.mp4', width: 720, height: 1280
    })
  })

  it('returns null when only DASH formats exist', () => {
    expect(pickBestVideoUrl([{ format_id: 'dash-v', url: 'https://cdn/v.mp4' }])).toBeNull()
  })
})

describe('hasHigherQualityStreams', () => {
  it('is true when a DASH stream is taller than the best progressive one', () => {
    expect(hasHigherQualityStreams(videoEntry.formats)).toBe(true)
  })
  it('is false when progressive is already the best', () => {
    expect(hasHigherQualityStreams(videoEntry.formats.slice(1))).toBe(false)
  })
})

describe('pickBestThumbnail', () => {
  it('picks the widest thumbnail', () => {
    expect(pickBestThumbnail([thumbs[1], thumbs[0]])?.url).toBe('https://cdn/large.jpg')
  })

  it('returns null for missing thumbnails', () => {
    expect(pickBestThumbnail(undefined)).toBeNull()
  })
})

describe('parseYtDlpJson', () => {
  it('parses a single video post', () => {
    const post = parseYtDlpJson({ ...videoEntry, channel: 'nasa', description: 'hi' }, 'https://u', 'SC')
    expect(post.username).toBe('nasa')
    expect(post.caption).toBe('hi')
    expect(post.items).toHaveLength(1)
    expect(post.items[0]).toMatchObject({
      kind: 'video', url: 'https://cdn/high.mp4', previewUrl: 'https://cdn/large.jpg', ext: 'mp4', index: 1, hdAvailable: true
    })
  })

  it('parses an image post (no formats) using the largest thumbnail', () => {
    const post = parseYtDlpJson({ id: 'IMG', formats: [], thumbnails: thumbs }, 'https://u', 'SC')
    expect(post.items[0]).toMatchObject({
      kind: 'image', url: 'https://cdn/large.jpg', width: 1080, height: 1350, ext: 'jpg', hdAvailable: false
    })
  })

  it('parses a mixed carousel', () => {
    const post = parseYtDlpJson({
      _type: 'playlist',
      channel: 'nasa',
      entries: [videoEntry, { id: 'IMG', thumbnails: thumbs }]
    }, 'https://u', 'SC')
    expect(post.items.map((i) => i.kind)).toEqual(['video', 'image'])
    expect(post.items.map((i) => i.index)).toEqual([1, 2])
    expect(new Set(post.items.map((i) => i.id)).size).toBe(2)
  })

  it('marks DASH-only videos with url null', () => {
    const post = parseYtDlpJson({
      id: 'V', formats: [{ format_id: 'dash-v', url: 'https://cdn/v.mp4' }], thumbnails: thumbs
    }, 'https://u', 'SC')
    expect(post.items[0]).toMatchObject({ kind: 'video', url: null, hdAvailable: true })
  })

  it('skips entries with no usable media', () => {
    const post = parseYtDlpJson({ _type: 'playlist', entries: [{ id: 'x' }, null] }, 'https://u', 'SC')
    expect(post.items).toEqual([])
  })

  it('throws on non-object input', () => {
    expect(() => parseYtDlpJson('nope', 'https://u', 'SC')).toThrow()
  })
})
