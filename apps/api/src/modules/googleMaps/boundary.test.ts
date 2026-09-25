import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Structural guard for Google's terms: Google-derived data must never
// reach Postgres. The simplest way to make that hard to break is for the
// googleMaps module to have no database access at all, and for nothing
// outside it to call Google's provider directly.
const moduleDir = dirname(fileURLToPath(import.meta.url))
const srcDir = join(moduleDir, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('googleMaps module boundary', () => {
  it('has no database access anywhere in the module', () => {
    for (const file of sourceFiles(moduleDir)) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(srcDir, file)).not.toMatch(/db\/schema|db\/client|drizzle-orm|fastify\.db/)
    }
  })

  it('is the only code that imports the Google provider', () => {
    const outside = sourceFiles(srcDir).filter((f) => !f.startsWith(moduleDir))
    for (const file of outside) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(srcDir, file)).not.toMatch(/googleMaps\/provider/)
    }
  })
})
