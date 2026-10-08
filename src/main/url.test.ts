import { describe, expect, it } from 'vitest'
import { parseInstagramUrl } from './url'

describe('parseInstagramUrl', () => {
  it.each([
    ['https://www.instagram.com/p/BQ0eAlwhDrw/', 'BQ0eAlwhDrw', 'https://www.instagram.com/p/BQ0eAlwhDrw/'],
    ['https://instagram.com/reel/Chunk8-jurw', 'Chunk8-jurw', 'https://www.instagram.com/reel/Chunk8-jurw/'],
    ['instagram.com/reels/Cop84x6u7CP/?igsh=abc', 'Cop84x6u7CP', 'https://www.instagram.com/reel/Cop84x6u7CP/'],
    ['https://www.instagram.com/tv/BkfuX9UB-eK/', 'BkfuX9UB-eK', 'https://www.instagram.com/tv/BkfuX9UB-eK/'],
    ['https://www.instagram.com/someuser/p/C1_abc/', 'C1_abc', 'https://www.instagram.com/p/C1_abc/'],
    ['  https://m.instagram.com/p/ABC123/  ', 'ABC123', 'https://www.instagram.com/p/ABC123/']
  ])('accepts %s', (input, shortcode, normalized) => {
    const result = parseInstagramUrl(input)
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ shortcode, url: normalized })
  })

  it.each([
    [''],
    ['not a url'],
    ['https://example.com/p/ABC123/'],
    ['https://www.instagram.com/someuser/'],
    ['https://evil-instagram.com/p/ABC123/'],
    ['ftp://www.instagram.com/p/ABC123/']
  ])('rejects %s', (input) => {
    const result = parseInstagramUrl(input)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/instagram/i)
  })
})
