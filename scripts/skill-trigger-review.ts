/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Individual review of Skills that expose required inputs but declare no User trigger.
 *
 * For each Skill this reports the facts that decide the trigger, read from the
 * handler's own source rather than inferred from the name:
 *
 *   usesInput   - every required input name is actually read by the handler
 *                 (an input nothing reads cannot be supplied by anything, and is
 *                 dead weight rather than a payload)
 *   obtainsData - the handler reaches out for its own data: an outbound fetch, or
 *                 a call into a base tool via lowerOrderTools / tools.execute.
 *                 A Skill that obtains its data can be schedule/event driven.
 *   blocksOnMissing - the handler refuses to produce output when the input is
 *                 absent. This is the strongest evidence available: with no User
 *                 trigger nothing can ever supply it, so the Skill is unreachable.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const D = path.join(ROOT, 'services/tool-executor/src/data/skills');
const A = path.join(ROOT, 'services/worker-pool/assistants');
const DESIGN = path.join(ROOT, 'docs/assistants_design_0922_v7.md');

interface Toolish {
  id: string;
  tier?: string;
  triggers?: Array<{ kind: string }>;
  manifest?: { lowerOrderTools?: string[]; endpointEnvVar?: string; consumes?: string[]; configSchema?: unknown };
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}

function designFor(id: string): { trigger: string; tier: string } {
  const line = fs.readFileSync(DESIGN, 'utf8').split('\n').find((l) => l.startsWith(`| ${id} |`) || l.startsWith(`| ${id} `));
  if (!line) return { trigger: 'not-in-doc', tier: '?' };
  const c = line.split('|').map((x) => x.trim());
  return { tier: c[3] ?? '?', trigger: (c[4] ?? '?').replace(/\*\*/g, '').split('—')[0].trim() };
}

const byId = new Map<string, Toolish>();
const files: string[] = [];
const walkDir = (dir: string): void => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
};
walkDir(D);
const fileText = new Map<string, string>();
for (const f of files) {
  fileText.set(f, fs.readFileSync(f, 'utf8'));
  let m: Record<string, unknown>;
  try {
    m = require(f);
  } catch {
    continue;
  }
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const it of v) if (it && typeof it === 'object' && typeof (it as Toolish).id === 'string' && (it as Toolish).inputSchema) byId.set((it as Toolish).id, it as Toolish);
      return;
    }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(m);
}

const boundBy = new Map<string, string[]>();
for (const a of fs.readdirSync(A).sort()) {
  const p = path.join(A, a, 'assistant.json');
  if (!fs.existsSync(p)) continue;
  for (const t of JSON.parse(fs.readFileSync(p, 'utf8')).tools ?? []) {
    const id = typeof t === 'string' ? t : t.name;
    boundBy.set(id, [...(boundBy.get(id) ?? []), a]);
  }
}

interface Finding {
  id: string; assistants: string[]; file: string; designTrigger: string; codeTrigger: string; tier: string;
  required: string[]; unused: string[];
  obtainsData: string | null; blocksOnMissing: boolean; consumes: number; lowerOrder: string[];
}

const findings: Finding[] = [];

for (const [id, tool] of byId) {
  const trig = tool.triggers ?? [];
  if (trig.some((t) => t.kind === 'user')) continue;
  if (!boundBy.has(id)) continue; // Group A: unbound base tools, out of scope
  const required = ((tool.inputSchema?.required ?? []) as string[]).filter((r) => Object.keys(tool.inputSchema?.properties ?? {}).includes(r));
  if (!required.length) continue; // Group D: zero required inputs, coherent

  // Handler text must be scoped to THIS skill. Several files declare more than one
  // skill (cto/index.ts holds ten), so searching the whole file would credit one
  // skill with another's fetch call or endpoint.
  const hit = [...fileText.entries()].find(([, t]) => t.includes(`id: '${id}'`) || t.includes(`id: "${id}"`));
  const whole = hit?.[1] ?? '';
  let src = whole;
  if (hit) {
    const at = whole.search(new RegExp(`id: ['"]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
    const after = at >= 0 ? whole.slice(at + 1) : whole;
    const next = after.search(/\n\s*id:\s*['"]/);
    src = at >= 0 ? (at + 1) + (next >= 0 ? after.slice(0, next) : after) : whole;
  }
  const lower = tool.manifest?.lowerOrderTools ?? [];

  // An input counts as read if the handler touches it directly or aliases it
  // first (`const x = input.y`). Aliasing is the common shape here.
  //
  // External-action skills are exempt: createExternalActionSkill generates a
  // handler that stringifies the whole input as the request body
  // (code-skill-factory.ts:256), so every declared input is consumed by being
  // forwarded. Their handler lives in a generated string, not in the .ts source,
  // so a text search for `input.<name>` would wrongly report them as unused.
  const isExternalAction = /createExternalActionSkill/.test(src) || /createExternalActionSkill/.test(whole);
  const reads = (r: string): boolean => {
    if (isExternalAction) return true;
    if (new RegExp(`input\\.${r}\\b`).test(src)) return true;
    const alias = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;\\n]*input\\.${r}\\b`).exec(src);
    return Boolean(alias && alias[1] && new RegExp(`\\b${alias[1]}\\b`).test(src.split('\n').slice(1).join('\n')));
  };
  const unused = required.filter((r) => !reads(r));

  let obtainsData: string | null = null;
  if (/\bfetch\s*\(/.test(src)) obtainsData = 'fetch() in handler';
  else if (lower.length) obtainsData = `base tool: ${lower.join(', ')}`;
  else if (/tools\.(execute|run|invoke)|__execute_tool|ctx\.tools/.test(src)) obtainsData = 'calls tools.*';

  // "Not connected: no X were supplied" and similar: the skill returns
  // success:false purely because the input is absent. With no User trigger
  // nothing can supply it, so this Skill is unreachable as bound.
  const notConnectedOnMissing = /[Nn]ot connected[^'"\n]{0,40}(no|not)\b[^'"\n]{0,40}(supplied|provided)/.test(src)
    || /(no|not)\s+\w{0,24}\s*(supplied|provided)/.test(src);

  // Refuses to produce output when the input is absent, either by testing the
  // input directly or by testing an alias of it.
  const blocks = notConnectedOnMissing || required.some((r) => {
    if (new RegExp(`if\\s*\\(\\s*!input\\.${r}\\b`).test(src)) return true;
    const alias = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;\\n]*input\\.${r}\\b`).exec(src);
    if (alias && alias[1] && new RegExp(`if\\s*\\(\\s*!${alias[1]}\\b`).test(src)) return true;
    return /(?:no|not)\s+\w{0,20}\s*(supplied|provided)/i.test(src);
  });

  const d = designFor(id);
  findings.push({
    id, assistants: boundBy.get(id) ?? [], file: path.relative(ROOT, src ? [...fileText.entries()].find(([, t]) => t.includes(`id: '${id}'`))?.[0] ?? '' : ''),
    designTrigger: d.trigger, codeTrigger: trig.map((t) => t.kind).join('+') || 'none', tier: tool.tier ?? d.tier,
    required, unused, obtainsData, blocksOnMissing: blocks, consumes: (tool.manifest?.consumes ?? []).length, lowerOrder: lower,
  });
}

const pad = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '~' : s).padEnd(n);
console.log(pad('SKILL ID', 44) + pad('ASSISTANT', 11) + pad('v7', 10) + pad('TIER', 10) + pad('REQUIRING', 26) + pad('OBTAINS OWN DATA', 22) + 'BLOCKS IF MISSING');
console.log('-'.repeat(140));
for (const f of findings.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(
    pad(f.id, 44) + pad(f.assistants.join(','), 11) + pad(f.designTrigger, 10) + pad(f.tier ?? '?', 10) +
    pad(f.required.join(', ') + (f.unused.length ? ` (UNUSED: ${f.unused.join(',')})` : ''), 26) +
    pad(f.obtainsData ?? 'no', 22) + (f.blocksOnMissing ? 'YES' : '-')
  );
}
console.log('-'.repeat(140));
console.log(`total: ${findings.length}`);
console.log(`cannot obtain own data, blocks when input missing : ${findings.filter((f) => !f.obtainsData && f.blocksOnMissing).length}`);
console.log(`cannot obtain own data, does not block           : ${findings.filter((f) => !f.obtainsData && !f.blocksOnMissing).length}`);
console.log(`can obtain own data                              : ${findings.filter((f) => f.obtainsData).length}`);
console.log(`declared an input never read by the handler      : ${findings.filter((f) => f.unused.length).length} -> ${findings.filter((f) => f.unused.length).map((f) => `${f.id}(${f.unused.join('+')})`).join(', ')}`);
