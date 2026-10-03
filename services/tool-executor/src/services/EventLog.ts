/**
 * The durable event log.
 *
 * Every completed Skill run appends one record here. The event already reached
 * its in-process subscribers synchronously, from the executor; this exists so
 * there is a *record* — an audit trail of what changed, ordered and queryable,
 * and the thing an operator reads when asked "what ran, and what did it touch".
 *
 * It is deliberately best-effort and never throws. A Skill that has already
 * changed data must not be reported as failed because the log write did not land,
 * so a persistence outage degrades the audit trail and nothing else.
 *
 * Storage mirrors `TriggerRecordStore`: the Mongo-backed artifacts service first,
 * a local JSON file mirror always, reads that prefer the remote copy. That keeps
 * the event log from becoming a hard dependency of execution.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import type { SkillEvent } from '../adk/events';

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || '';
const LOCAL_LOG_DIR = process.env.EVENT_LOG_DIR || '/tmp/stage7-events';
const REMOTE_TIMEOUT_MS = Number(process.env.EVENT_LOG_TIMEOUT_MS) || 3000;

/** Collection the log lives in, alongside `trigger-records` and `watches`. */
export const EVENT_LOG_COLLECTION = 'assistant-events';

/** How many local lines to scan. The log is a fallback, not the system of record. */
const MAX_LOCAL_EVENTS_SCANNED = 400;

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 128) || 'event';
}

async function artifactsFetch(route: string, init?: RequestInit): Promise<any | null> {
  if (!ARTIFACTS_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ARTIFACTS_URL}/api/artifacts/documents${route}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...init,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Event log persistence unavailable');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Append locally. The document id encodes the event id and the timestamp, so two
 * runs of the same Skill never overwrite each other's record — an event log that
 * keeps only the latest event is not a log.
 */
function appendLocal(event: SkillEvent): void {
  const id = `${safeId(event.id)}-${event.emittedAt.replace(/[:.]/g, '-')}`;
  const target = path.join(LOCAL_LOG_DIR, `${safeId(event.id)}.jsonl`);
  try {
    fs.mkdirSync(LOCAL_LOG_DIR, { recursive: true });
    const line = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(target, line, 'utf8');
    if (!fs.existsSync(path.join(LOCAL_LOG_DIR, `${id}.json`))) {
      // A per-event file is written too so the common single-event lookup is a
      // read rather than a scan of the whole log.
      fs.writeFileSync(path.join(LOCAL_LOG_DIR, `${id}.json`), line, 'utf8');
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Local event log write failed');
  }
}

export interface EventLog {
  /** Append one event. Resolves true when it reached the remote store. */
  append(event: SkillEvent): Promise<boolean>;
  /** Recent events, newest first. */
  recent(limit?: number): Promise<SkillEvent[]>;
  /** Events a given skill announced. */
  bySkill(skillId: string, limit?: number): Promise<SkillEvent[]>;
}

/**
 * Store used in production. Remote-first with a local fallback, matching the
 * skill store and the trigger record store so there is one persistence idiom in
 * this service rather than three.
 */
export function createEventLog(): EventLog {
  return {
    async append(event: SkillEvent): Promise<boolean> {
      const persisted = await artifactsFetch('', {
        method: 'POST',
        body: JSON.stringify({
          id: `${EVENT_LOG_COLLECTION}:${safeId(event.id)}:${event.emittedAt}`,
          tenantId: 'default',
          collection: EVENT_LOG_COLLECTION,
          data: event,
        }),
      });
      // Always mirror locally, even on a successful remote write: a later read
      // that loses the artifacts service should still find the event.
      appendLocal(event);
      return persisted !== null;
    },

    async recent(limit = 50): Promise<SkillEvent[]> {
      const result = await artifactsFetch('/search', {
        method: 'POST',
        body: JSON.stringify({ collection: EVENT_LOG_COLLECTION, limit: Math.max(limit, 1) * 4 }),
      });
      const fromRemote = ((result?.documents as any[]) ?? [])
        .map((doc) => doc?.data ?? doc)
        .filter((entry): entry is SkillEvent => Boolean(entry) && typeof entry.emittedAt === 'string');

      const fromLocal = readLocalRecent();
      const merged = new Map<string, SkillEvent>();
      for (const event of [...fromLocal, ...fromRemote]) {
        merged.set(`${event.id}@${event.emittedAt}`, event);
      }
      return [...merged.values()]
        .sort((a, b) => (a.emittedAt < b.emittedAt ? 1 : -1))
        .slice(0, limit);
    },

    async bySkill(skillId: string, limit = 50): Promise<SkillEvent[]> {
      return (await this.recent(200)).filter((event) => event.skillId === skillId).slice(0, limit);
    },
  };
}

function readLocalRecent(): SkillEvent[] {
  const events: SkillEvent[] = [];
  let files: string[];
  try {
    files = fs.existsSync(LOCAL_LOG_DIR) ? fs.readdirSync(LOCAL_LOG_DIR) : [];
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to read local event log');
    return events;
  }
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    try {
      const contents = fs.readFileSync(path.join(LOCAL_LOG_DIR, file), 'utf8');
      for (const line of contents.split('\n')) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as SkillEvent);
        } catch {
          // A truncated final line from an interrupted write is not worth failing over.
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to read an event log file');
    }
  }
  // Newest last per file; the files themselves are unordered, so the cap keeps
  // the scan bounded without pretending to be the most recent window.
  return events.slice(-MAX_LOCAL_EVENTS_SCANNED);
}

/** In-memory log for tests and for running without any persistence at all. */
export function createInMemoryEventLog(): EventLog & { entries: SkillEvent[] } {
  const entries: SkillEvent[] = [];
  return {
    entries,
    async append(event) {
      entries.push(event);
      return true;
    },
    async recent(limit = 50) {
      return entries.slice(-limit).reverse();
    },
    async bySkill(skillId, limit = 50) {
      return entries.filter((event) => event.skillId === skillId).slice(-limit).reverse();
    },
  };
}