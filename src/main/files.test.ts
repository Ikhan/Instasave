import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFileName, sanitizeSegment, uniquePath } from './files'

describe('sanitizeSegment', () => {
  it('strips path separators and unsafe characters', () => {
    expect(sanitizeSegment('../evil/na:me*?')).toBe('evil_na_me')
  })
  it('falls back for empty values', () => {
    expect(sanitizeSegment('')).toBe('instagram')
    expect(sanitizeSegment(null)).toBe('instagram')
  })
})

describe('buildFileName', () => {
  it('combines username, shortcode and index', () => {
    expect(buildFileName('nasa', 'ABC', 2, 'mp4')).toBe('nasa_ABC_2.mp4')
  })
  it('sanitizes the extension', () => {
    expect(buildFileName('u', 'S', 1, '../x')).toBe('u_S_1.bin')
  })
})

describe('uniquePath', () => {
  it('returns the original path when free', () => {
    const dir = mkdtempSync(join(tmpdir(), 'insta-'))
    expect(uniquePath(dir, 'a.jpg')).toBe(join(dir, 'a.jpg'))
  })
  it('appends a counter when the file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'insta-'))
    writeFileSync(join(dir, 'a.jpg'), '')
    writeFileSync(join(dir, 'a (1).jpg'), '')
    expect(uniquePath(dir, 'a.jpg')).toBe(join(dir, 'a (2).jpg'))
  })
})
