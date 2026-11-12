import { MCPToolExecutive } from '../src/services/MCPToolExecutive';
import { mcpToolDiscovery } from '../src/services/MCPToolDiscovery';
import { MCPLibrarySourceRegistry } from '../src/services/MCPLibrarySourceRegistry';
import { setToolRegistry, getToolRegistry } from '../src/services/ToolIntegrator';

describe('runtime tool creation: capability resolution', () => {
  let savedRegistry: ReturnType<typeof getToolRegistry>;

  beforeEach(() => {
    // setToolRegistry is a module-level singleton shared with the runtime's
    // ToolExecutor. Save it, inject a mock for this test, and restore it after
    // so nothing leaks into the rest of the suite.
    savedRegistry = getToolRegistry();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setToolRegistry(savedRegistry);
  });

  it('surfaces the unreachable source instead of fabricating a tool', async () => {
    const exec = new MCPToolExecutive();
    exec.setRegistry({ get: () => undefined, list: () => [] });

    jest.spyOn(mcpToolDiscovery, 'discover').mockResolvedValue({
      candidates: [],
      errors: ['stage7-mcp-curated: MCP HTTP request failed: 503'],
    });

    const resolved = exec.resolveCapability({ capability: 'text messaging' });
    expect(resolved.satisfied).toBe(false);

    const discovered = await exec.discoverAndRequestPermission({ capability: 'text messaging' });
    expect(discovered.satisfied).toBe(false);
    expect(discovered.error).toMatch(/Discovery failed|stage7-mcp-curated|503/i);
  });

  it('resolves through the mcp-runtime HTTP source when reachable', async () => {
    const exec = new MCPToolExecutive();
    const injected: { tools: Record<string, unknown> } = { tools: {} };
    setToolRegistry({
      get: () => undefined,
      list: () => [],
      registerOrReplace: (tool: any) => { injected.tools[tool.id] = tool; },
      unregister: () => false,
    });
    exec.setRegistry({
      get: () => undefined,
      list: () => [],
      registerOrReplace: (tool: any) => { injected.tools[tool.id] = tool; },
      unregister: () => false,
    });

    jest.spyOn(mcpToolDiscovery, 'discover').mockResolvedValue({
      candidates: [{
        id: 'mcp_stage7-curated_send-sms',
        name: 'send_sms',
        description: 'Send an SMS message',
        sourceId: 'stage7-curated',
        sourceName: 'Stage7 Curated MCP Library',
        transport: 'remote',
        tier: 'curated',
        sideEffectClass: 'external_action',
        dataClasses: ['task_input'],
        credentials: { needed: false, source: undefined, keys: [] },
        inputSchema: { type: 'object', properties: {} },
        definitionHash: 'def_1',
        publisher: 'Stage7',
        preApproved: true,
        neededCapability: 'text messaging',
        triggeringTask: 'send a text message',
      }],
      errors: [],
    });

    const discovered = await exec.discoverAndRequestPermission({ capability: 'text messaging' });
    expect(discovered.satisfied).toBe(true);
    expect(discovered.tool?.name).toBe('send_sms');
  });

  it('default curated source points at the mcp-runtime HTTP transport', () => {
    const registry = new MCPLibrarySourceRegistry();
    const source = registry.get('stage7-curated');
    expect(source).toBeDefined();
    expect(source?.transport).toBe('remote');
    expect(typeof source?.config.url).toBe('string');
    expect(source?.config.url).toMatch(/mcp-runtime/);
  });
});