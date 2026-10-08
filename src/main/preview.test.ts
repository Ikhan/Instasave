import { describe, expect, it } from 'vitest'
import { fetchPreview, isInstagramCdnUrl } from './preview'

describe('isInstagramCdnUrl', () => {
  it.each([
    'https://instagram.fcmb8-1.fna.fbcdn.net/v/t51/x.jpg',
    'https://scontent.cdninstagram.com/v/x.jpg'
  ])('allows %s', (url) => expect(isInstagramCdnUrl(url)).toBe(true))

  it.each([
    'http://instagram.fcmb8-1.fna.fbcdn.net/x.jpg',
    'https://evilfbcdn.net/x.jpg',
    'https://fbcdn.net.evil.com/x.jpg',
    'https://127.0.0.1/x.jpg',
    'file:///etc/passwd',
    'not a url'
  ])('blocks %s', (url) => expect(isInstagramCdnUrl(url)).toBe(false))
})

describe('fetchPreview', () => {
  it('refuses non-Instagram URLs without making a request', async () => {
    await expect(fetchPreview('http://localhost:1/x')).rejects.toThrow(/not an Instagram/)
  })
})
