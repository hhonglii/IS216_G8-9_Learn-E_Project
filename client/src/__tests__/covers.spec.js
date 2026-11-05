import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { coverFor, covers, defaultCover } from '../config/covers.js'

// Vitest runs from client/; jsdom does not give import.meta.url a file: scheme.
const publicDir = resolve(process.cwd(), 'public')

describe('classroom cover registry', () => {
  it('starts with the default cover and has 13 unique ids', () => {
    expect(defaultCover).toBe(covers[0])
    expect(defaultCover.id).toBe('default')
    expect(covers).toHaveLength(13)
    expect(new Set(covers.map((cover) => cover.id)).size).toBe(13)
  })
  it('points every entry at an svg that exists in public/covers', () => {
    for (const cover of covers) {
      expect(cover.file).toBe(`/covers/${cover.id}.svg`)
      expect(existsSync(publicDir + cover.file)).toBe(true)
    }
  })
  it('looks a stored id up, falling back to the default', () => {
    expect(coverFor('coral-loop')).toBe(covers.find((cover) => cover.id === 'coral-loop'))
    expect(coverFor(undefined)).toBe(defaultCover)
    expect(coverFor('gone')).toBe(defaultCover)
  })
  it('gives every cover a label for the picker', () => {
    for (const cover of covers) {
      expect(cover.label.trim()).not.toBe('')
    }
  })
})
