/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Diagnostic only. Reproduces the exact OverviewPanel visibility predicate
 * (frontend-nextgen/src/panels/OverviewPanel.tsx:135-151) for every bound skill.
 *
 * Renders only when:  inAvailableSkills && hasInputProps && hasUserTrigger
 *   inAvailableSkills <- EntityWorkspace.tsx:110-115 isSkillTool()
 *   hasUserTrigger    <- OverviewPanel.tsx:69-73 isUserTriggered(), resolved via
 *                        availableSkills, so a skill absent from that list is
 *                        never user-triggered either.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'services', 'tool-executor', 'src', 'data', 'skills');
const ASSISTANTS_DIR = path.join(ROOT, 'services', 'worker-pool', 'assistants');

interface Toolish {
  id: string;
  isSkill?: boolean;
  triggers?: Array<{ kind: string }>;
  manifest?: { lowerOrderTools?: string[]; sourceCode?: string };
  inputSchema?: { properties?: Record<string, unknown> };
}

function loadAll(): Map<string, Toolish> {
  const byId = new Map<string, Toolish>();
  const files: string[] = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const idx = path.join(SKILLS_DIR, entry.name, 'index.ts');
      if (fs.existsSync(idx)) files.push(idx);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(path.join(SKILLS_DIR, entry.name));
    }
  }
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
        mod = require(file);
    } catch {
      continue;
    }
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && typeof (item as Toolish).id === 'string' && (item as Toolish).inputSchema) {
            byId.set((item as Toolish).id, item as Toolish);
          }
        }
        return;
      }
      if (value && typeof value === 'object') for (const v of Object.values(value)) visit(v);
    };
    visit(mod);
  }
  return byId;
}

const allById = loadAll();

const out: Array<{
  assistant: string;
  bound: number;
  rendered: number;
  runnable: number;
  reasons: Record<string, number>;
  detail: string[];
}> = [];

for (const assistant of fs.readdirSync(ASSISTANTS_DIR).sort()) {
  const jsonPath = path.join(ASSISTANTS_DIR, assistant, 'assistant.json');
  if (!fs.existsSync(jsonPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { tools?: Array<{ name?: string } | string> };
  const bound = (manifest.tools ?? []).map((t) => (typeof t === 'string' ? t : t.name ?? String(t)));

  const reasons: Record<string, number> = {};
  const detail: string[] = [];
  let rendered = 0;
  let runnable = 0;

  for (const id of bound) {
    const t = allById.get(id);
    if (!t) {
      reasons['binding-does-not-resolve'] = (reasons['binding-does-not-resolve'] ?? 0) + 1;
      detail.push(`${id} [binding does not resolve to any Skill]`);
      continue;
    }
    // The panel renders a card for every bound skill. A skill whose honest
    // trigger is Schedule/Event shows the "no Run button, not run yet" message
    // instead of its input fields; one with a User trigger shows the fields and
    // a Run button. Neither is hidden.
    rendered++;
    const userTriggered = (t.triggers ?? []).some((x) => x.kind === 'user');
    if (userTriggered) runnable++;
    else {
      const trig = (t.triggers ?? []).map((x) => x.kind).join('+') || 'none';
      detail.push(`${id} [card + "not run yet" message; triggers=${trig}]`);
    }
  }

  out.push({ assistant, bound: bound.length, rendered, runnable, reasons, detail });
}

console.log(['assistant'.padEnd(13), 'bound', 'VISIBLE', 'runnable'].join('  ') + '   unresolvable bindings');
console.log('-'.repeat(105));
for (const r of out) {
  const bd = Object.entries(r.reasons).map(([k, v]) => `${v} ${k}`).join(', ') || '-';
  console.log(
    [r.assistant.padEnd(13), String(r.bound).padStart(4), String(r.rendered).padStart(7), String(r.runnable).padStart(8)].join('  ') + '   ' + bd
  );
}
console.log('-'.repeat(105));
const zero = out.filter((r) => r.rendered === 0).map((r) => r.assistant);
console.log('Skill-less (0 visible):', zero.join(', ') || 'none');
const broken = out.filter((r) => Object.keys(r.reasons).length);
console.log('With unresolvable bindings:', broken.map((r) => `${r.assistant}(${r.reasons['binding-does-not-resolve']})`).join(', ') || 'none');
