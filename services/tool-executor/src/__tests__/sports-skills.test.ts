import { sportsSkills } from '../data/skills/sports';
import { Tool } from '../types';

describe('sportsSkills', () => {
  it('exports exactly six skills', () => {
    expect(sportsSkills).toHaveLength(6);
  });

  it('exports unique skill ids', () => {
    const ids = sportsSkills.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has Performance Group — three skills', () => {
    const perfGroup = sportsSkills.filter(s =>
      ['sports-tactical-roster-evaluator', 'sports-battlecard-creator', 'sports-scouting-alert-dispatcher'].includes(s.id)
    );
    expect(perfGroup).toHaveLength(3);
  });

  it('has Wagering Group — three skills', () => {
    const wagerGroup = sportsSkills.filter(s =>
      ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot', 'sports-line-alert-dispatcher'].includes(s.id)
    );
    expect(wagerGroup).toHaveLength(3);
  });

  describe('Performance Group skills', () => {
    it('Tactical Roster Evaluator is a code skill with real calculations', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-tactical-roster-evaluator')!;
      expect(skill.type).toBe('code');
      expect(skill.manifest.language).toBe('javascript');
      expect(skill.inputSchema).toBeDefined();
      expect(skill.outputSchema).toBeDefined();
      expect(skill.triggers).toBeDefined();
      expect(skill.triggers!.length).toBeGreaterThan(0);
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('computeTacticalEvaluation');
      expect(source).toContain('synergyScores');
      expect(source).toContain('weaknessIndices');
      expect(source).toContain('SPORTS_GROUP_A_HOME');
    });

    it('Battlecard Creator has configSchema and not-connected behavior', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-battlecard-creator')!;
      expect(skill.type).toBe('code');
      expect(skill.manifest.configSchema).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.dataProvider).toBeDefined();
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('dataConnected');
      expect(source).toContain('create-battlecard');
      expect(source).toContain('group-a');
      expect(source).not.toContain('SPORTS_GROUP_B_HOME');
    });

    it('Scouting Alert Dispatcher is dry-run and confirmation-gated', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-scouting-alert-dispatcher')!;
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('dryRun');
      expect(source).toContain('confirmationRequired');
      expect(source).toContain('group-a');
      expect(source).not.toContain('SPORTS_GROUP_B_HOME');
    });

    it('Performance skills use Group A persistence paths only', () => {
      const perfIds = ['sports-tactical-roster-evaluator', 'sports-battlecard-creator', 'sports-scouting-alert-dispatcher'];
      for (const skill of sportsSkills.filter(s => perfIds.includes(s.id))) {
        const source = skill.manifest.sourceCode as string;
        expect(source).toMatch(/SPORTS_GROUP_A_HOME|\/tmp\/sports\/group-a/);
        expect(source).not.toContain('SPORTS_GROUP_B_HOME');
        expect(source).not.toContain('/tmp/sports/group-b');
      }
    });
  });

  describe('Wagering Group skills', () => {
    it('Matchup & Odds Explainer has real EV math and responsible-play language', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-matchup-odds-explainer')!;
      expect(skill.type).toBe('code');
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('impliedProbability');
      expect(source).toContain('calculateEV');
      expect(source).toContain('responsiblePlay');
      expect(source).toContain('entertainment');
      expect(source).toContain('responsible');
      expect(source).not.toContain('placeWager');
      expect(source).not.toContain('place_bet');
    });

    it('Bankroll Co-Pilot enforces responsible-play limits with real calculations', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-bankroll-co-pilot')!;
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('kellyFraction');
      expect(source).toContain('violations');
      expect(source).toContain('blocked');
      expect(source).toContain('unitLimit');
      expect(source).toContain('single-bet-cap');
      expect(source).toContain('responsiblePlay');
      expect(source).toContain('SPORTS_GROUP_B_HOME');
      expect(source).not.toContain('SPORTS_GROUP_A_HOME');
      expect(source).not.toContain('/tmp/sports/group-a');
      // Contains sportsbook reference only in disclaimer about NOT using them
      const sportsbookMatches = source.match(/sportsbook/gi);
      expect(sportsbookMatches).toBeTruthy();
      expect(source).toContain('does not place bets');
    });

    it('Line-Alert Dispatcher never places wagers or accesses sportsbook accounts', () => {
      const skill = sportsSkills.find(s => s.id === 'sports-line-alert-dispatcher')!;
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('neverPlaceWagers');
      expect(source).toContain('neverAccessSportsbookAccounts');
      expect(source).toContain('dryRun');
      expect(source).toContain('confirmationRequired');
      expect(skill.manifest.configSchema).toBeDefined();
      expect(source).not.toContain('placeWager');
      expect(source).not.toContain('place_bet');
    });

    it('Wagering skills use Group B persistence paths and NOT Group A', () => {
      const wagerIds = ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot', 'sports-line-alert-dispatcher'];
      for (const skill of sportsSkills.filter(s => wagerIds.includes(s.id))) {
        const source = skill.manifest.sourceCode as string;
        expect(source).toMatch(/SPORTS_GROUP_B_HOME|\/tmp\/sports\/group-b/);
        expect(source).not.toContain('SPORTS_GROUP_A_HOME');
        expect(source).not.toContain('/tmp/sports/group-a');
      }
    });
  });

  describe('All skills must have required metadata', () => {
    for (const skill of sportsSkills) {
      it(`${skill.id} has triggers, inputSchema, outputSchema`, () => {
        expect(skill.triggers).toBeDefined();
        expect(skill.triggers!.length).toBeGreaterThan(0);
        expect(skill.inputSchema).toBeDefined();
        expect(skill.inputSchema!.properties).toBeDefined();
        expect(skill.outputSchema).toBeDefined();
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.createdAt).toBeInstanceOf(Date);
        expect(skill.updatedAt).toBeInstanceOf(Date);
      });
    }
  });

  describe('Group isolation', () => {
    it('Performance group tools reference only Group A env/data paths', () => {
      const perf = sportsSkills.filter(s =>
        ['sports-tactical-roster-evaluator', 'sports-battlecard-creator', 'sports-scouting-alert-dispatcher'].includes(s.id)
      );
      for (const s of perf) {
        const src = (s.manifest.sourceCode || '') as string;
        expect(src).not.toContain('SPORTS_GROUP_B_HOME');
        expect(src).not.toContain('/tmp/sports/group-b');
      }
    });

    it('Wagering group tools reference only Group B env/data paths', () => {
      const wager = sportsSkills.filter(s =>
        ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot', 'sports-line-alert-dispatcher'].includes(s.id)
      );
      for (const s of wager) {
        const src = (s.manifest.sourceCode || '') as string;
        expect(src).not.toContain('SPORTS_GROUP_A_HOME');
        expect(src).not.toContain('/tmp/sports/group-a');
      }
    });
  });
});
