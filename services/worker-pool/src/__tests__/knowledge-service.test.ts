import { KnowledgeService } from '../services/KnowledgeService';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { toStoredAuthoredEntry } from '../data/assistantKnowledge';
import type { AssistantDefinition, StoredKnowledgeEntry, EmbeddingsClient } from '@stage7-nextgen/shared';
import { embeddableContentHash } from '@stage7-nextgen/shared';
import { createTestArtifactsService } from './testArtifactsService';

async function makeService(): Promise<KnowledgeService> {
  return new KnowledgeService(createTestArtifactsService());
}

function entry(overrides: Partial<StoredKnowledgeEntry>): StoredKnowledgeEntry {
  return {
    id: 'k1',
    title: 'Title',
    content: 'Content',
    assistantId: null,
    scope: 'shared',
    origin: 'acquired',
    ...overrides,
  };
}

/** Waits for a fire-and-forget async chain to reach a visible state. */
async function until(cond: () => boolean | Promise<boolean>, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await cond()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('condition not met after flushing');
}

describe('KnowledgeService', () => {
  it('returns an assistant its own entries', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'healthcare-core',
      assistantId: 'healthcare',
      scope: 'assistant',
      title: 'Healthcare Advisor',
      content: 'Never diagnose.',
    }));

    const forHealthcare = await knowledge.listForAssistant('healthcare');
    expect(forHealthcare).toHaveLength(1);
    expect(forHealthcare[0].content).toBe('Never diagnose.');
  });

  it('does not leak one assistant knowledge to another', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'healthcare-core',
      assistantId: 'healthcare',
      scope: 'assistant',
      content: 'Never diagnose.',
    }));

    const forLegal = await knowledge.listForAssistant('legal');
    expect(forLegal).toHaveLength(0);
  });

  it('offers shared entries to every assistant', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'shared-1',
      scope: 'shared',
      origin: 'acquired',
      title: 'House style',
      content: 'Always date-stamp figures.',
    }));

    for (const assistantId of ['healthcare', 'legal', 'cto']) {
      const listed = await knowledge.listForAssistant(assistantId);
      expect(listed.map((e) => e.id)).toContain('shared-1');
    }
  });

  it('combines an assistant own entries with shared ones', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'legal-core', assistantId: 'legal', scope: 'assistant', content: 'Ask for jurisdiction.',
    }));
    await knowledge.publish(entry({ id: 'shared-1', scope: 'shared', content: 'Date-stamp figures.' }));

    const ids = (await knowledge.listForAssistant('legal')).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['legal-core', 'shared-1']));
  });

  it('is idempotent: republishing replaces rather than duplicating', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant', content: 'v1' }));
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant', content: 'v2' }));

    const listed = await knowledge.listForAssistant('legal');
    expect(listed).toHaveLength(1);
    expect(listed[0].content).toBe('v2');
  });

  it('searches across title, content and tags', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'legal-core', assistantId: 'legal', scope: 'assistant',
      title: 'Legal Counsel', content: 'Contract review guidance', tags: ['contracts'],
    }));

    expect(await knowledge.search('contracts', 'legal')).toHaveLength(1);
    expect(await knowledge.search('jurisdiction', 'legal')).toHaveLength(0);
  });

  it('removes an entry', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant' }));
    expect(await knowledge.remove('legal-core')).toBe(true);
    expect(await knowledge.listForAssistant('legal')).toHaveLength(0);
  });

  it('marks file-loaded knowledge as authored and assistant-scoped', () => {
    const stored = toStoredAuthoredEntry('healthcare', {
      id: 'healthcare-core-knowledge', title: 'Healthcare Advisor', content: 'body',
    });
    expect(stored).toMatchObject({
      assistantId: 'healthcare', scope: 'assistant', origin: 'authored',
    });
  });
});

describe('replaceAssistantKnowledge', () => {
  it('adds an entry edited through the configuration UI', async () => {
    const knowledge = await makeService();
    await knowledge.replaceAssistantKnowledge('legal', [
      { id: 'legal-ui-1', title: 'Added in UI', content: 'Cite the clause.' },
    ]);
    const listed = await knowledge.listForAssistant('legal');
    expect(listed.map((e) => e.id)).toEqual(['legal-ui-1']);
  });

  it('removes entries deleted in the UI', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({ id: 'a', assistantId: 'legal', scope: 'assistant', origin: 'authored' }));
    await knowledge.publish(entry({ id: 'b', assistantId: 'legal', scope: 'assistant', origin: 'authored' }));

    await knowledge.replaceAssistantKnowledge('legal', [
      { id: 'a', title: 'A', content: 'kept' },
    ]);

    const ids = (await knowledge.listForAssistant('legal')).map((e) => e.id);
    expect(ids).toEqual(['a']);
  });

  it('never deletes shared entries or another assistant entries', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({ id: 'shared-1', scope: 'shared', origin: 'authored' }));
    await knowledge.publish(entry({ id: 'healthcare-core', assistantId: 'healthcare', scope: 'assistant', origin: 'authored' }));
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant', origin: 'authored' }));

    await knowledge.replaceAssistantKnowledge('legal', []);

    // Legal keeps the shared entry it was never the owner of, but loses its own.
    expect((await knowledge.listForAssistant('legal')).map((e) => e.id)).toEqual(['shared-1']);
    expect((await knowledge.listForAssistant('healthcare')).map((e) => e.id))
      .toEqual(expect.arrayContaining(['healthcare-core', 'shared-1']));
    expect((await knowledge.listForAssistant('cto')).map((e) => e.id)).toEqual(['shared-1']);
  });
});

describe('acquired knowledge is not overwritten', () => {
  const acquired = (id: string, assistantId: string | null = null) =>
    entry({ id, assistantId, scope: assistantId ? 'assistant' : 'shared', origin: 'acquired' });

  it('survives the startup file sync for the same assistant', async () => {
    const knowledge = await makeService();
    await knowledge.publish(acquired('healthcare-learned-1', 'healthcare'));

    // Startup re-syncs authored knowledge from the files on every boot.
    await knowledge.replaceAssistantKnowledge('healthcare', [
      { id: 'healthcare-core-knowledge', title: 'Healthcare Advisor', content: 'from file' },
    ]);

    const ids = (await knowledge.listForAssistant('healthcare')).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['healthcare-learned-1', 'healthcare-core-knowledge']));
  });

  it('survives a configuration UI save that only knows about authored entries', async () => {
    const knowledge = await makeService();
    await knowledge.publish(acquired('legal-learned-1', 'legal'));
    await knowledge.publish(acquired('shared-learned-1'));

    // The UI submits the authored snapshot it loaded, not acquired entries.
    await knowledge.replaceAssistantKnowledge('legal', [
      { id: 'legal-core-knowledge', title: 'Legal Counsel', content: 'edited in UI' },
    ]);

    const ids = (await knowledge.listForAssistant('legal')).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['legal-learned-1', 'shared-learned-1', 'legal-core-knowledge']));
  });

  it('survives removal of all authored entries for the assistant', async () => {
    const knowledge = await makeService();
    await knowledge.publish(acquired('legal-learned-1', 'legal'));
    await knowledge.replaceAssistantKnowledge('legal', []);

    expect((await knowledge.listForAssistant('legal')).map((e) => e.id)).toEqual(['legal-learned-1']);
  });

  it('is not clobbered when an authored entry reuses an acquired id', async () => {
    const knowledge = await makeService();
    await knowledge.publish(acquired('collide', 'legal'));

    await knowledge.replaceAssistantKnowledge('legal', [
      { id: 'collide', title: 'Authored', content: 'authored content' },
    ]);

    const listed = await knowledge.listForAssistant('legal');
    expect(listed[0].content).toBe('Content');
    expect(listed[0].origin).toBe('acquired');
  });

  it('still lets acquired knowledge be updated and removed deliberately', async () => {
    const knowledge = await makeService();
    await knowledge.publish(acquired('legal-learned-1', 'legal'));
    await knowledge.publish(acquired('legal-learned-1', 'legal'));
    expect((await knowledge.listForAssistant('legal'))[0].content).toBe('Content');

    expect(await knowledge.remove('legal-learned-1')).toBe(true);
    expect(await knowledge.listForAssistant('legal')).toHaveLength(0);
  });
});

describe('knowledge injection into the system prompt', () => {
  const originalFetch = global.fetch;
  let captured = '';

  beforeEach(() => {
    captured = '';
    global.fetch = jest.fn(async (_url: any, init: any) => {
      captured = JSON.parse(init.body).systemPrompt;
      return {
        ok: true, status: 200,
        json: async () => ({ content: 'done', tokensUsed: 1, model: 'test' }),
      } as any;
    }) as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function definition(assistantId: string): AssistantDefinition {
    return {
      id: assistantId, tenantId: 'system', name: assistantId,
      description: 'd', systemPrompt: 'You are an assistant.',
      tools: [], metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    };
  }

  it('injects stored knowledge into the prompt sent to the model', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'legal-core', assistantId: 'legal', scope: 'assistant',
      title: 'Legal Counsel', content: 'Always ask which jurisdiction applies.',
    }));

    await new AssistantExecutor(knowledge).execute(definition('legal'), 'Review this contract');

    expect(captured).toContain('## Your Knowledge');
    expect(captured).toContain('### Legal Counsel');
    expect(captured).toContain('Always ask which jurisdiction applies.');
  });

  it('injects knowledge stored by another assistant, when shared', async () => {
    const knowledge = await makeService();
    // Recorded once, under one assistant...
    await knowledge.publish(entry({
      id: 'shared-1', assistantId: 'healthcare', scope: 'shared',
      title: 'Escalation note', content: 'Escalate clinical questions to a clinician.',
    }));

    // ...and offered to a different assistant at execution time.
    await new AssistantExecutor(knowledge).execute(definition('legal'), 'Summarise');

    expect(captured).toContain('Escalate clinical questions to a clinician.');
  });

  it('still executes with no knowledge block when the store is empty', async () => {
    const knowledge = await makeService();
    await new AssistantExecutor(knowledge).execute(definition('cto'), 'Hello');
    expect(captured).not.toContain('## Your Knowledge');
    expect(captured).toContain('You are an assistant.');
  });

  it('does not use stale knowledge carried on the definition', async () => {
    // A definition with embedded knowledge must not leak it once the store is
    // the source of truth.
    const knowledge = await makeService();
    const stale = definition('cto');
    stale.knowledge = [{ id: 'stale', title: 'Stale', content: 'OUTDATED INFORMATION' }];

    await new AssistantExecutor(knowledge).execute(stale, 'Hello');

    expect(captured).not.toContain('OUTDATED INFORMATION');
  });
});

describe('knowledge vector sync', () => {
  function embeddingsMock(impl: jest.Mock): EmbeddingsClient {
    return { embed: impl } as unknown as EmbeddingsClient;
  }

  it('upserts a tagged vector on publish (model, dim, contentHash, scope filter)', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1, 0]], model: 'test-embedder', dim: 2 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({
      id: 'legal-core', assistantId: 'legal', scope: 'assistant',
      title: 'Legal Counsel', content: 'Ask for jurisdiction.',
    }));
    await until(() => jest.mocked(artifacts.upsertVector).mock.calls.length > 0);

    expect(embed).toHaveBeenCalledWith(['Legal Counsel\nAsk for jurisdiction.']);
    const [id, vector, meta] = jest.mocked(artifacts.upsertVector).mock.calls[0]!;
    expect(id).toBe('legal-core');
    expect(vector).toEqual([1, 0]);
    expect(meta!.model).toBe('test-embedder');
    expect(meta!.dim).toBe(2);
    expect(meta!.contentHash).toBe(embeddableContentHash(['Legal Counsel', 'Ask for jurisdiction.']));
    expect(meta!.collection).toBe('knowledge');
    expect(meta!.filter).toEqual({ scope: 'assistant', assistantId: 'legal' });
  });

  it('skips the embed when content is unchanged, so boot sync stays free', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1, 0]], model: 'm', dim: 2 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant', title: 'T', content: 'same' }));
    await until(async () => (await artifacts.getVector('legal-core'))?.model === 'm');
    const callsAfterFirstPublish = embed.mock.calls.length;

    // Boot sync republishes identical content on every startup.
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant', title: 'T', content: 'same' }));
    await until(() => embed.mock.calls.length === callsAfterFirstPublish);
    expect(embed.mock.calls.length).toBe(callsAfterFirstPublish);
  });

  it('re-embeds when content changes', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1, 0]], model: 'm', dim: 2 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({ id: 'legal-core', title: 'T', content: 'v1' }));
    await until(async () => (await artifacts.getVector('legal-core')) !== undefined);

    await knowledge.publish(entry({ id: 'legal-core', title: 'T', content: 'v2' }));
    await until(() => embed.mock.calls.length > 1);
    expect(jest.mocked(artifacts.upsertVector).mock.calls.length).toBe(2);
  });

  it('never blocks or fails publish when embedding is unavailable or throws', async () => {
    const unavailable = new KnowledgeService(
      createTestArtifactsService(),
      embeddingsMock(jest.fn(async () => null)),
    );
    await expect(unavailable.publish(entry({ id: 'a', title: 'T', content: 'c' }))).resolves.toMatchObject({ id: 'a' });
    expect(await unavailable.listForAssistant('legal')).toHaveLength(1);

    const failing = new KnowledgeService(
      createTestArtifactsService(),
      embeddingsMock(jest.fn(async () => { throw new Error('brain down'); })),
    );
    await expect(failing.publish(entry({ id: 'b', title: 'T', content: 'c' }))).resolves.toMatchObject({ id: 'b' });
    expect(await failing.listForAssistant('legal')).toHaveLength(1);
  });

  it('deletes the vector on remove', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1]], model: 'm', dim: 1 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({ id: 'legal-core', assistantId: 'legal', scope: 'assistant' }));
    await until(() => jest.mocked(artifacts.upsertVector).mock.calls.length > 0);

    await knowledge.remove('legal-core');
    await until(async () => (await artifacts.getVector('legal-core')) === undefined);
    expect(await artifacts.getVector('legal-core')).toBeUndefined();
  });

  it('deletes vectors of stale entries removed by replaceAssistantKnowledge', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1]], model: 'm', dim: 1 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({ id: 'a', assistantId: 'legal', scope: 'assistant', origin: 'authored' }));
    await knowledge.publish(entry({ id: 'b', assistantId: 'legal', scope: 'assistant', origin: 'authored' }));
    await until(() => jest.mocked(artifacts.upsertVector).mock.calls.length >= 2);

    await knowledge.replaceAssistantKnowledge('legal', [{ id: 'a', title: 'A', content: 'kept' }]);
    await until(async () => (await artifacts.getVector('b')) === undefined);

    expect(await artifacts.getVector('a')).toBeDefined();
    expect(await artifacts.getVector('b')).toBeUndefined();
  });

  it('excludes vectors stored under a different embedding model from search', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1, 0]], model: 'current-model', dim: 2 }));
    const knowledge = new KnowledgeService(artifacts, embeddingsMock(embed));
    await knowledge.publish(entry({ id: 'current-model', assistantId: 'legal', scope: 'assistant' }));
    await knowledge.publish(entry({ id: 'old-model', assistantId: 'legal', scope: 'assistant' }));
    await until(async () => (await artifacts.getVector('old-model')) !== undefined);
    // One of the two vectors was stored by a previous embedding model.
    await artifacts.upsertVector('old-model', [1, 0], { model: 'legacy-model', dim: 2, collection: 'knowledge' });

    const scores = await knowledge.semanticScores([1, 0], 'current-model');
    expect(scores.has('current-model')).toBe(true);
    expect(scores.has('old-model')).toBe(false);
  });
});

describe('entity-memory context and lessons in the prompt', () => {
  const originalFetch = global.fetch;
  const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];

  beforeEach(() => {
    bodies.length = 0;
    global.fetch = jest.fn(async (url: any, init: any) => {
      bodies.push({ url: String(url), body: JSON.parse(init.body) });
      return {
        ok: true, status: 200,
        json: async () => ({ content: 'done', tokensUsed: 1, model: 'test' }),
      } as any;
    }) as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function definition(overrides: Partial<AssistantDefinition>): AssistantDefinition {
    return {
      id: 'legal', tenantId: 'system', name: 'legal',
      description: 'd', systemPrompt: 'You are an assistant.',
      tools: [], metadata: {}, createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    };
  }

  function completeBody(): Record<string, unknown> {
    const complete = bodies.filter((b) => b.url.includes('/api/brain/complete'));
    expect(complete.length).toBeGreaterThan(0);
    return complete[complete.length - 1].body;
  }

  it('sends entityId, assistantId and tenantId on every brain completion', async () => {
    const knowledge = await makeService();
    await new AssistantExecutor(knowledge).execute(definition({ metadata: { entityId: 'ent-1' } }), 'Hello');

    const body = completeBody();
    expect(body.entityId).toBe('ent-1');
    expect(body.assistantId).toBe('legal');
    expect(body.tenantId).toBe('system');
  });

  it('falls back to the assistant id as the entityId slot', async () => {
    const knowledge = await makeService();
    await new AssistantExecutor(knowledge).execute(definition({ metadata: {} }), 'Hello');

    expect(completeBody().entityId).toBe('legal');
    expect(completeBody().assistantId).toBe('legal');
    expect(completeBody().tenantId).toBe('system');
  });

  it('renders high-confidence acquired lessons in their own section, once', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'lesson-1', assistantId: 'legal', scope: 'assistant', origin: 'acquired',
      confidence: 0.9, title: 'Jurisdiction first', content: 'Always confirm the venue.',
    }));
    await knowledge.publish(entry({
      id: 'plain', assistantId: 'legal', scope: 'assistant', origin: 'acquired',
      title: 'Plain note', content: 'No confidence here.',
    }));

    await new AssistantExecutor(knowledge).execute(definition({}), 'Hello');

    const prompt = String(completeBody().systemPrompt);
    expect(prompt).toContain('## Lessons from past missions');
    expect(prompt).toContain('### Jurisdiction first');
    // The lesson is not duplicated in the knowledge section.
    const knowledgeSection = prompt.split('## Lessons from past missions')[0];
    expect(knowledgeSection).not.toContain('### Jurisdiction first');
    expect(knowledgeSection).toContain('### Plain note');
  });

  it('renders no lessons section without qualifying entries', async () => {
    const knowledge = await makeService();
    await knowledge.publish(entry({
      id: 'authored-confident', assistantId: 'legal', scope: 'assistant', origin: 'authored',
      confidence: 1, title: 'Authored', content: 'Confidence is ignored for authored entries.',
    }));
    await knowledge.publish(entry({
      id: 'below-floor', assistantId: 'legal', scope: 'assistant', origin: 'acquired',
      confidence: 0.4, title: 'Weak', content: 'Below the floor.',
    }));

    await new AssistantExecutor(knowledge).execute(definition({}), 'Hello');

    const prompt = String(completeBody().systemPrompt);
    expect(prompt).not.toContain('## Lessons from past missions');
    expect(prompt).toContain('### Authored');
    expect(prompt).toContain('### Weak');
  });

  it('keeps the prompt byte-identical whether embeddings fail or are simply unavailable', async () => {
    const artifacts = createTestArtifactsService();
    const embed = jest.fn(async () => ({ vectors: [[1, 0]], model: 'm', dim: 2 }));
    const working = new KnowledgeService(artifacts, { embed } as unknown as EmbeddingsClient);
    const failing = new KnowledgeService(
      createTestArtifactsService(),
      { embed: jest.fn(async () => { throw new Error('boom'); }) } as unknown as EmbeddingsClient,
    );
    const seeded = entry({
      id: 'shared-1', assistantId: 'legal', scope: 'assistant',
      title: 'Escalation note', content: 'Escalate clinical questions.',
    });
    await working.publish(seeded);
    await failing.publish(seeded);
    await until(() => jest.mocked(artifacts.upsertVector).mock.calls.length > 0);

    const def = definition({});
    await new AssistantExecutor(working).execute(def, 'Hello');
    await new AssistantExecutor(failing).execute(def, 'Hello');
    const [workingPrompt, failingPrompt] = bodies
      .filter((b) => b.url.includes('/api/brain/complete'))
      .map((b) => String(b.body.systemPrompt));

    expect(failingPrompt).toBe(workingPrompt);

    // And that prompt is exactly what the no-model path produces too.
    const noModel = new KnowledgeService(
      createTestArtifactsService(),
      { embed: jest.fn(async () => null) } as unknown as EmbeddingsClient,
    );
    await noModel.publish(seeded);
    await new AssistantExecutor(noModel).execute(def, 'Hello');
    const noModelPrompt = bodies
      .filter((b) => b.url.includes('/api/brain/complete'))
      .map((b) => String(b.body.systemPrompt))
      .pop();
    expect(noModelPrompt).toBe(workingPrompt);
  });
});
