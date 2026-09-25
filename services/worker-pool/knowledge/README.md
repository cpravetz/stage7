# Assistant Knowledge

## Where knowledge lives

Knowledge is stored in the artifacts service `documents` collection, under
`collection: 'knowledge'`. Each document's `data` is a `StoredKnowledgeEntry`:

```ts
{
  id: string;
  title: string;
  content: string;
  source?: string;              // repo path for authored entries
  tags?: string[];
  domain?: string;
  assistantId: string | null;   // null => shared
  scope: 'assistant' | 'shared';
  origin: 'authored' | 'acquired';
}
```

| Field | Meaning |
| --- | --- |
| `scope: 'assistant'` | Owned by one assistant. Returned only to that assistant. |
| `scope: 'shared'` | Offered to every assistant and agent. |
| `origin: 'authored'` | Committed as a file under `services/worker-pool/knowledge/assistants/`. |
| `origin: 'acquired'` | Derived at runtime. See "Acquisition" below. |

## Authored knowledge

Each canonical assistant has a text file at
`services/worker-pool/knowledge/assistants/<assistantId>.txt`. The file is the
source of truth for that assistant's knowledge.

Format: an optional leading `# Title` heading, which becomes the entry title,
followed by the body, which is used verbatim as the entry content.

Files are read at startup by `src/data/assistantKnowledge.ts` and published into
the knowledge store by `syncAuthoredKnowledge` in `src/index.ts`. The sync is
idempotent and runs on every boot, so editing a file takes effect on restart.

A missing, empty, or heading-less file is a **startup error**, not an empty
knowledge base. An assistant that appears to have knowledge but has none is
indistinguishable, to an operator, from an assistant with no knowledge
configured.

## Runtime use

`AssistantExecutor` reads knowledge from the store on **every execution** rather
than from the assistant definition, and renders it into the system prompt under
`## Your Knowledge`. The store is therefore on the critical path for every model
call.

`AssistantDefinition.knowledge` is retained only as the authored snapshot carried
through registration. It is never read by the executor, so stale embedded
knowledge cannot reach a prompt — there is a test asserting this.

## Durability

Knowledge is persisted in MongoDB (`MONGO_DB`, default `stage7`) in the
`documents` collection. Acquired knowledge therefore survives process restarts
and rebuilds, as long as the `mongo_data` volume persists.

Startup is fail-fast: if `MONGO_URI` is set but Mongo cannot be reached,
worker-pool retries five times and then **refuses to start** rather than falling
back to an in-memory store, because every knowledge write would silently be lost
on the next restart. If `MONGO_URI` is unset entirely, the in-memory store is
used and a warning is logged, since no volume is expected in that mode.

`docker-compose.yaml` gives worker-pool `depends_on: mongo` with
`condition: service_healthy`, so it does not race Mongo startup in normal
operation. `restart: unless-stopped` means a transient Mongo outage results in a
restart, not a permanently degraded worker-pool.

## Overwrite protection

Acquired knowledge is never overwritten by the authored path, because it cannot
be reconstructed from a file:

- `replaceAssistantKnowledge` (startup file sync **and** the configuration UI)
  only reconciles entries the assistant owns that are `origin: 'authored'`.
  Acquired entries are skipped entirely.
- `publish` refuses to overwrite an existing `acquired` entry with authored
  content, and logs an error if ids collide.

This matters most for the configuration UI: it submits only the authored entries
it loaded, so without this protection saving an assistant in the UI would
silently erase everything that assistant had learned.

Acquired knowledge is changed deliberately, via `POST /api/workers/knowledge`
(update) or `DELETE /api/knowledge/:id` (remove).

## Editing knowledge

Two paths write authored knowledge:

- **Configuration UI** — `PUT /api/workers/assistants/:id` with a `knowledge`
  array calls `KnowledgeService.replaceAssistantKnowledge`, which publishes the
  supplied entries and removes ones the assistant owned but that are no longer
  present.
- **Direct API** — `POST /api/workers/knowledge` and `DELETE /api/workers/knowledge/:id`.

Because the file sync runs on every boot, a UI edit to authored knowledge is
overwritten by the authored file on restart. That is deliberate: files are the
source of truth for authored knowledge. Acquired knowledge is not affected.

## Read APIs

- `GET /api/workers/assistants/:id/knowledge` — exactly what that assistant is
  given at execution time: its own entries plus all shared entries.
- `GET /api/workers/knowledge` — the full store.

The Canvas page (`frontend-nextgen/src/pages/Canvas.tsx`) reads these endpoints.
Its edges are derived from real shared tool bindings between assistants, not
generated.

## Acquisition (not implemented)

Nothing currently creates `origin: 'acquired'` entries automatically. The
intended mechanism is deriving knowledge from an assistant's own reflective LLM
output, but that design is not settled and is deliberately left unimplemented
rather than stubbed.

Until it is, `POST /api/workers/knowledge` is the only way to record acquired
knowledge, and the `origin: 'acquired'` and `scope: 'shared'` fields are read and
stored but never written by the automated path.
