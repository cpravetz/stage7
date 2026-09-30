/**
 * One-off: dump live registry facts so the audit report quotes measured values
 * instead of remembered ones. Run with: npx ts-node scripts/registry-audit-facts.ts
 */
import {
  assistantRegistries,
} from '../services/tool-executor/src/data/skills/registry';
import {
  careerSkills, restaurantSkills, productSkills, contentSkills, legalSkills, salesSkills,
  educationSkills, hrSkills, executiveSkills, ctoSkills, hotelSkills, sportsSkills,
  eventSkills, marketingSkills, supportSkills, analyticsSkills,
  financeSkills, healthcareSkills, investmentSkills, scriptwritingSkills, songwritingSkills,
} from '../services/tool-executor/src/data/skills';

const all: any[] = ([
  careerSkills, restaurantSkills, productSkills, contentSkills, legalSkills, salesSkills,
  educationSkills, hrSkills, executiveSkills, ctoSkills, hotelSkills, sportsSkills,
  eventSkills, marketingSkills, supportSkills, analyticsSkills,
  financeSkills, healthcareSkills, investmentSkills, scriptwritingSkills, songwritingSkills,
] as any[]).flat().filter(Boolean);

const userFacing = all.filter((s) => s.isSkill !== false);

console.log('=== COUNTS ===');
console.log('assistants:', Object.keys(assistantRegistries).length);
console.log('total registered skills:', all.length);
console.log('user-facing (isSkill !== false):', userFacing.length);
console.log('base tools (isSkill === false):', all.length - userFacing.length);

console.log('\n=== USER-FACING MISSING tier ===');
const noTier = userFacing.filter((s) => !s.tier);
console.log(noTier.length, noTier.map((s) => s.id).join(', ') || '(none)');

console.log('\n=== BASE TOOLS WITH A tier (should be none) ===');
const baseWithTier = all.filter((s) => s.isSkill === false && s.tier);
console.log(baseWithTier.length, baseWithTier.map((s) => `${s.id}=${s.tier}`).join(', ') || '(none)');

console.log('\n=== USER-FACING MISSING triggers ===');
const noTrig = userFacing.filter((s) => !Array.isArray(s.triggers) || s.triggers.length === 0);
console.log(noTrig.length, noTrig.map((s) => s.id).join(', ') || '(none)');

console.log('\n=== MULTI-TRIGGER (design rule: exactly one) ===');
const multi = userFacing.filter((s) => Array.isArray(s.triggers) && s.triggers.length > 1);
console.log('count:', multi.length);
const byCount: Record<number, string[]> = {};
for (const s of multi) (byCount[s.triggers.length] ||= []).push(s.id);
for (const n of Object.keys(byCount).sort((a, b) => Number(a) - Number(b))) {
  const ids = byCount[Number(n)];
  console.log(`  ${n} triggers (${ids.length}):`, ids.join(', '));
}

console.log('\n=== TRIGGER KINDS IN USE ===');
const kinds: Record<string, number> = {};
for (const s of userFacing) for (const t of (s.triggers || [])) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
console.log(kinds);

console.log('\n=== PER-ASSISTANT (from the registry workflow view) ===');
for (const entry of assistantRegistries as any[]) {
  const list: any[] = entry.skills || [];
  const multi = list.filter((s) => Array.isArray(s.triggers) && s.triggers.length > 1);
  const data = list.filter((s) => Array.isArray(s.triggers) && s.triggers.some((t: any) => t.kind === 'data'));
  console.log(`  ${entry.assistant}: ${list.length} skills, multi-trigger=${multi.length}${multi.length ? ' [' + multi.map((m) => m.id).join(', ') + ']' : ''}${data.length ? ' data-kind=[' + data.map((d) => d.id).join(', ') + ']' : ''}`);
}

console.log('\n=== base tools that still declare user-facing triggers ===');
for (const entry of assistantRegistries as any[]) {
  for (const s of entry.skills || []) {
    if (s.isSkill === false && Array.isArray(s.triggers) && s.triggers.length) {
      console.log(`  ${entry.assistant}: ${s.id} isSkill=false but has ${s.triggers.length} trigger(s)`);
    }
  }
}
