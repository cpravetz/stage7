import { MCPServer } from '../server/MCPServer';
import { MCPToolRegistry } from '../server/ToolRegistry';

describe('MCPToolRegistry', () => {
  let registry: MCPToolRegistry;

  beforeEach(() => {
    registry = new MCPToolRegistry({
      execute: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'executed' }],
      }),
    } as any);
  });

  it('should register and list tools', () => {
    registry.register({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {} },
    });

    const list = registry.list();
    expect(list.tools).toHaveLength(1);
    expect(list.tools[0].name).toBe('test-tool');
  });

  it('should unregister tools', () => {
    registry.register({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {} },
    });

    expect(registry.unregister('test-tool')).toBe(true);
    expect(registry.has('test-tool')).toBe(false);
  });

  it('should call tool executor', async () => {
    registry.register({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {} },
    });

    const response = await registry.call({
      method: 'tools/call',
      params: { name: 'test-tool', arguments: {} },
    });

    expect(response.content[0].text).toBe('executed');
  });

  it('should return error for unknown tool', async () => {
    const response = await registry.call({
      method: 'tools/call',
      params: { name: 'missing-tool', arguments: {} },
    });

    expect(response.isError).toBe(true);
  });
});

describe('MCPServer', () => {
  let server: MCPServer;

  beforeEach(() => {
    server = new MCPServer(
      { name: 'test-server', version: '1.0.0' },
      {
        execute: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'done' }],
        }),
      }
    );
  });

  it('should register tools and list them', () => {
    server.registerTool({
      name: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    });

    const list = server.listTools();
    expect(list.tools).toHaveLength(1);
    expect(list.tools[0].name).toBe('echo');
  });

  it('should handle tools/call', async () => {
    server.registerTool({
      name: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    });

    const response = await server.handleRequest({
      method: 'tools/call',
      params: { name: 'echo', arguments: { message: 'hello' } },
    });

    expect((response as any).content[0].text).toBe('done');
  });

  it('should handle tools/list', async () => {
    server.registerTool({
      name: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: {} },
    });

    const response = await server.handleRequest({
      method: 'tools/list',
      params: {},
    });

    expect((response as any).tools).toHaveLength(1);
  });

  it('should return server info', () => {
    const info = server.getInfo();
    expect(info.name).toBe('test-server');
    expect(info.version).toBe('1.0.0');
  });
});
