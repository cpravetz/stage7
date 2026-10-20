import {
  defaultScope,
  isMCPTrustTier,
  isSideEffectClass,
  isPermissionScope,
  MCP_TRUST_TIERS,
  SIDE_EFFECT_CLASSES,
  PERMISSION_SCOPES,
  type MCPTrustTier,
  type SideEffectClass,
  type PermissionScope,
} from '../src/types/mcp-discovery'

describe('mcp-discovery types', () => {
  describe('MCP_TRUST_TIERS', () => {
    it('lists the three trust tiers', () => {
      expect(MCP_TRUST_TIERS).toEqual(['curated', 'vetted_third_party', 'unvetted'])
    })
  })

  describe('SIDE_EFFECT_CLASSES', () => {
    it('lists the three side-effect classes', () => {
      expect(SIDE_EFFECT_CLASSES).toEqual(['read_only', 'writes_data', 'external_action'])
    })
  })

  describe('PERMISSION_SCOPES', () => {
    it('lists the three permission scopes', () => {
      expect(PERMISSION_SCOPES).toEqual(['task', 'assistant', 'all_agents'])
    })
  })

  describe('isMCPTrustTier', () => {
    it('accepts valid tiers', () => {
      for (const t of ['curated', 'vetted_third_party', 'unvetted'] as MCPTrustTier[]) {
        expect(isMCPTrustTier(t)).toBe(true)
      }
    })
    it('rejects invalid values', () => {
      expect(isMCPTrustTier('bogus')).toBe(false)
      expect(isMCPTrustTier(123)).toBe(false)
      expect(isMCPTrustTier(null)).toBe(false)
      expect(isMCPTrustTier(undefined)).toBe(false)
    })
  })

  describe('isSideEffectClass', () => {
    it('accepts valid classes', () => {
      for (const c of ['read_only', 'writes_data', 'external_action'] as SideEffectClass[]) {
        expect(isSideEffectClass(c)).toBe(true)
      }
    })
    it('rejects invalid values', () => {
      expect(isSideEffectClass('delete_everything')).toBe(false)
      expect(isSideEffectClass(null)).toBe(false)
    })
  })

  describe('isPermissionScope', () => {
    it('accepts valid scopes', () => {
      for (const s of ['task', 'assistant', 'all_agents'] as PermissionScope[]) {
        expect(isPermissionScope(s)).toBe(true)
      }
    })
    it('rejects invalid values', () => {
      expect(isPermissionScope('org_wide')).toBe(false)
      expect(isPermissionScope(null)).toBe(false)
    })
  })

  describe('defaultScope', () => {
    it('returns task for unvetted tier', () => {
      expect(defaultScope('unvetted', 'read_only')).toBe('task')
      expect(defaultScope('unvetted', 'external_action')).toBe('task')
    })
    it('returns task for external_action side effect', () => {
      expect(defaultScope('curated', 'external_action')).toBe('task')
      expect(defaultScope('vetted_third_party', 'external_action')).toBe('task')
    })
    it('returns assistant for curated read_only', () => {
      expect(defaultScope('curated', 'read_only')).toBe('assistant')
    })
    it('returns assistant for vetted_third_party read_only', () => {
      expect(defaultScope('vetted_third_party', 'read_only')).toBe('assistant')
    })
    it('returns assistant for writes_data regardless of tier', () => {
      expect(defaultScope('curated', 'writes_data')).toBe('assistant')
      expect(defaultScope('vetted_third_party', 'writes_data')).toBe('assistant')
    })
  })
})
