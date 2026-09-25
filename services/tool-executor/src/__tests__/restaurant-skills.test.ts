import { restaurantSkills } from '../data/skills/restaurant';
import { Tool } from '../types';

function getSkill(id: string): Tool {
  const s = restaurantSkills.find((t) => t.id === id);
  if (!s) throw new Error('missing skill: ' + id);
  return s;
}

describe('restaurantSkills', () => {
  it('exports exactly five skills', () => {
    expect(restaurantSkills).toHaveLength(5);
  });

  it('exports unique skill ids', () => {
    const ids = restaurantSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no legacy isSkill:false external tools', () => {
    const legacy = restaurantSkills.filter((s) => s.isSkill === false);
    expect(legacy).toHaveLength(0);
  });

  it('all exported skills are canonical skills (isSkill not false)', () => {
    const ho = restaurantSkills.filter((s) => s.isSkill !== false);
    expect(ho).toHaveLength(5);
    const hoIds = ho.map((s) => s.id).sort();
    expect(hoIds).toEqual([
      'restaurant-menu-engineering-cost-strategist',
      'restaurant-reservations-guest-profile-manager',
      'restaurant-shift-prep-list-copilot',
      'restaurant-supply-chain-inventory-reorder-manager',
      'restaurant-financial-forecast-evaluator',
    ].sort());
  });

  it('canonical skill using __execute_tool delegates correctly', () => {
    const source = getSkill('restaurant-financial-forecast-evaluator').manifest.sourceCode as string;
    expect(source).toContain("__execute_tool('restaurant-menu-engineering-cost-strategist'");
    expect(source).toContain('try {');
    expect(source).not.toMatch(/success:\s*true[^}]*console\.log/);
  });

  it('non-wrapper canonical skills are self-contained', () => {
    for (const id of [
      'restaurant-menu-engineering-cost-strategist',
      'restaurant-reservations-guest-profile-manager',
      'restaurant-shift-prep-list-copilot',
      'restaurant-supply-chain-inventory-reorder-manager',
    ]) {
      const source = getSkill(id).manifest.sourceCode as string;
      expect(source).not.toContain('__execute_tool(');
    }
  });

  it('external-action wrappers return not-connected without config', () => {
    for (const id of ['restaurant-reservations-guest-profile-manager', 'restaurant-supply-chain-inventory-reorder-manager']) {
      const source = getSkill(id).manifest.sourceCode as string;
      expect(source).toContain('not-connected');
      expect(source).toMatch(/RESTAURANT_RESERVATION_ENDPOINT|RESTAURANT_SUPPLY_ENDPOINT/);
    }
  });

  it('confirmation/dry-run and input descriptions are present', () => {
    for (const id of [
      'restaurant-reservations-guest-profile-manager',
      'restaurant-supply-chain-inventory-reorder-manager',
    ]) {
      const props = getSkill(id).inputSchema!.properties as Record<string, any>;
      expect(props.dryRun).toBeDefined();
      expect(props.dryRun.description).toBeTruthy();
      expect(props.confirmBeforeSend).toBeDefined();
      expect(props.confirmBeforeSend.description).toBeTruthy();
    }
  });

  it('all skills have inputSchema, outputSchema, createdAt, updatedAt', () => {
    for (const skill of restaurantSkills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.inputSchema).toBeDefined();
      expect(typeof skill.inputSchema!.properties).toBe('object');
      expect(skill.outputSchema).toBeDefined();
      expect(skill.createdAt).toBeInstanceOf(Date);
      expect(skill.updatedAt).toBeInstanceOf(Date);
    }
  });
});
