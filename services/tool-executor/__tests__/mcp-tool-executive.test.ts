import { MCPToolExecutive } from '../src/services/MCPToolExecutive'
import {
  buildPermissionRequest,
  getPersistedPermissionDecision,
  getPermissionRequest,
  preApprove,
  decidePermission,
  findDenial,
  listActiveGrants,
  revokeGrant as revokeGrantStore,
  renderPermissionPrompt,
} from '../src/services/ToolPermissionService'
import {
  integrateGrantedTool,
  listIntegratedTools as listIntegratedToolsFn,
  suspendIntegratedTool,
} from '../src/services/ToolIntegrator'
import { mcpToolDiscovery } from '../src/services/MCPToolDiscovery'
import { toolGrantStore } from '../src/services/ToolGrantStore'
import { toolAuditLog } from '../src/services/ToolAuditLog'
import type { CapabilityResolution, MCPToolCandidate } from '../src/types/mcp-discovery'

const TEST_DIR = '/tmp/stage7-executive-test'
beforeAll(() => {
  process.env.TOOL_GRANT_STORE_DIR = TEST_DIR
  process.env.TOOL_DENIAL_STORE_DIR = TEST_DIR
  process.env.TOOL_AUDIT_LOG_DIR = '/tmp/stage7-executive-audit-test'
})
afterAll(() => {
  delete process.env.TOOL_GRANT_STORE_DIR
  delete process.env.TOOL_DENIAL_STORE_DIR
  delete process.env.TOOL_AUDIT_LOG_DIR
})

function candidate(overrides: Partial<MCPToolCandidate> = {}): MCPToolCandidate {
  return {
    id: `mcp_${Math.random().toString(36).slice(2)}`,
    name: 'Exec Tool',
    description: 'd',
    sourceId: 'stage7-curated',
    sourceName: 'Stage7 Curated MCP Library',
    transport: 'local',
    tier: 'curated',
    sideEffectClass: 'read_only',
    dataClasses: [],
    credentials: { needed: false, keys: [] },
    inputSchema: { type: 'object', properties: {} },
    definitionHash: 'def_h',
    preApproved: true,
    neededCapability: 'exec_cap',
    ...overrides,
  }
}

function clearStores() {
  ;(toolGrantStore.listGrants as jest.Mock).mockReturnValue([])
  for (const g of toolGrantStore.listGrants()) toolGrantStore.revokeGrant(g.id, 'cleanup')
}

jest.mock('../src/services/MCPToolDiscovery', () => ({
  mcpToolDiscovery: {
    discover: jest.fn(),
  },
}))

jest.mock('../src/services/ToolPermissionService', () => ({
  buildPermissionRequest: jest.fn(),
  getPersistedPermissionDecision: jest.fn(),
  getPermissionRequest: jest.fn(),
  preApprove: jest.fn(),
  decidePermission: jest.fn(),
  findDenial: jest.fn(),
  listActiveGrants: jest.fn(),
  revokeGrant: jest.fn(),
  renderPermissionPrompt: jest.fn(),
}))

jest.mock('../src/services/ToolIntegrator', () => ({
  integrateGrantedTool: jest.fn(),
  listIntegratedTools: jest.fn(),
  suspendIntegratedTool: jest.fn(),
}))

jest.mock('../src/services/ToolGrantStore', () => ({
  toolGrantStore: {
    listGrants: jest.fn(),
    revokeGrant: jest.fn(),
    getGrant: jest.fn(),
    findDenial: jest.fn(),
  },
}))

jest.mock('../src/services/ToolAuditLog', () => ({
  toolAuditLog: { record: jest.fn() },
}))

describe('MCPToolExecutive', () => {
  let executive: MCPToolExecutive

  beforeEach(() => {
    clearStores()
    executive = new MCPToolExecutive()
    jest.clearAllMocks()
    ;(listActiveGrants as jest.Mock).mockReturnValue([])
    ;(toolGrantStore.listGrants as jest.Mock).mockReturnValue([])
    ;(toolGrantStore.getGrant as jest.Mock).mockReturnValue(undefined)
    ;(toolGrantStore.revokeGrant as jest.Mock).mockReturnValue(false)
    ;(revokeGrantStore as jest.Mock).mockReturnValue(false)
    ;(mcpToolDiscovery.discover as jest.Mock).mockResolvedValue({ candidates: [], errors: [] })
    ;(preApprove as jest.Mock).mockReturnValue(undefined)
    ;(findDenial as jest.Mock).mockReturnValue(undefined)
    ;(integrateGrantedTool as jest.Mock).mockReturnValue(undefined)
    ;(suspendIntegratedTool as jest.Mock).mockReturnValue(false)
    ;(listIntegratedToolsFn as jest.Mock).mockReturnValue([])
    ;(decidePermission as jest.Mock).mockReturnValue({ decision: 'denied', reason: 'default' })
    ;(getPermissionRequest as jest.Mock).mockReturnValue(undefined)
    ;(getPersistedPermissionDecision as jest.Mock).mockReturnValue(undefined)
    ;(buildPermissionRequest as jest.Mock).mockReturnValue(undefined)
    ;(toolAuditLog.record as jest.Mock).mockReturnValue({ id: 'audit_1' })
    ;(toolGrantStore.findDenial as jest.Mock).mockReturnValue(undefined)
  })

  describe('resolveCapability', () => {
    it('returns satisfied when a registered tool matches', () => {
      executive.setRegistry({
        get: () => undefined,
        list: () => [{ id: 'exec_cap_tool', name: 'exec_cap_tool', description: 'does exec cap', manifest: {} } as any],
      })
      const res = executive.resolveCapability({ capability: 'exec_cap' })
      expect(res.satisfied).toBe(true)
      expect(res.tool).toBeDefined()
    })

    it('skips explicitly excluded broken tools and resolves an alternative', () => {
      executive.setRegistry({
        get: () => undefined,
        list: () => [
          { id: 'broken_sms', name: 'SMS via Twilio', description: 'send SMS', manifest: {} } as any,
          { id: 'sms_api', name: 'SMS provider API', description: 'provide text message delivery', manifest: {} } as any,
        ],
      })
      const res = executive.resolveCapability({
        capability: 'send a text message',
        excludeToolIds: ['broken_sms'],
      })
      expect(res.satisfied).toBe(true)
      expect(res.tool?.id).toBe('sms_api')
    })

    it('returns not satisfied with no registry', () => {
      const res = executive.resolveCapability({ capability: 'x' })
      expect(res.satisfied).toBe(false)
      expect(res.error).toBeDefined()
    })
  })

  describe('discoverAndRequestPermission', () => {
    it('pre-approves and integrates a curated tool', async () => {
      const c = candidate()
      const grant = { id: 'g1', toolId: c.id, toolName: c.name, sourceId: c.sourceId, tier: c.tier,
        sideEffectClass: c.sideEffectClass, dataClasses: [], credentials: { needed: false, keys: [] },
        scope: 'assistant', grantedBy: 'system', grantedAt: new Date(), definitionHash: c.definitionHash,
        revoked: false, callCount: 0 } as any
      const integrated = { tool: { id: 'integrated_1', name: c.name } as any, grant, egressPolicy: {} }

      ;(mcpToolDiscovery.discover as jest.Mock).mockResolvedValue({ candidates: [c], errors: [] })
      ;(preApprove as jest.Mock).mockReturnValue(grant)
      ;(integrateGrantedTool as jest.Mock).mockReturnValue(integrated)

      const res = await executive.discoverAndRequestPermission({
        capability: 'exec_cap',
        actor: 'system',
        preApproveCurated: true,
        preApprovedBy: 'system',
      })

      expect(res.satisfied).toBe(true)
      expect(res.tool).toEqual(integrated.tool)
      expect(preApprove).toHaveBeenCalledWith(c, { decidedBy: 'system' })
    })

    it('returns permissionRequest for a non-pre-approved best candidate', async () => {
      const c = candidate({ tier: 'vetted_third_party', preApproved: false })
      const request = { id: 'perm_1', candidate: c, neededCapability: 'exec_cap' } as any

      ;(mcpToolDiscovery.discover as jest.Mock).mockResolvedValue({ candidates: [c], errors: [] })
      ;(preApprove as jest.Mock).mockReturnValue(undefined)
      ;(findDenial as jest.Mock).mockReturnValue(undefined)
      ;(buildPermissionRequest as jest.Mock).mockReturnValue(request)

      const res = await executive.discoverAndRequestPermission({
        capability: 'exec_cap',
        actor: 'user_1',
        preApproveCurated: true,
      })

      expect(res.satisfied).toBe(false)
      expect(res.permissionRequest).toEqual(request)
      expect(res.candidate).toEqual(c)
    })

    it('returns error when no candidates found', async () => {
      ;(mcpToolDiscovery.discover as jest.Mock).mockResolvedValue({ candidates: [], errors: [] })
      const res = await executive.discoverAndRequestPermission({ capability: 'x', actor: 'u' })
      expect(res.satisfied).toBe(false)
      expect(res.error).toContain('No suitable MCP tool found')
    })

    it('blocks all candidates when each has a remembered denial', async () => {
      const c = candidate()
      ;(mcpToolDiscovery.discover as jest.Mock).mockResolvedValue({ candidates: [c], errors: [] })
      ;(findDenial as jest.Mock).mockReturnValue({ id: 'd1', toolId: c.id, neededCapability: 'exec_cap' })
      const res = await executive.discoverAndRequestPermission({ capability: 'exec_cap', actor: 'u' })
      expect(res.satisfied).toBe(false)
      expect(res.error).toContain('previously denied')
    })
  })

  describe('decidePermission', () => {
    it('grants and integrates on granted decision', async () => {
      const request = { id: 'perm_1', candidate: candidate() } as any
      const grant = { id: 'g1', toolId: 't1', grantedBy: 'u' } as any
      const integrated = { tool: { id: 'int_1' } as any, grant, egressPolicy: {} }

      ;(getPermissionRequest as jest.Mock).mockReturnValue(request)
      ;(decidePermission as jest.Mock).mockReturnValue({ decision: 'granted', grant })
      ;(integrateGrantedTool as jest.Mock).mockReturnValue(integrated)

      const res = await executive.decidePermission({
        requestId: 'perm_1', decision: 'granted', decidedBy: 'u',
      })

      expect(res.satisfied).toBe(true)
      expect(res.tool).toEqual(integrated.tool)
    })

    it('returns denied without integrating on denied decision', async () => {
      const request = { id: 'perm_1', candidate: candidate() } as any
      ;(getPermissionRequest as jest.Mock).mockReturnValue(request)
      ;(decidePermission as jest.Mock).mockReturnValue({ decision: 'denied', reason: 'user said no' })

      const res = await executive.decidePermission({
        requestId: 'perm_1', decision: 'denied', decidedBy: 'u',
      })

      expect(res.satisfied).toBe(false)
      expect(res.error).toBe('user said no')
      expect(integrateGrantedTool).not.toHaveBeenCalled()
    })

    it('replays a persisted grant decision idempotently after a service restart', async () => {
      const request = { id: 'perm_1', candidate: candidate() } as any
      const grant = { id: 'g1', toolId: request.candidate.id, scope: 'task' } as any
      const integrated = { tool: { id: request.candidate.id } as any, grant, egressPolicy: {} }
      ;(getPersistedPermissionDecision as jest.Mock).mockReturnValue({
        requestId: 'perm_1',
        decision: 'granted',
        request,
        grant,
      })
      ;(integrateGrantedTool as jest.Mock).mockReturnValue(integrated)

      const res = await executive.decidePermission({
        requestId: 'perm_1', decision: 'granted', decidedBy: 'u',
      })

      expect(res.satisfied).toBe(true)
      expect(res.tool).toEqual(integrated.tool)
      expect(integrateGrantedTool).toHaveBeenCalledWith(grant, request.candidate)
    })

    it('returns error when request not found', async () => {
      ;(getPermissionRequest as jest.Mock).mockReturnValue(undefined)
      const res = await executive.decidePermission({
        requestId: 'nope', decision: 'granted', decidedBy: 'u',
      })
      expect(res.satisfied).toBe(false)
      expect(res.error).toContain('not found')
    })
  })

  describe('revokeGrant', () => {
    it('revokes grant and suspends integrated tool', () => {
      const grant = { id: 'g1', toolId: 't1', toolName: 'T' } as any
      ;(toolGrantStore.getGrant as jest.Mock).mockReturnValue(grant)
      ;(listIntegratedToolsFn as jest.Mock).mockReturnValue([
        { id: 'int_1', manifest: { grantId: 'g1' } } as any,
      ])
      ;(suspendIntegratedTool as jest.Mock).mockReturnValue(true)
      ;(toolGrantStore.revokeGrant as jest.Mock).mockReturnValue(true)
      ;(revokeGrantStore as jest.Mock).mockReturnValue(true)

      const res = executive.revokeGrant('g1', 'admin')

      expect(res).toBe(true)
      expect(suspendIntegratedTool).toHaveBeenCalledWith('int_1', 'Revoked by admin')
    })
  })

  describe('listGrantedTools / listIntegratedTools', () => {
    it('delegates to the store / integrator fns', () => {
      ;(listActiveGrants as jest.Mock).mockReturnValue([{ id: 'g1' } as any])
      expect(executive.listGrantedTools()).toEqual([{ id: 'g1' }])
      ;(listIntegratedToolsFn as jest.Mock).mockReturnValue([{ id: 't1' } as any])
      expect(executive.listIntegratedTools()).toEqual([{ id: 't1' }])
    })
  })

  describe('checkReConsent', () => {
    it('flags expired grants', () => {
      const expired = {
        id: 'g_exp', revoked: false,
        expiresAt: new Date(Date.now() - 1000),
        toolId: 't1', toolName: 'T', grantedBy: 'u', definitionHash: 'h',
        tier: 'curated', sideEffectClass: 'read_only', dataClasses: [], credentials: { needed: false, keys: [] },
        scope: 'task', grantedAt: new Date(),
      } as any
      ;(toolGrantStore.listGrants as jest.Mock).mockReturnValue([expired])
      ;(suspendIntegratedTool as jest.Mock).mockReturnValue(true)

      const res = executive.checkReConsent()
      expect(res.needsReConsent.length).toBe(1)
      expect(res.needsReConsent[0].trigger).toBe('grant_expired')
    })
  })
})
