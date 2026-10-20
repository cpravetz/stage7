import type { MissionScheduleRecord } from '../src/adk/triggers';

describe('TriggerRecordStore mission schedule persistence', () => {
  const originalArtifactsUrl = process.env.ARTIFACTS_URL;
  let documents: Map<string, Record<string, unknown>>;
  let store: ReturnType<typeof import('../src/services/TriggerRecordStore').createTriggerRecordStore>;

  function response(status: number, body?: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => body === undefined ? '' : JSON.stringify(body),
    } as Response;
  }

  beforeEach(() => {
    process.env.ARTIFACTS_URL = 'http://artifacts.test';
    jest.resetModules();
    documents = new Map();
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';
      if (url.pathname.endsWith('/documents/search') && method === 'POST') {
        return response(200, { documents: [...documents.values()] });
      }
      if (url.pathname === '/api/artifacts/documents' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { id: string; tenantId: string; collection: string; data: unknown };
        const document = { ...body, createdAt: new Date(), updatedAt: new Date() };
        documents.set(body.id, document);
        return response(201, document);
      }
      const encodedId = url.pathname.split('/').pop()!;
      const id = decodeURIComponent(encodedId);
      if (method === 'GET') return documents.has(id) ? response(200, documents.get(id)) : response(404);
      if (method === 'PUT') {
        const existing = documents.get(id);
        if (!existing) return response(404);
        const body = JSON.parse(String(init?.body)) as { data: unknown };
        const document = { ...existing, data: body.data, updatedAt: new Date() };
        documents.set(id, document);
        return response(200, document);
      }
      if (method === 'DELETE') {
        const existed = documents.delete(id);
        return response(existed ? 204 : 404);
      }
      return response(404);
    });
    const { createTriggerRecordStore } = require('../src/services/TriggerRecordStore') as typeof import('../src/services/TriggerRecordStore');
    store = createTriggerRecordStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
    else process.env.ARTIFACTS_URL = originalArtifactsUrl;
  });

  it('creates, reloads, updates, and deletes a mission schedule through Artifacts', async () => {
    const record: MissionScheduleRecord = {
      recordType: 'mission-schedule',
      id: 'mission-schedule-weekly',
      tenantId: 'tenant-1',
      assistantId: 'event',
      prompt: 'Review weekly metrics',
      cron: '0 9 * * 1',
      enabled: true,
      createdAt: '2026-10-05T09:00:00.000Z',
      updatedAt: '2026-10-05T09:00:00.000Z',
    };

    await expect(store.save(record)).resolves.toEqual(record);
    expect(documents.has('trigger-records:mission-schedule-weekly')).toBe(true);
    await expect(store.list()).resolves.toEqual([record]);

    const disabled = { ...record, enabled: false, updatedAt: '2026-10-05T10:00:00.000Z' };
    await store.save(disabled);
    await expect(store.get(record.id)).resolves.toMatchObject({ enabled: false });

    await expect(store.remove(record.id)).resolves.toBe(true);
    expect(documents.has('trigger-records:mission-schedule-weekly')).toBe(false);
  });
});
