import { careerCanonicalSkills } from '../data/skills/career';
it('triggers', () => {
  for (const s of careerCanonicalSkills) {
    const kinds = (s.triggers || []).map((t: { kind: string }) => t.kind);
    const inLOT = (s.manifest?.lowerOrderTools as string[]) || [];
    console.log(`${s.id.padEnd(50)} isSkill=${String(s.isSkill).padEnd(5)} triggers=${JSON.stringify(kinds)} lowerOrder=${inLOT.length}`);
  }
});
