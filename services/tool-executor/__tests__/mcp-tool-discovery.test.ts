import { MCPToolDiscovery } from '../src/services/MCPToolDiscovery'
import { mcpLibrarySourceRegistry } from '../src/services/MCPLibrarySourceRegistry'
import type { MCPLibrarySource } from '../src/types/mcp-discovery'

const MOCK_TOOLS = [
  { name: 'read_contacts', description: 'Read contacts', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { email: { type: 'string' } } } },
  { name: 'send_email', description: 'Send email', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { to: { type: 'string' }, apiKey: { type: 'string' } } } },
]

jest.mock('../src/services/MCPClient', () => {
  const actual = jest.requireActual('../src/services/MCPClient')
  return {
    ...actual,
    MCPClient: jest.fn().mockImplementation(() => ({
      listTools: jest.fn().mockResolvedValue(MOCK_TOOLS),
      disconnect: jest.fn().mockResolvedValue(undefined),
    })),
    MCPHTTPClient: jest.fn().mockImplementation(() => ({
      listTools: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue(undefined),
    })),
  }
})

import { MCPClient, MCPHTTPClient } from '../src/services/MCPClient'

const CURATED_SOURCE: MCPLibrarySource = {
  id: 'test-curated',
  name: 'Test Curated',
  transport: 'local',
  config: { command: 'mcp-cmd', args: [] },
  tier: 'curated',
  enabled: true,
}

beforeEach(() => {
  // Reset the singleton registry and register only our test source
  ;(mcpLibrarySourceRegistry as any).sources.clear()
  mcpLibrarySourceRegistry.register(CURATED_SOURCE)
  jest.clearAllMocks()
})

describe('MCPToolDiscovery', () => {
  it('discovers and classifies candidates from a curated local source', async () => {
    ;(MCPClient as jest.Mock).mockImplementation(() => ({
      listTools: jest.fn().mockResolvedValue(MOCK_TOOLS),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    const discovery = new MCPToolDiscovery()
    const { candidates, errors } = await discovery.discover({
      neededCapability: 'contact_management',
      triggeringTask: 'task_1',
      actor: 'user_1',
    })

    expect(errors).toEqual([])
    expect(candidates.length).toBeGreaterThan(0)
    const contact = candidates.find((c) => c.name === 'read_contacts')
    expect(contact).toBeDefined()
    expect(contact!.tier).toBe('curated')
    expect(contact!.sideEffectClass).toBe('read_only')
    expect(contact!.dataClasses).toContain('contact')
    expect(contact!.preApproved).toBe(true)
    expect(contact!.definitionHash).toBeDefined()
    expect(contact!.neededCapability).toBe('contact_management')
  })

  it('classifies send_email as external_action with a credential key', async () => {
    ;(MCPClient as jest.Mock).mockImplementation(() => ({
      listTools: jest.fn().mockResolvedValue(MOCK_TOOLS),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    const discovery = new MCPToolDiscovery()
    const { candidates } = await discovery.discover({
      neededCapability: 'email_send',
      actor: 'user_1',
    })

    const email = candidates.find((c) => c.name === 'send_email')
    expect(email).toBeDefined()
    expect(email!.sideEffectClass).toBe('external_action')
    expect(email!.credentials.needed).toBe(true)
    expect(email!.credentials.keys).toContain('apiKey')
  })

  it('drops unvetted sources silently', async () => {
    ;(mcpLibrarySourceRegistry as any).sources.clear()
    mcpLibrarySourceRegistry.register({
      ...CURATED_SOURCE,
      id: 'unvetted-src',
      tier: 'unvetted',
    })

    const discovery = new MCPToolDiscovery()
    const { candidates, errors } = await discovery.discover({
      neededCapability: 'x',
      actor: 'user_1',
    })

    expect(candidates.length).toBe(0)
    expect(errors.length).toBe(0)
  })

  it('records an error when a source fails', async () => {
    ;(MCPClient as jest.Mock).mockImplementation(() => ({
      listTools: jest.fn().mockRejectedValue(new Error('boom')),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    const discovery = new MCPToolDiscovery()
    const { candidates, errors } = await discovery.discover({
      neededCapability: 'x',
      actor: 'user_1',
    })

    expect(candidates.length).toBe(0)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('boom')
  })

  it('respects maxCandidatesPerSource limit', async () => {
    ;(MCPClient as jest.Mock).mockImplementation(() => ({
      listTools: jest.fn().mockResolvedValue(MOCK_TOOLS),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    const discovery = new MCPToolDiscovery(1)
    const { candidates } = await discovery.discover({
      neededCapability: 'x',
      actor: 'user_1',
    })

    expect(candidates.length).toBe(1)
  })

  it('disconnect closes clients', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined)
    const mockInstance = { listTools: jest.fn().mockResolvedValue([]), disconnect }
    ;(MCPClient as jest.Mock).mockImplementation(function (this: any) {
      Object.setPrototypeOf(mockInstance, (MCPClient as any).prototype)
      return mockInstance
    })

    const discovery = new MCPToolDiscovery()
    await discovery.discover({ neededCapability: 'x', actor: 'user_1' })
    await discovery.disconnect()
    expect(disconnect).toHaveBeenCalled()
  })
})
