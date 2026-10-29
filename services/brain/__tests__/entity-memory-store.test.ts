import { EntityMemoryStore } from '../src/services/EntityMemoryStore';

describe('EntityMemoryStore', () => {
  const originalArtifactsUrl = process.env.ARTIFACTS_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
    else process.env.ARTIFACTS_URL = originalArtifactsUrl;
  });

  it('rolls up memory through Artifacts documents rather than accessing Mongo directly', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts:4200';
    const fetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        documents: [{
          id: 'existing',
          data: {
            tenantId: 'tenant-1',
            entityId: 'matter-9',
            assistantId: 'legal',
            missionId: 'mission-old',
            summary: 'Prior work',
            preferences: ['Concise reports'],
            constraints: ['Use current law'],
            decisions: [],
            active: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'entity-memory' }), { status: 201 }));

    const result = await new EntityMemoryStore().upsert({
      tenantId: 'tenant-1',
      entityId: 'matter-9',
      assistantId: 'legal',
      missionId: 'mission-new',
      summary: 'Reviewed new contract clauses',
      preferences: ['Concise reports'],
      constraints: ['Keep client data confidential'],
      decisions: ['Escalate unusual indemnity terms'],
    });

    expect(result.preferences).toEqual(['Concise reports']);
    expect(result.constraints).toEqual(['Use current law', 'Keep client data confidential']);
    expect(result.decisions).toEqual(['Escalate unusual indemnity terms']);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://artifacts:4200/api/artifacts/documents/search',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://artifacts:4200/api/artifacts/documents',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      tenantId: 'tenant-1',
      collection: 'entity_memories',
      data: { entityId: 'matter-9', assistantId: 'legal' },
    });
  });
});
