import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findFfmpeg } from './ffmpeg'

describe('findFfmpeg', () => {
  it('finds an executable ffmpeg in the given directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-'))
    const bin = join(dir, 'ffmpeg')
    writeFileSync(bin, '#!/bin/sh\n')
    chmodSync(bin, 0o755)
    expect(findFfmpeg(['/nonexistent', dir], 'darwin')).toBe(bin)
  })

  it('returns null when ffmpeg is missing', () => {
    expect(findFfmpeg([mkdtempSync(join(tmpdir(), 'ff-'))], 'darwin')).toBeNull()
  })
})
