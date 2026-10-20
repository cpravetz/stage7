import { Tool, SchemaRecord } from '../src/types'
import type {
  MCPToolCandidate,
  ToolPermissionGrant,
  DataClass,
  SideEffectClass,
  MCPTrustTier,
} from '../src/types/mcp-discovery'
import {
  setToolRegistry,
  getToolRegistry,
  integrateGrantedTool,
  suspendIntegratedTool,
  findIntegratedToolByGrant,
  listIntegratedTools,
  type IntegratableRegistry,
} from '../src/services/ToolIntegrator'

const TEST_DIR = '/tmp/stage7-integrator-test'
beforeAll(() => {
  process.env.TOOL_GRANT_STORE_DIR = TEST_DIR
  process.env.TOOL_DENIAL_STORE_DIR = TEST_DIR
  process.env.TOOL_AUDIT_LOG_DIR = '/tmp/stage7-integrator-audit-test'
})
afterAll(() => {
  delete process.env.TOOL_GRANT_STORE_DIR
  delete process.env.TOOL_DENIAL_STORE_DIR
  delete process.env.TOOL_AUDIT_LOG_DIR
  // reset injected registry
  setToolRegistry(undefined)
})

function makeGrant(overrides: Partial<ToolPermissionGrant> = {}): ToolPermissionGrant {
  return {
    id: `grant_${Math.random().toString(36).slice(2)}`,
    toolId: 'tool_1',
    toolName: 'Test Tool',
    sourceId: 'stage7-curated',
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

function makeCandidate(overrides: Partial<MCPToolCandidate> = {}): MCPToolCandidate {
  return {
    id: `mcp_${Math.random().toString(36).slice(2)}`,
    name: 'MCP Tool',
    description: 'desc',
    sourceId: 'stage7-curated',
    sourceName: 'Stage7 Curated MCP Library',
    transport: 'local',
    tier: 'curated',
    sideEffectClass: 'read_only',
    dataClasses: [],
    credentials: { needed: false, keys: [] },
    inputSchema: { type: 'object', properties: {} },
    definitionHash: 'def_abc',
    preApproved: true,
    neededCapability: 'cap',
    ...overrides,
  }
}

function makeRegistry(): IntegratableRegistry {
  const map = new Map<string, Tool>()
  return {
    get: (id: string) => map.get(id),
    registerOrReplace: (tool: Tool) => { map.set(tool.id, tool) },
    unregister: (id: string) => map.delete(id),
    list: () => [...map.values()],
  }
}

function toolFromGrant(grant: ToolPermissionGrant): Tool {
  return {
    id: `existing_${grant.id}`,
    name: 'Existing',
    description: 'existing tool',
    type: 'mcp',
    manifest: {},
    inputSchema: {} as SchemaRecord,
    outputSchema: {} as SchemaRecord,
    configSchema: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
    tier: 'advise',
    confirmBeforeSend: false,
  } as Tool
}

describe('ToolIntegrator', () => {
  it('setToolRegistry / getToolRegistry round-trips', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    expect(getToolRegistry()).toBe(reg)
  })

  it('integrateGrantedTool registers a normalized tool', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    const grant = makeGrant()
    const cand = makeCandidate()
    const integrated = integrateGrantedTool(grant, cand)
    expect(integrated.tool.id).toBe(`integrated_mcp_${grant.id}`)
    expect(integrated.tool.name).toBe(cand.name)
    expect(integrated.tool.tier).toBe('advise')
    expect(reg.get(integrated.tool.id)).toBe(integrated.tool)
  })

  it('integrateGrantedTool maps side-effect class to governance tier', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    const cases: Array<[SideEffectClass, 'advise' | 'aid' | 'represent']> = [
      ['read_only', 'advise'],
      ['writes_data', 'aid'],
      ['external_action', 'represent'],
    ]
    for (const [cls, tier] of cases) {
      const r = makeRegistry()
      setToolRegistry(r)
      const grant = makeGrant({ sideEffectClass: cls })
      const cand = makeCandidate({ sideEffectClass: cls })
      const integrated = integrateGrantedTool(grant, cand)
      expect(integrated.tool.tier).toBe(tier)
    }
  })

  it('integrateGrantedTool throws when registry not injected', () => {
    setToolRegistry(undefined)
    expect(() => integrateGrantedTool(makeGrant(), makeCandidate())).toThrow('not injected')
  })

  it('suspendIntegratedTool removes from registry', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    const grant = makeGrant()
    const cand = makeCandidate()
    const integrated = integrateGrantedTool(grant, cand)
    expect(reg.get(integrated.tool.id)).toBeDefined()
    expect(suspendIntegratedTool(integrated.tool.id, 'revoked')).toBe(true)
    expect(reg.get(integrated.tool.id)).toBeUndefined()
  })

  it('findIntegratedToolByGrant finds by grant id', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    const grant = makeGrant()
    const cand = makeCandidate()
    const integrated = integrateGrantedTool(grant, cand)
    expect(findIntegratedToolByGrant(grant.id)).toBe(integrated.tool)
    expect(findIntegratedToolByGrant('nope')).toBeUndefined()
  })

  it('listIntegratedTools returns only granted tools', () => {
    const reg = makeRegistry()
    setToolRegistry(reg)
    const grant = makeGrant()
    const cand = makeCandidate()
    integrateGrantedTool(grant, cand)
    reg.registerOrReplace(toolFromGrant(grant))
    const integrated = listIntegratedTools()
    expect(integrated.map((t) => t.id)).toContain(`integrated_mcp_${grant.id}`)
    expect(integrated.map((t) => t.id)).not.toContain(`existing_${grant.id}`)
  })
})
