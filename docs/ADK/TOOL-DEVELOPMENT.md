# Tool & Skill Development Guide

How to build tools and code skills for the Stage7 assistant runtime.

Tools are **data**, not classes. A tool is a plain object with an id, schemas, and a manifest.
Code skills attach a `handler` function to that object; the factory serialises it into the
executable source the sandbox runs.

For the composition model (workflows, lanes, stages, assistant definitions) see
[ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md).

## What are tools?

Tools are the "actions" or "capabilities" your assistant can perform. They bridge the assistant to
external systems, databases, APIs, or computation.

**Examples:**
- CRM lookup (Salesforce API integration)
- Email sending (SMTP integration)
- Data analysis (computation)
- Document generation (template rendering)
- Calendar management (Google Calendar API)
- Jira ticket creation (project management)

## Creating a tool

A tool that delegates to other tools, or one whose behaviour lives entirely in a handler, is a
**code skill**. Everything else is a declarative tool: schemas, triggers, and configuration only.

### Step 1: Declare the tool with `createTool`

```ts
import { createTool } from '../adk';

export const planningTool = createTool({
  id: 'event_planning_budgeting',
  name: 'Event Planning & Budgeting',
  description: 'Create an event plan and budget.',
  type: 'code',
  inputSchema: {
    type: 'object',
    properties: { eventName: { type: 'string' } },
    required: ['eventName'],
  },
  outputSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' } },
  },
});
```

`outputSchema` is enforced at runtime. A result that does not match is logged and the mismatches are
attached to the execution as `outputSchemaIssues`, so contract drift is observable rather than
silent.

### Step 2: Add a handler with `createDeclarativeCodeSkill`

`createDeclarativeCodeSkill` takes the same identity and schema fields plus a `handler`. It
generates the executable `sourceCode` wrapper and wires persistence, delegation, and rendering.

```ts
import {
  createDeclarativeCodeSkill,
  SchemaProps,
  createSchemaRecord,
} from '../data/skills/code-skill-factory';

export const sendEmail = createDeclarativeCodeSkill({
  id: 'send-email',
  name: 'Send Email',
  description: 'Sends an email to a specified recipient',
  persistenceEnvVar: 'EMAIL_HOME',
  emitEvent: 'email-sent',
  inputSchema: createSchemaRecord({
    to: SchemaProps.text({ description: 'Recipient email' }),
    subject: SchemaProps.text(),
    body: SchemaProps.text({ description: 'Email body (HTML)' }),
    cc: SchemaProps.textArray({ description: 'Optional CC recipients' }),
  }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the email was sent' }),
    data: SchemaProps.object({ messageId: SchemaProps.text(), timestamp: SchemaProps.text() }),
  }),
  handler: async function handler(input, ctx) {
    const to = String(input.to || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { success: false, status: 'invalid-input', error: `Invalid email address: ${to}` };
    }

    const transporter = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      from: process.env.SMTP_FROM,
    });
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: input.subject,
      html: input.body,
    });

    const sent = { messageId: result.messageId, timestamp: new Date().toISOString() };
    ctx.store.save('last-sent', sent);
    const report = ctx.render.text('report', 'Email Sent', [`To: ${to}`, `Message ID: ${sent.messageId}`]);

    return { success: true, status: 'ok', data: sent, present: [report] };
  },
});
```

### Step 3: Register it

Export the skill from the domain's `index.ts` and add it to the domain's skill array (and, when it
belongs to a workflow stage, to that stage's `skillIds`):

```ts
import { leadDealAdvisory } from './lead-deal-advisory';

export const salesSkills = [leadDealAdvisory, /* ... */];
```

## The `ctx` object

| Property        | Type                                                            | Description                                       |
|-----------------|-----------------------------------------------------------------|---------------------------------------------------|
| `ctx.input`     | `Record<string, unknown>`                                       | The validated input object                        |
| `ctx.store`     | `{ collection, load, save, loadAsync, getFilePath, delete, list }` | JSON key-value store resolved from `persistenceEnvVar` |
| `ctx.delegate`  | `(toolId, input) => Promise<any>`                                | Call another skill or tool                        |
| `ctx.render`    | `{ text, markdown, list }`                                      | Build presentation blocks for the UI              |
| `ctx.emit`      | `{ success, failure, notConnected }`                            | Emit the final result envelope                    |

```ts
// Persistence — no fs, no path joins
const previous = ctx.store.load('scored-leads', []);
const filePath = ctx.store.getFilePath('scored-leads');   // for display / diagnostics only
ctx.store.save('scored-leads', next);
const keys = await ctx.store.list();
await ctx.store.delete('scored-leads');

// Delegation
const research = await ctx.delegate('market-research', { query: input.query });
if (research && research.success) {
  // use research.data
} else {
  // record the failure; do not report a complete evaluation you did not perform
}

// Rendering — returns PresentationBlock values for `present`
const report = ctx.render.text('report', 'Lead Scores', ['Line 1', 'Line 2']);
const md = ctx.render.markdown('notes', 'Notes', '## Heading');
const bullets = ctx.render.list('items', 'Items', ['a', 'b']);
```

Delegation returns `{ success, error, ... }` on failure instead of throwing, so always check the
result. Nested execution is bounded by `MAX_NESTING_DEPTH` in the tool executor, and a skill marked
`confirmBeforeSend` cannot be nested unless the caller passes `dryRun: true`.

## Options

| Option              | Type                                          | Description                                                    |
|---------------------|-----------------------------------------------|----------------------------------------------------------------|
| `id`, `name`, `description` | `string`                             | Identity, used for routing and model selection                 |
| `persistenceEnvVar` | `string`                                      | Env var (e.g. `SALES_HOME`) the runtime uses for storage       |
| `emitEvent`         | `string`                                      | Event id emitted on completion; auto-adds an event trigger     |
| `endpointEnvVar`    | `string`                                      | Env var holding the external API endpoint URL                  |
| `credentialSource`  | `Record<string, { vaultSecretId?, envVar?, configKey? }>` | Maps logical keys to vault/env/config sources  |
| `configSchema`      | `SchemaRecord`                                | Documents the operator-supplied configuration                  |
| `confirmBeforeSend` | `boolean`                                     | Requires user confirmation before the skill runs               |
| `tier`              | `'advise' \| 'aid' \| 'represent'`            | Skill action model tier                                        |
| `domainKnowledge`   | `string`                                      | Domain guidance handed to the model                            |
| `triggers`          | `SkillTrigger[]`                              | User, schedule, event, or data triggers                        |
| `timeoutMs`         | `number`                                      | Execution budget                                                |

## Error handling

Handlers do not throw and there is no `ToolExecutionError`. Return a failure envelope:

```ts
return { success: false, status: 'error', error: `Failed to send email: ${err.message}` };
```

Rules that keep output parseable:

- **Return a plain object.** The generated wrapper calls `ctx.emit.success(result)` for you. Do not
  `return ctx.emit.failure(...)`: the handler prints one JSON line and the wrapper prints a second,
  and `JSON.parse` of the skill output then fails.
- **Use method or named-function form** for the handler (`async function handler(input, ctx) { ... }`).
  An arrow like `async (input, ctx) => { ... }` is normalised into invalid JavaScript by the factory.
- **Use `ctx.emit.notConnected(...)` for unconfigured external actions.** It is the intended path for
  a skill whose endpoint env var is unset; it returns the `not-connected` status shape.
- **Wrap `ctx.delegate` in try/catch** when the callee may be unresolvable. It throws synchronously
  in that case, while the `Promise.race` argument list is being evaluated.

## Timeouts and budgets

Bound external work with `Promise.race`, and always clear the timer:

```ts
let budgetTimer: any = null;
try {
  const timeout = new Promise((resolve) => {
    budgetTimer = setTimeout(() => resolve(null), SKILL_BUDGET_MS);
  });
  result = await Promise.race([ctx.delegate('some-skill', input), timeout]);
} catch (err) {
  result = null;
} finally {
  if (budgetTimer) clearTimeout(budgetTimer);
}
```

A pending timer keeps the sandbox node process alive, so a leaked timer makes the run take the full
budget even after the handler has returned — which shows up as a timeout under test and blows past
the request deadline in production.

## Presentation output

A skill controls its own user-facing layout by returning `present` blocks. The contract lives in
[../../shared-nextgen/src/types/common.ts](../../shared-nextgen/src/types/common.ts) and is the only
thing a renderer needs to know:

```ts
export interface PresentationLink {
  label: string;
  url: string;
  detail?: string;
}

export interface PresentationAction {
  type: 'delete';
  label: string;
  target: string;
  collection: string;
  key: string;
  itemId: string;
}

export interface PresentationBlock {
  id: string;
  title?: string;
  body: string;                    // pre-formatted plain text, rendered verbatim
  kind?: 'text' | 'markdown' | string;
  links?: PresentationLink[];      // outbound links rendered under the body
  actions?: PresentationAction[];  // declarative UI actions, e.g. delete a stored item
}
```

- `body` is plain text with the layout you want the user to see; never put raw JSON in it.
- `data` stays available for programmatic consumers and for skills that delegate to you. When
  `present` is present the UI renders `present` and does not dump `data` as JSON.
- `present` is optional. A skill that emits only `data` still renders, via a generic key/value view
  driven by its declared `outputSchema`. Emitting `present` is how you avoid that fallback.
- Declare `present`, `links`, and `actions` in your `outputSchema` when you emit them, so validation
  catches drift.

## Best practices

### 1. Single responsibility

Each skill should do one thing well. Instead of one broad skill:

- ✅ `create-opportunity`
- ✅ `update-contact`
- ✅ `lookup-account`
- ❌ `crm-everything`

### 2. Clear input/output contracts

Schemas are the contract. Keep field names stable and describe every field:

```ts
createSchemaRecord({
  to: SchemaProps.text({ description: 'Recipient email' }),
  subject: SchemaProps.text({ description: 'Email subject' }),
  body: SchemaProps.text({ description: 'Email body (HTML)' }),
  cc: SchemaProps.textArray({ description: 'Optional CC recipients' }),
});
```

### 3. Configuration from the environment, never hardcoded

```ts
// ✅ Good
persistenceEnvVar: 'SALES_HOME',
endpointEnvVar: 'SALESFORCE_API_URL',
credentialSource: {
  apiKey: { envVar: 'SALESFORCE_API_KEY' },
  refreshToken: { vaultSecretId: 'vault/sales/sf-refresh' },
};

// ❌ Avoid
credentialSource: { apiKey: { envVar: 'sk-1234567890abcdef' } };
```

```bash
# In .env or deployment config
SALES_HOME=/var/lib/stage7/sales
SALESFORCE_API_URL=https://example.my.salesforce.com
SALESFORCE_API_KEY=xxxxxxxx
EXTERNAL_API_TIMEOUT=30000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=app-specific-password
```

### 4. Stateless handlers

Handlers are invoked per execution. Anything that must survive between runs belongs in `ctx.store`:

```ts
// ❌ WRONG: closure-held state
const history = [];
handler: async function handler(input, ctx) { history.push(input); }

// ✅ RIGHT: persisted state
const history = ctx.store.load('history', []);
ctx.store.save('history', history);
```

### 5. Retry with backoff, then report

```ts
let lastError = '';
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await ctx.delegate('some-skill', input);
  } catch (err) {
    lastError = String(err);
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}
return { success: false, status: 'error', error: lastError };
```

### 6. Log through the result, not stdout

`console.log` inside a handler corrupts the captured stdout the executor parses. Return data or
build a presentation block instead:

```ts
// ❌ Wrong
console.log(`[send-email] sent to ${input.to}`);

// ✅ Right
return {
  success: true,
  status: 'ok',
  data: { to: input.to },
  present: [ctx.render.text('report', 'Email Sent', [`To: ${input.to}`])],
};
```

## Testing

A declarative skill's real behaviour lives in `manifest.sourceCode`, the generated script the
sandbox runs. Assert on that emitted script, not just on the tool object: the factory rewrites the
handler (type stripping, `ctx` wiring), so the emitted text is what counts.

### Unit test: assert on the emitted source

```ts
import { sendEmail } from './send-email';

describe('send-email generated source', () => {
  const source = sendEmail.manifest.sourceCode as string;
  if (typeof source !== 'string') {
    throw new Error('send-email.manifest.sourceCode is missing; the guards below would be vacuous');
  }

  it('contains no raw filesystem access', () => {
    expect(source).not.toMatch(/\brequire\(['"]fs['"]\)/);
    expect(source).not.toMatch(/\bfs\.(readFileSync|writeFileSync|existsSync)/);
  });

  it('does not log to stdout outside the emit path', () => {
    // stdout is what the executor parses; stray output makes the result unparseable.
    const logLines = source.split('\n').filter((line) => /console\.log\(/.test(line));
    expect(logLines).toEqual([]);
  });

  it('declares the persistence env var on the generated wrapper', () => {
    expect(source).toContain('EMAIL_HOME');
  });
});
```

### End-to-end test: run the skill through the executor

For behaviour, drive the skill through `ToolExecutor` the way production does. `CodeExecutor`
spawns a real `node` child, so control the network with a `NODE_OPTIONS=--require <preload>`
interceptor rather than an in-process `global.fetch` mock.

```ts
import { ToolExecutor } from '../../services/ToolExecutor';
import { sendEmail } from './send-email';

const executor = new ToolExecutor();

async function runSkill(input: Record<string, unknown>) {
  // execute() resolves a ToolExecution whose `output` is already the parsed
  // object the skill emitted on stdout.
  const execution = await executor.execute(sendEmail, input);
  if (execution.status !== 'completed') {
    throw new Error(execution.error ?? `skill exited ${execution.status}`);
  }
  return execution.output ?? {};
}

describe('send-email', () => {
  it('reports a failure envelope for an invalid address', async () => {
    const out = await runSkill({ to: 'invalid-email', subject: 'Test', body: 'Test' });
    expect(out.success).toBe(false);
    expect(out.error).toContain('Invalid email address');
  }, 30000);

  it('emits exactly one JSON line on the success path', async () => {
    const out = await runSkill({ to: 'test@example.com', subject: 'Test', body: 'Test' });
    expect(out.success).toBe(true);
    expect(out.data.messageId).toBe('msg-123');
  }, 30000);
});
```

Give any test that spawns the sandbox an explicit `timeout` — a leaked `setTimeout` in a handler
holds the child process open and makes a fast skill look like a hanging one.

### Output contract test

Validate results against the declared schema so contract drift fails loudly, matching what the
executor does at runtime:

```ts
import { validateAgainstOutputSchema } from '../../utils/schemaValidator';

it('result matches its declared outputSchema', async () => {
  const out = await runSkill({ to: 'test@example.com', subject: 'Test', body: 'Test' });
  expect(validateAgainstOutputSchema(out, sendEmail.outputSchema)).toEqual([]);
}, 30000);
```

## Deploying

1. **Create the skill file** under `services/tool-executor/src/data/skills/<domain>/`
2. **Register it** in that domain's `index.ts` skill array
3. **Build**: `npm run build` in `services/tool-executor`
4. **Test**: `npm test`
5. **Run**: `npm start`

Skills are discovered from the registry when the assistant starts.

---

See [ADK_DEVELOPER_GUIDE.md](./ADK_DEVELOPER_GUIDE.md) for workflows and assistant definitions, and
[README.md](./README.md) for integration examples.
