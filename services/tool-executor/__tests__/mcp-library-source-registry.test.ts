import { MCPLibrarySourceRegistry } from '../src/services/MCPLibrarySourceRegistry'
import type { MCPLibrarySource } from '../src/types/mcp-discovery'

function makeSource(overrides: Partial<MCPLibrarySource> = {}): MCPLibrarySource {
  return {
    id: overrides.id ?? `source_${Math.random().toString(36).slice(2)}`,
    name: overrides.name ?? 'Test Source',
    transport: 'local',
    config: { command: 'cmd', args: [] },
    tier: 'curated',
    enabled: true,
    ...overrides,
  }
}

describe('MCPLibrarySourceRegistry', () => {
  let registry: MCPLibrarySourceRegistry

  beforeEach(() => {
    registry = new MCPLibrarySourceRegistry()
  })

  it('initializes with the default curated source', () => {
    const ids = registry.allSources().map((s) => s.id)
    expect(ids).toContain('stage7-curated')
  })

  it('enabledSources returns only enabled sources', () => {
    const disabled = makeSource({ id: 'disabled-src', enabled: false })
    registry.register(disabled)
    const enabled = registry.enabledSources()
    expect(enabled.find((s) => s.id === disabled.id)).toBeUndefined()
    expect(registry.allSources().find((s) => s.id === disabled.id)).toBe(disabled)
  })

  it('get returns a source by id', () => {
    const src = makeSource({ id: 'get-me' })
    registry.register(src)
    expect(registry.get('get-me')).toEqual(src)
    expect(registry.get('nope')).toBeUndefined()
  })

  it('sourcesForTier filters by tier', () => {
    const curated = makeSource({ id: 'c1', tier: 'curated' })
    const vetted = makeSource({ id: 'v1', tier: 'vetted_third_party' })
    registry.register(curated)
    registry.register(vetted)
    expect(registry.sourcesForTier('curated').map((s) => s.id)).toContain('c1')
    expect(registry.sourcesForTier('vetted_third_party').map((s) => s.id)).toContain('v1')
    expect(registry.sourcesForTier('curated').map((s) => s.id)).not.toContain('v1')
  })

  it('register throws on duplicate id', () => {
    const src = makeSource({ id: 'dup' })
    registry.register(src)
    expect(() => registry.register(makeSource({ id: 'dup' }))).toThrow("already registered")
  })

  it('unregister removes a source', () => {
    const src = makeSource({ id: 'unreg' })
    registry.register(src)
    expect(registry.unregister('unreg')).toBe(true)
    expect(registry.get('unreg')).toBeUndefined()
    expect(registry.unregister('unreg')).toBe(false)
  })

  it('isEnabled reports enabled state', () => {
    const on = makeSource({ id: 'on', enabled: true })
    const off = makeSource({ id: 'off', enabled: false })
    registry.register(on)
    registry.register(off)
    expect(registry.isEnabled('on')).toBe(true)
    expect(registry.isEnabled('off')).toBe(false)
    expect(registry.isEnabled('missing')).toBe(false)
  })
})
