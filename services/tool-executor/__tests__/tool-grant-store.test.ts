import fs from 'fs'
import path from 'path'
import os from 'os'
import { ToolGrantStore } from '../src/services/ToolGrantStore'
import type { ToolPermissionGrant, ToolPermissionDenial, PermissionScope } from '../src/types/mcp-discovery'

const TEST_DIR = path.join(os.tmpdir(), `stage7-grants-test-${process.pid}-${Math.random().toString(36).slice(2)}`)

beforeAll(() => {
  process.env.TOOL_GRANT_STORE_DIR = TEST_DIR
  process.env.TOOL_DENIAL_STORE_DIR = TEST_DIR
})

afterAll(() => {
  delete process.env.TOOL_GRANT_STORE_DIR
  delete process.env.TOOL_DENIAL_STORE_DIR
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

function makeGrant(overrides: Partial<ToolPermissionGrant> = {}): ToolPermissionGrant {
  return {
    id: overrides.id ?? `grant_${Math.random().toString(36).slice(2)}`,
    toolId: 'tool_1',
    toolName: 'Test Tool',
    sourceId: 'src_1',
    tier: 'curated',
    sideEffectClass: 'read_only',
    dataClasses: [],
    credentials: { needed: false, keys: [] },
    scope: 'task',
    grantedBy: 'user_1',
    grantedAt: new Date(),
    definitionHash: 'def_abc',
    revoked: false,
    callCount: 0,
    ...overrides,
  }
}

function makeDenial(overrides: Partial<ToolPermissionDenial> = {}): ToolPermissionDenial {
  return {
    id: `denial_${Math.random().toString(36).slice(2)}`,
    toolId: 'tool_1',
    toolName: 'Test Tool',
    sourceId: 'src_1',
    neededCapability: 'do_thing',
    deniedBy: 'user_1',
    deniedAt: new Date(),
    ...overrides,
  }
}

describe('ToolGrantStore', () => {
  let store: ToolGrantStore

  beforeEach(() => {
    store = new ToolGrantStore()
    // Clear the dir so each test starts fresh
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  it('saveGrant then getGrant round-trips', () => {
    const grant = makeGrant()
    store.saveGrant(grant)
    expect(store.getGrant(grant.id)).toEqual(grant)
  })

  it('listGrants returns all grants', () => {
    const g1 = makeGrant({ id: 'g1' })
    const g2 = makeGrant({ id: 'g2' })
    store.saveGrant(g1)
    store.saveGrant(g2)
    expect(store.listGrants().map((g) => g.id)).toEqual(expect.arrayContaining(['g1', 'g2']))
  })

  it('activeGrants excludes revoked and expired', () => {
    const active = makeGrant({ id: 'active' })
    const revoked = makeGrant({ id: 'revoked', revoked: true })
    const expired = makeGrant({
      id: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    })
    store.saveGrant(active)
    store.saveGrant(revoked)
    store.saveGrant(expired)
    const ids = store.activeGrants().map((g) => g.id)
    expect(ids).toContain('active')
    expect(ids).not.toContain('revoked')
    expect(ids).not.toContain('expired')
  })

  it('findActiveGrant matches tool id and scope', () => {
    const g1 = makeGrant({ id: 'a', toolId: 't1', scope: 'task' })
    const g2 = makeGrant({ id: 'b', toolId: 't1', scope: 'assistant' })
    store.saveGrant(g1)
    store.saveGrant(g2)
    expect(store.findActiveGrant('t1', 'task')).toEqual(g1)
    expect(store.findActiveGrant('t1', 'assistant')).toEqual(g2)
    expect(store.findActiveGrant('t1', 'all_agents')).toBeUndefined()
  })

  it('grantsForTool returns grants for a tool', () => {
    store.saveGrant(makeGrant({ id: 'x', toolId: 't1' }))
    store.saveGrant(makeGrant({ id: 'y', toolId: 't2' }))
    expect(store.grantsForTool('t1').map((g) => g.id)).toEqual(['x'])
  })

  it('grantsByScope filters active grants by scope', () => {
    store.saveGrant(makeGrant({ id: 'a', scope: 'task' }))
    store.saveGrant(makeGrant({ id: 'b', scope: 'assistant' }))
    expect(store.grantsByScope('task').map((g) => g.id)).toEqual(['a'])
    expect(store.grantsByScope('assistant').map((g) => g.id)).toEqual(['b'])
  })

  it('revokeGrant marks revoked and returns true', () => {
    const grant = makeGrant({ id: 'rev' })
    store.saveGrant(grant)
    expect(store.revokeGrant('rev', 'admin')).toBe(true)
    expect(store.getGrant('rev')?.revoked).toBe(true)
    expect(store.getGrant('rev')?.revokedBy).toBe('admin')
  })

  it('revokeGrant returns false for unknown id', () => {
    expect(store.revokeGrant('nope', 'admin')).toBe(false)
  })

  it('recordUsage bumps callCount and sets lastUsedAt', () => {
    const grant = makeGrant({ id: 'use' })
    store.saveGrant(grant)
    store.recordUsage('use')
    const g = store.getGrant('use')
    expect(g?.callCount).toBe(1)
    expect(g?.lastUsedAt).toBeDefined()
    store.recordUsage('use')
    expect(store.getGrant('use')?.callCount).toBe(2)
  })

  it('saveDenial then findDenial round-trips', () => {
    const denial = makeDenial({ id: 'd1', neededCapability: 'cap_a' })
    store.saveDenial(denial)
    expect(store.findDenial('tool_1', 'cap_a')).toEqual(denial)
    expect(store.findDenial('tool_1', 'cap_b')).toBeUndefined()
  })

  it('listDenials returns all denials', () => {
    store.saveDenial(makeDenial({ id: 'd1' }))
    store.saveDenial(makeDenial({ id: 'd2' }))
    expect(store.listDenials().map((d) => d.id)).toEqual(expect.arrayContaining(['d1', 'd2']))
  })
})
