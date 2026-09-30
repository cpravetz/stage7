import { ToolRegistry } from '../services/ToolRegistry';
import { careerSkills, careerCanonicalSkills } from '../data/skills/career';

it('registry surfaces career skills', () => {
  const reg = new ToolRegistry();
  for (const t of [...careerSkills, ...careerCanonicalSkills]) {
    if (!reg.get(t.id)) reg.registerDefault({ ...t });
  }
  for (const s of careerCanonicalSkills) {
    const live = reg.get(s.id);
    console.log(`${s.id.padEnd(50)} registered=${!!live} isSkill=${String(live?.isSkill)}`);
  }
});
