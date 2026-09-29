import fs from 'fs';
import os from 'os';
import path from 'path';
import { Tool } from '../types';
import { ToolStore } from '../services/ToolStore';
import { ToolRegistry } from '../services/ToolRegistry';
import { nativeTools } from '../data/nativeTools';

const ORIGINAL_STORE_DIR = process.env.TOOL_STORE_DIR;
let tempDir: string;

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: 'runtime_tool',
    name: 'Runtime Tool',
    description: 'A tool created at runtime',
    type: 'native',
    manifest: { executor: 'math', type: 'native', customVendorFlag: 'keep-me', nested: { deep: [1, 2, 3] } },
    inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { result: { type: 'number' } } },
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-02-03T04:05:06.000Z'),
    isSkill: false,
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-toolstore-'));
  process.env.TOOL_STORE_DIR = tempDir;
});

afterEach(() => {
  if (ORIGINAL_STORE_DIR === undefined) {
    delete process.env.TOOL_STORE_DIR;
  } else {
    process.env.TOOL_STORE_DIR = ORIGINAL_STORE_DIR;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('ToolStore', () => {
  it('reads TOOL_STORE_DIR from the environment and creates the file lazily', () => {
    const store = new ToolStore();
    expect(store.getFilePath()).toBe(path.join(tempDir, 'tools.json'));
    expect(fs.existsSync(tempDir)).toBe(true);
  });

  it('save -> loadAll round-trips every Tool field, reviving Date fields as Dates', () => {
    const store = new ToolStore();
    const tool = makeTool();
    store.save(tool);

    const loaded = store.loadAll();
    expect(loaded).toHaveLength(1);
    const [restored] = loaded;

    expect(restored.id).toBe(tool.id);
    expect(restored.name).toBe(tool.name);
    expect(restored.description).toBe(tool.description);
    expect(restored.type).toBe('native');
    expect(restored.isSkill).toBe(false);
    expect(restored.inputSchema).toEqual(tool.inputSchema);
    expect(restored.outputSchema).toEqual(tool.outputSchema);
    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.updatedAt).toBeInstanceOf(Date);
    expect(restored.createdAt.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(restored.updatedAt.toISOString()).toBe('2026-02-03T04:05:06.000Z');
  });

  it('preserves arbitrary extra manifest keys through the round-trip', () => {
    const store = new ToolStore();
    store.save(makeTool());

    const [restored] = store.loadAll();
    expect(restored.manifest.executor).toBe('math');
    expect(restored.manifest.customVendorFlag).toBe('keep-me');
    expect(restored.manifest.nested).toEqual({ deep: [1, 2, 3] });
  });

  it('serializes Date fields as ISO strings on disk', () => {
    const store = new ToolStore();
    store.save(makeTool());

    const raw = JSON.parse(fs.readFileSync(store.getFilePath(), 'utf-8'));
    expect(typeof raw[0].createdAt).toBe('string');
    expect(raw[0].createdAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('replaces (not duplicates) an existing id on save and removes by id', () => {
    const store = new ToolStore();
    store.save(makeTool());
    store.save(makeTool({ description: 'updated' }));
    expect(store.loadAll()).toHaveLength(1);
    expect(store.loadAll()[0].description).toBe('updated');

    expect(store.remove('runtime_tool')).toBe(true);
    expect(store.loadAll()).toEqual([]);
    expect(store.remove('runtime_tool')).toBe(false);
  });

  it('returns [] for a corrupt store file instead of throwing', () => {
    const store = new ToolStore();
    fs.writeFileSync(store.getFilePath(), '{ this is not json', 'utf-8');
    expect(() => store.loadAll()).not.toThrow();
    expect(store.loadAll()).toEqual([]);
  });

  it('returns [] for a non-array payload and skips malformed entries', () => {
    const store = new ToolStore();
    fs.writeFileSync(store.getFilePath(), JSON.stringify({ nope: true }), 'utf-8');
    expect(store.loadAll()).toEqual([]);

    fs.writeFileSync(store.getFilePath(), JSON.stringify([{ id: 'no-dates' }, { id: 'ok', name: 'ok', createdAt: 'x', updatedAt: 'y' }]), 'utf-8');
    const loaded = store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('ok');
    expect(loaded[0].createdAt).toBeInstanceOf(Date);
  });

  it('returns [] when no store file exists yet', () => {
    expect(new ToolStore().loadAll()).toEqual([]);
  });

  it('writes atomically through a temp file and leaves no temp files behind', () => {
    const store = new ToolStore();
    store.save(makeTool());
    store.save(makeTool({ id: 'second' }));

    expect(fs.readdirSync(tempDir)).toEqual(['tools.json']);
    expect(new ToolStore().loadAll().map((t) => t.id).sort()).toEqual(['runtime_tool', 'second']);
  });

  it('keeps the previous store readable when a later write fails', () => {
    const store = new ToolStore();
    store.save(makeTool());

    const originalWrite = fs.writeFileSync;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    try {
      store.save(makeTool({ id: 'never_persisted' }));
    } finally {
      spy.mockRestore();
      expect(originalWrite).toBeDefined();
    }

    const loaded = new ToolStore().loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('runtime_tool');
  });
});

describe('ToolRegistry persistence', () => {
  it('still throws on a duplicate id in register()', () => {
    const registry = new ToolRegistry(new ToolStore());
    registry.register(makeTool());
    expect(() => registry.register(makeTool())).toThrow(/already registered/);
  });

  it('registerOrReplace() overwrites a duplicate id instead of throwing', () => {
    const registry = new ToolRegistry(new ToolStore());
    registry.register(makeTool({ description: 'first' }));
    registry.registerOrReplace(makeTool({ description: 'second' }));

    expect(registry.list().filter((t) => t.id === 'runtime_tool')).toHaveLength(1);
    expect(registry.get('runtime_tool')?.description).toBe('second');
  });

  it('persists through register/registerOrReplace and de-persists on unregister', () => {
    const store = new ToolStore();
    const registry = new ToolRegistry(store);

    registry.register(makeTool({ id: 'alpha' }));
    registry.registerOrReplace(makeTool({ id: 'beta' }));

    expect(new ToolStore().loadAll().map((t) => t.id).sort()).toEqual(['alpha', 'beta']);

    registry.unregister('alpha');
    expect(new ToolStore().loadAll().map((t) => t.id)).toEqual(['beta']);
  });

  it('works with no store (existing construction sites are unaffected)', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(makeTool())).not.toThrow();
    expect(registry.get('runtime_tool')).toBeDefined();
  });

  it('registerOrReplace preserves the lower-order-tool isSkill:false enforcement', () => {
    const registry = new ToolRegistry(new ToolStore());
    const lower = makeTool({ id: 'lower', isSkill: true });
    delete lower.isSkill;

    registry.registerOrReplace(makeTool({ id: 'higher', manifest: { lowerOrderTools: ['lower'] } }));
    registry.registerOrReplace(lower);

    expect(registry.get('lower')?.isSkill).toBe(false);

    registry.registerOrReplace(makeTool({ id: 'conflicting', isSkill: true }));
    expect(() =>
      registry.registerOrReplace(makeTool({ id: 'higher2', manifest: { lowerOrderTools: ['conflicting'] } })),
    ).toThrow(/Registration conflict/);
  });
});

describe('startup hydration semantics (src/index.ts)', () => {
  /**
   * Mirrors the hydration loop in src/index.ts: defaults are registered first,
   * then every persisted tool whose id is NOT already present is restored via
   * registerOrReplace. Built-in defaults must always win.
   */
  function hydrate(registry: ToolRegistry, store: ToolStore): { restored: number; skipped: number } {
    let restored = 0;
    let skipped = 0;
    for (const tool of store.loadAll()) {
      if (registry.get(tool.id)) {
        skipped++;
        continue;
      }
      registry.registerOrReplace(tool);
      restored++;
    }
    return { restored, skipped };
  }

  function seedDefaults(registry: ToolRegistry): void {
    for (const tool of nativeTools) {
      if (!registry.get(tool.id)) registry.registerDefault(tool);
    }
  }

  it('restores a persisted runtime tool with a fresh id', () => {
    const store = new ToolStore();
    store.save(makeTool({ id: 'runtime_only', name: 'Runtime Only' }));

    const registry = new ToolRegistry(store);
    seedDefaults(registry);
    const { restored, skipped } = hydrate(registry, store);

    expect(restored).toBe(1);
    expect(skipped).toBe(0);
    expect(registry.get('runtime_only')?.name).toBe('Runtime Only');
    expect(registry.get('runtime_only')?.createdAt).toBeInstanceOf(Date);
  });

  it('skips a persisted tool whose id collides with a built-in default', () => {
    const store = new ToolStore();
    store.save(makeTool({ id: 'calculate', name: 'Stale Calculate', description: 'stale snapshot' }));

    const registry = new ToolRegistry(store);
    seedDefaults(registry);
    const { restored, skipped } = hydrate(registry, store);

    expect(restored).toBe(0);
    expect(skipped).toBe(1);
    expect(registry.get('calculate')?.description).not.toBe('stale snapshot');
    expect(registry.get('calculate')?.manifest.executor).toBe('math');
    expect(registry.get('calculate')?.type).toBe('native');
  });

  it('survives a corrupt store during hydration (treated as empty, not thrown)', () => {
    fs.writeFileSync(path.join(tempDir, 'tools.json'), 'not json at all', 'utf-8');
    const store = new ToolStore();

    const registry = new ToolRegistry(store);
    seedDefaults(registry);
    expect(() => hydrate(registry, store)).not.toThrow();
    expect(registry.list().length).toBe(nativeTools.length);
  });

  it('a tool registered at runtime on boot 1 is restored on boot 2 (survives restart)', () => {
    const firstBoot = new ToolRegistry(new ToolStore());
    seedDefaults(firstBoot);
    firstBoot.registerOrReplace(makeTool({ id: 'runtime_only', name: 'Boot One' }));

    const secondBoot = new ToolRegistry(new ToolStore());
    seedDefaults(secondBoot);
    const { restored, skipped } = hydrate(secondBoot, new ToolStore());

    expect(restored).toBe(1);
    expect(skipped).toBe(0);
    expect(secondBoot.list().filter((t) => t.id === 'runtime_only')).toHaveLength(1);
    expect(secondBoot.get('runtime_only')?.name).toBe('Boot One');
    expect(secondBoot.get('runtime_only')?.createdAt).toBeInstanceOf(Date);
  });

  it('a tool deleted at runtime is not resurrected on the next boot', () => {
    const firstBoot = new ToolRegistry(new ToolStore());
    firstBoot.registerOrReplace(makeTool({ id: 'runtime_only' }));
    firstBoot.unregister('runtime_only');

    const secondBoot = new ToolRegistry(new ToolStore());
    const { restored } = hydrate(secondBoot, new ToolStore());
    expect(restored).toBe(0);
    expect(secondBoot.get('runtime_only')).toBeUndefined();
  });
});
