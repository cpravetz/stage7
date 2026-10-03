/**
 * The execution context (ADK_DEVELOPER_GUIDE.md §4).
 *
 * Two things matter here beyond assembling the object.
 *
 * First, the store. `load` runs the collection's hydration adapters and `save`
 * stamps every record, so §5.1's read/write rules hold for a handler that uses
 * the documented API — including a handler that never thought about schema
 * versions at all.
 *
 * Second, degradation. The guide marks `llm`, `knowledge`, `chat` and `tools`
 * as **[PROPOSED]**, so a host may legitimately not have wired them. Every one
 * of those is resolved through a guard that fails loudly and in user-safe terms
 * rather than being `undefined`, which would surface as `TypeError` from inside
 * the handler and hide the real cause behind the escalation card.
 */

import type { SchemaRecord } from '../types';
import type { ExecutionContext, RenderBlock, SkillExecutionResult } from './types';
import {
  HydrationAdapter,
  HydrationRegistry,
  createHydrationRegistry,
  getAdapters,
  hydrateAll,
  stampForWrite,
} from './schema-version';
import { escalationCard, classifyFailure } from './resilience';

export interface StorePort {
  load(collectionName: string): Promise<Record<string, any>[]>;
  save(collectionName: string, docs: Record<string, any>[]): Promise<void>;
}

export interface ExecutionContextPorts {
  store: StorePort;
  /** Merged configuration: configSchema defaults + persisted values. */
  config?: Record<string, any>;
  credentials?: Record<string, string>;
  secrets?: { get(key: string): Promise<string | null> };
  llm?: { generateStructured(prompt: string, outputSchema: SchemaRecord): Promise<any> };
  knowledge?: { query(text: string, opts?: { topK?: number }): Promise<Array<{ text: string; source: string }>> };
  chat?: { ask(question: string): Promise<string>; notify(message: string): Promise<void> };
  tools?: { call(toolId: string, input: any): Promise<SkillExecutionResult> };
  /** Which collections this Skill writes, and at which version. */
  schemaVersion?: number;
  hydration?: HydrationRegistry;
}

function unavailable(capability: string): never {
  throw new Error(`${capability} is not available in this runtime`);
}

/**
 * Builds an ExecutionContext.
 *
 * `schemaVersion` is the writing Skill's declared version; every document it
 * saves is stamped with it, which is what lets a later, newer blueprint tell
 * which records still need upgrading.
 */
export function createExecutionContext(input: any, ports: ExecutionContextPorts): ExecutionContext {
  const hydration = ports.hydration ?? createHydrationRegistry();
  const writeVersion = ports.schemaVersion ?? 1;
  const config = ports.config ?? {};
  const credentials = ports.credentials ?? {};

  const store = {
    async load<T = any>(collectionName: string, defaultValue: T[] = [] as unknown as T[]): Promise<T[]> {
      const docs = await ports.store.load(collectionName);
      const adapters: HydrationAdapter[] = getAdapters(hydration, collectionName);
      if (!Array.isArray(docs) || docs.length === 0) return defaultValue;
      return hydrateAll(docs, adapters, writeVersion) as T[];
    },

    async save<T = any>(collectionName: string, data: T[]): Promise<void> {
      const stamped = (data ?? []).map((doc) => stampForWrite(doc as Record<string, any>, writeVersion));
      await ports.store.save(collectionName, stamped as unknown as Record<string, any>[]);
    },
  };

  const render = {
    text(type: 'report' | 'card' | 'summary', title: string, lines: string[]): RenderBlock {
      return { id: `${type}-${slug(title)}`, title, kind: 'text', body: (lines ?? []).join('\n') };
    },
    markdown(title: string, body: string): RenderBlock {
      return { id: `markdown-${slug(title)}`, title, kind: 'markdown', body: body ?? '' };
    },
    list(title: string, items: string[]): RenderBlock {
      return {
        id: `list-${slug(title)}`,
        title,
        kind: 'text',
        body: (items ?? []).map((item) => `- ${item}`).join('\n'),
      };
    },
  };

  const chatMessages: string[] = [];

  return {
    input,
    config,
    credentials,
    getCredential(logicalKey: string) {
      const value = credentials[logicalKey];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    },
    store,
    render,
    llm: {
      async generateStructured<T = any>(prompt: string, outputSchema: SchemaRecord): Promise<T> {
        if (!ports.llm) return unavailable('ctx.llm.generateStructured');
        return ports.llm.generateStructured(prompt, outputSchema) as Promise<T>;
      },
    },
    knowledge: {
      async query(text: string, opts?: { topK?: number }) {
        if (!ports.knowledge) return unavailable('ctx.knowledge.query');
        return ports.knowledge.query(text, opts);
      },
    },
    chat: {
      async ask(question: string): Promise<string> {
        if (!ports.chat) return unavailable('ctx.chat.ask');
        return ports.chat.ask(question);
      },
      async notify(message: string): Promise<void> {
        chatMessages.push(message);
        if (!ports.chat) return;
        await ports.chat.notify(message);
      },
    },
    tools: {
      async call<T = any>(toolId: string, toolInput: any): Promise<SkillExecutionResult<T>> {
        if (!ports.tools) return unavailable('ctx.tools.call');
        return ports.tools.call(toolId, toolInput) as Promise<SkillExecutionResult<T>>;
      },
    },
    emit: {
      success(result: SkillExecutionResult) {
        return result;
      },
      failure(error: unknown) {
        const classified = classifyFailure(error);
        const card = escalationCard(classified);
        // The sandbox surfaces a Skill's result on stdout, so it has to be
        // printed here or the executor reports "no output".
        console.log(JSON.stringify(card));
      },
      notConnected(reason: string, details: Record<string, any> = {}) {
        return {
          success: false,
          status: 'not-connected',
          data: null,
          error: `Not connected: ${reason}`,
          ...details,
        } as SkillExecutionResult;
      },
    },
  };
}

function slug(title: string): string {
  return String(title ?? 'block')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'block';
}
