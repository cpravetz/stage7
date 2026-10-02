/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Report: Skills that expose inputs in inputSchema but declare no User trigger.
 *
 * A Skill with a User trigger can be run by a person, who fills those inputs in
 * the Overview panel. A Skill without one cannot: its inputs can only ever be
 * supplied by whatever invokes it (an event payload, a schedule reading a
 * configured source, or a wired connector). Whether that is coherent is a
 * per-Skill judgement, so this dumps the facts rather than deciding.
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
  triggers?: Array<{ kind: string; on?: string; cadence?: string }>;
  manifest?: { lowerOrderTools?: string[]; endpointEnvVar?: string; configSchema?: unknown; consumes?: string[]; produces?: string[] };
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}

/** Trigger + tier the design doc assigns each skill id, for comparison. */
function designFor(id: string): { trigger: string; tier: string } {
  if (!fs.existsSync(DESIGN)) return { trigger: '?', tier: '?' };
  const line = fs
    .readFileSync(DESIGN, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`| ${id} |`) || l.startsWith(`| ${id} `));
  if (!line) return { trigger: 'not-in-doc', tier: '?' };
  const cells = line.split('|').map((c) => c.trim());
  return { tier: cells[3] ?? '?', trigger: (cells[4] ?? '?').replace(/\*\*/g, '').split('—')[0].trim() };
}

const byId = new Map<string, Toolish>();
const files: string[] = [];
for (const e of fs.readdirSync(D, { withFileTypes: true })) {
  if (e.isDirectory()) {
    const i = path.join(D, e.name, 'index.ts');
    if (fs.existsSync(i)) files.push(i);
  } else if (e.name.endsWith('.ts')) files.push(path.join(D, e.name));
}
for (const f of files) {
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

const rows: Array<{
  id: string; assistants: string[]; designTrigger: string; codeTrigger: string;
  required: string[]; optional: string[]; consumes: number; dataSource: string; tier: string;
}> = [];

for (const [id, tool] of byId) {
  const trig = tool.triggers ?? [];
  if (trig.some((t) => t.kind === 'user')) continue;
  const props = Object.keys(tool.inputSchema?.properties ?? {});
  if (!props.length) continue;
  const required = (tool.inputSchema?.required ?? []) as string[];
  const consumes = (tool.manifest?.consumes ?? []).length;
  const endpoint = Boolean(tool.manifest?.endpointEnvVar);
  const config = Boolean(tool.manifest?.configSchema);
  const lower = (tool.manifest?.lowerOrderTools ?? []).length;
  const dataSource = consumes
    ? `${consumes} consumes`
    : endpoint
      ? 'endpoint'
      : lower
        ? `${lower} lowerOrder`
        : config
          ? 'config only'
          : 'NONE';
  const d = designFor(id);
  rows.push({
    id,
    assistants: boundBy.get(id) ?? [],
    designTrigger: d.trigger,
    codeTrigger: trig.map((t) => t.kind).join('+') || 'none',
    required: required.filter((r) => props.includes(r)),
    optional: props.filter((p) => !required.includes(p)),
    consumes,
    dataSource,
    tier: tool.tier ?? d.tier,
  });
}

rows.sort((a, b) => Number(b.required.length) - Number(a.required.length) || a.id.localeCompare(b.id));

const line = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n);
console.log(
  line('SKILL ID', 44) + line('ASSISTANT', 12) + line('v7 TRIG', 11) + line('CODE TRIG', 10) +
  line('TIER', 10) + line('SRC', 14) + 'REQUIRED INPUTS'
);
console.log('-'.repeat(150));
for (const r of rows) {
  const req = r.required.length ? r.required.join(', ') : '(none)';
  const opt = r.optional.length ? `  [+${r.optional.length} optional: ${r.optional.join(', ')}]` : '';
  console.log(
    line(r.id, 44) + line(r.assistants.join(',') || '(unbound)', 12) + line(r.designTrigger, 11) +
    line(r.codeTrigger, 10) + line(r.tier ?? '?', 10) + line(r.dataSource, 14) + req + opt
  );
}
console.log('-'.repeat(150));
console.log(`total: ${rows.length}`);
const byDesign = new Map<string, number>();
for (const r of rows) byDesign.set(r.designTrigger, (byDesign.get(r.designTrigger) ?? 0) + 1);
console.log('by v7 trigger:', [...byDesign.entries()].map(([k, v]) => `${k}=${v}`).join('  '));
console.log('with >=1 required input:', rows.filter((r) => r.required.length).length);
console.log('with 0 required inputs  :', rows.filter((r) => !r.required.length).length);
console.log('with no data source at all:', rows.filter((r) => r.dataSource === 'NONE').length);
