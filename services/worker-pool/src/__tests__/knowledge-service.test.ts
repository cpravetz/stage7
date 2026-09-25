import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { KnowledgeService } from '../services/KnowledgeService';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { toStoredAuthoredEntry } from '../data/assistantKnowledge';
import type { AssistantDefinition, StoredKnowledgeEntry } from '@stage7-nextgen/shared';

async function makeService(): Promise<KnowledgeService> {
  const artifacts = new ArtifactsService();
  await artifacts.ready();
  return new KnowledgeService(artifacts);
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
