import {
  buildPermissionRequest,
  defaultScopeFor,
  decidePermission,
  getPermissionRequest,
  preApprove,
  renderPermissionPrompt,
  listActiveGrants,
  revokeGrant,
} from '../src/services/ToolPermissionService'
import { toolGrantStore } from '../src/services/ToolGrantStore'
import { toolAuditLog } from '../src/services/ToolAuditLog'
import { mcpLibrarySourceRegistry } from '../src/services/MCPLibrarySourceRegistry'
import type {
  MCPToolCandidate,
  PermissionDecision,
  PermissionScope,
  ToolPermissionGrant,
} from '../src/types/mcp-discovery'

const TEST_DIR = '/tmp/stage7-perm-test'
beforeAll(() => {
  process.env.TOOL_GRANT_STORE_DIR = TEST_DIR
  process.env.TOOL_DENIAL_STORE_DIR = TEST_DIR
  process.env.TOOL_AUDIT_LOG_DIR = '/tmp/stage7-perm-audit-test'
})
afterAll(() => {
  delete process.env.TOOL_GRANT_STORE_DIR
  delete process.env.TOOL_DENIAL_STORE_DIR
  delete process.env.TOOL_AUDIT_LOG_DIR
})

function candidate(overrides: Partial<MCPToolCandidate> = {}): MCPToolCandidate {
  return {
    id: `mcp_${Math.random().toString(36).slice(2)}`,
    name: 'Test MCP Tool',
    description: 'A test tool',
    sourceId: 'stage7-curated',
    sourceName: 'Stage7 Curated MCP Library',
    transport: 'local',
    tier: 'curated',
    sideEffectClass: 'read_only',
    dataClasses: ['contact'],
    credentials: { needed: false, keys: [] },
    inputSchema: { type: 'object', properties: {} },
    definitionHash: 'def_123',
    preApproved: true,
    neededCapability: 'test_cap',
    ...overrides,
  }
}

function clearStores() {
  for (const g of toolGrantStore.listGrants()) toolGrantStore.revokeGrant(g.id, 'cleanup')
  toolGrantStore.listDenials()
  // clear pending requests module state is not exported; rely on expiry/ids being unique
}

describe('ToolPermissionService', () => {
  beforeEach(() => {
    clearStores()
  })

  describe('buildPermissionRequest', () => {
    it('builds a request with default scope and expiry', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      expect(req.id).toMatch(/^perm_/)
      expect(req.neededCapability).toBe('test_cap')
      expect(req.candidate).toBe(c)
      expect(req.defaultScope).toBe('assistant')
      expect(req.availableScopes).toContain('assistant')
      expect(req.preApproved).toBe(true)
      expect(req.expiresAt).toBeInstanceOf(Date)
      expect(req.createdAt).toBeInstanceOf(Date)
    })

    it('uses provided defaultScope', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { defaultScope: 'task', actor: 'user_1' })
      expect(req.defaultScope).toBe('task')
    })
  })

  describe('defaultScopeFor', () => {
    it('maps curated read_only to assistant', () => {
      expect(defaultScopeFor(candidate({ tier: 'curated', sideEffectClass: 'read_only' }))).toBe('assistant')
    })
    it('maps curated external_action to task', () => {
      expect(defaultScopeFor(candidate({ tier: 'curated', sideEffectClass: 'external_action' }))).toBe('task')
    })
    it('maps unvetted to task', () => {
      expect(defaultScopeFor(candidate({ tier: 'unvetted', sideEffectClass: 'read_only' }))).toBe('task')
    })
  })

  describe('getPermissionRequest', () => {
    it('returns the built request by id', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      expect(getPermissionRequest(req.id)).toEqual(req)
    })
    it('returns undefined for unknown id', () => {
      expect(getPermissionRequest('perm_nope')).toBeUndefined()
    })
  })

  describe('decidePermission', () => {
    it('grants and returns a grant', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      const result = decidePermission(req.id, 'granted', { decidedBy: 'user_1' })
      expect(result.decision).toBe('granted')
      expect(result.grant).toBeDefined()
      expect(result.grant!.toolId).toBe(c.id)
      expect(result.grant!.grantedBy).toBe('user_1')
      expect(result.grant!.scope).toBe(req.defaultScope)
    })

    it('denies and returns a denial', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      const result = decidePermission(req.id, 'denied', { decidedBy: 'user_1' })
      expect(result.decision).toBe('denied')
      expect(result.denial).toBeDefined()
      expect(result.denial!.deniedBy).toBe('user_1')
      expect(getPermissionRequest(req.id)).toBeUndefined()
    })

    it('rejects scope not in availableScopes', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { availableScopes: ['task'], actor: 'user_1' })
      const result = decidePermission(req.id, 'granted', { decidedBy: 'user_1', scope: 'all_agents' })
      expect(result.decision).toBe('denied')
      expect(result.reason).toContain('not available')
    })

    it('returns denied for expired/unknown request', () => {
      expect(decidePermission('perm_nope', 'granted', { decidedBy: 'u' }).decision).toBe('denied')
    })
  })

  describe('preApprove', () => {
    it('pre-approves a curated candidate', () => {
      const c = candidate({ tier: 'curated', preApproved: true })
      const grant = preApprove(c, { decidedBy: 'system' })
      expect(grant).toBeDefined()
      expect(grant!.grantedBy).toBe('system')
      expect(grant!.scope).toBe('assistant')
    })

    it('returns undefined for non-pre-approved', () => {
      const c = candidate({ preApproved: false })
      expect(preApprove(c, { decidedBy: 'system' })).toBeUndefined()
    })

    it('returns undefined for non-curated tier', () => {
      const c = candidate({ tier: 'vetted_third_party', preApproved: true, sourceId: 'vetted-src' })
      expect(preApprove(c, { decidedBy: 'system' })).toBeUndefined()
    })
  })

  describe('renderPermissionPrompt', () => {
    it('renders prompt text containing key fields', () => {
      const c = candidate({ publisher: 'Acme Corp' })
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      const text = renderPermissionPrompt(req)
      expect(text).toContain('Stage7 Tool Permission Request')
      expect(text).toContain('test_cap')
      expect(text).toContain('Test MCP Tool')
      expect(text).toContain('Acme Corp')
      expect(text).toContain("Curated — first-party or organization-vetted.")
      expect(text).toContain("Read-only: it reads data and returns results without changing anything.")
      expect(text).toContain("No credentials or subscription required.")
      expect(text).toContain("Publisher's claim")
    })
  })

  describe('listActiveGrants / revokeGrant', () => {
    it('lists active grants and revokes one', () => {
      const c = candidate()
      const req = buildPermissionRequest(c, { actor: 'user_1' })
      const result = decidePermission(req.id, 'granted', { decidedBy: 'user_1' })
      const grantId = result.grant!.id
      expect(listActiveGrants().map((g) => g.id)).toContain(grantId)
      expect(revokeGrant(grantId, 'admin')).toBe(true)
      expect(listActiveGrants().map((g) => g.id)).not.toContain(grantId)
    })
  })
})
