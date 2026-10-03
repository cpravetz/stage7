import { validateBlueprint } from '../adk/validate';
import { buildCatalog } from '../adk/bootstrap';
import { validateCatalog } from '../adk/catalog';
import { allBlueprintSkills, type AssistantBlueprint } from '../adk/types';
import { allWorkflows } from '../data/skills';
import { TriggerScheduler } from '../services/TriggerScheduler';
import { createInMemoryTriggerRecordStore } from '../services/TriggerRecordStore';

/**
 * The cadence rule and the scheduler must agree.
 *
 * A cadence is only a live schedule when it has exactly one reading. The
 * validator says so at authoring time and the scheduler refuses it at runtime —
 * if the two ever disagree, one of them is either running something the author
 * did not schedule or hiding a declaration the author thinks is live.
 */
describe('unschedulable-cadence validation', () => {
  const catalog = buildCatalog();
  const tools = catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? allBlueprintSkills(blueprint) : [];
  });

  const findings = validateCatalog(catalog).flatMap((report) =>
    report.findings.filter((finding) => finding.rule === 'unschedulable-cadence'),
  );

  it('finds the prose cadences in the shipped catalogue', () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.severity === 'warning')).toBe(true);
  });

  it('tells the author what to write instead of just rejecting it', () => {
    for (const finding of findings) {
      expect(finding.message).toContain('Declare cron with an exact expression');
      expect(finding.message).toContain('does not say when it fires');
    }
  });

  it('agrees exactly with what the scheduler refuses to run', () => {
    const scheduler = new TriggerScheduler({
      getTools: () => tools,
      getWorkflows: () => allWorkflows,
      store: createInMemoryTriggerRecordStore(),
      execute: async () => {
        throw new Error('not used');
      },
    });
    const { issues } = scheduler.list();

    expect(issues.length).toBe(findings.length);
  });

  it('stays quiet about a cadence that is a real interval', () => {
    const original = catalog.blueprints.get(catalog.order[0]);
    expect(original).toBeDefined();

    const before = allBlueprintSkills(original!).filter((tool) =>
      tool.triggers?.some((candidate) => candidate.kind === 'schedule' && !candidate.cron),
    );
    expect(before.length).toBeGreaterThan(0);
    const skillId = before[0].id;

    // Loaded blueprints are frozen, so give the validator a mutable copy with the
    // prose cadence replaced by the one interval that needs no interpretation.
    const blueprint = JSON.parse(JSON.stringify(original)) as AssistantBlueprint;
    const skill = allBlueprintSkills(blueprint).find((tool) => tool.id === skillId)!;
    const trigger = skill.triggers!.find((candidate) => candidate.kind === 'schedule')!;
    trigger.cron = undefined;
    trigger.cadence = 'Every 15 minutes';

    const reported = validateBlueprint(blueprint).findings.filter(
      (finding) => finding.rule === 'unschedulable-cadence' && finding.location.includes(skillId),
    );
    expect(reported).toEqual([]);
  });
});