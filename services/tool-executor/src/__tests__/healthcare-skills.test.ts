import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { healthcareClinicalDecisionSupportEvaluator } from '../data/skills/healthcare/healthcare-clinical-decision-support-evaluator';
import { healthcareClinicalPracticeWorkflowEvaluator } from '../data/skills/healthcare/healthcare-clinical-practice-workflow-evaluator';
import { healthcarePatientCarePlanEducationalBriefingCopilot } from '../data/skills/healthcare/healthcare-patient-care-plan-educational-briefing-copilot';
import { APPOINTMENT_PATIENT_INTAKE_DISPATCHER } from '../data/skills/healthcare/healthcare-appointment-patient-intake-dispatcher';
import { careResourceReferralCoordinator } from '../data/skills/healthcare/care-resource-referral-coordinator';

interface PresentBlock {
  id: string;
  title?: string;
  body: string;
  kind?: string;
}

interface SkillResult {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: Record<string, unknown> | null;
  present?: PresentBlock[];
}

const CANONICAL_SKILLS: Tool[] = [
  healthcareClinicalDecisionSupportEvaluator,
  healthcareClinicalPracticeWorkflowEvaluator,
  healthcarePatientCarePlanEducationalBriefingCopilot,
  APPOINTMENT_PATIENT_INTAKE_DISPATCHER,
  careResourceReferralCoordinator,
];

const CANONICAL_SKILLS_NO_REFERRAL: Tool[] = CANONICAL_SKILLS.filter(
  (t) => t.id !== 'care-resource-referral-coordinator',
);

async function run(
  tool: Tool,
  input: Record<string, unknown>,
  registryTools: Tool[] = [],
): Promise<{ result: SkillResult; exec: { status: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> }; output?: { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } }> {
  const registry = new Map<string, Tool>();
  for (const t of registryTools) registry.set(t.id, t);
  registry.set(tool.id, tool);

  const executor = new ToolExecutor(registry);
  const exec = await executor.execute(tool, input);
  const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } | undefined;

  let result: SkillResult = {};
  if (typeof output?.output === 'string') {
    try {
      result = JSON.parse(output.output) as SkillResult;
    } catch {
      throw new Error(
        `Skill ${tool.id} did not emit parseable JSON. Raw output:\n${String(output?.output).slice(0, 500)}`,
      );
    }
  }
  return { result, exec: { status: exec.status, outputSchemaIssues: output?.outputSchemaIssues }, output };
}

function failingStub(id: string, message: string): Tool {
  return {
    id,
    name: id,
    description: 'stub',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `console.log(JSON.stringify({ success: false, error: ${JSON.stringify(message)} }));`,
    },
    isSkill: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function successStub(id: string, data: Record<string, unknown>): Tool {
  return {
    id,
    name: id,
    description: 'stub',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `console.log(JSON.stringify({ success: true, data: ${JSON.stringify(data)} }));`,
    },
    isSkill: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function assertPresentClean(result: SkillResult) {
  const blocks = result.present;
  expect(Array.isArray(blocks)).toBe(true);
  expect((blocks as PresentBlock[]).length).toBeGreaterThan(0);
  for (const block of blocks as PresentBlock[]) {
    expect(typeof block.body).toBe('string');
    expect(block.body.trim().length).toBeGreaterThan(0);
    expect(block.body).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(block.body).not.toContain('{"');
    expect(block.body).not.toMatch(/"\w+":/);
    expect(block.body.toLowerCase()).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|placeholder/);
    if (block.title) {
      expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
    }
  }
}

function seedInputFor(id: string): Record<string, unknown> {
  if (id === 'healthcare-clinical-decision-support-evaluator') {
    return {
      patient: { age: 45, symptoms: ['fever', 'chest pain'], history: ['hypertension'] },
      guidelines: [{ name: 'Cardiology Guideline', keywords: ['chest pain', 'fever'], pathway: 'EKG and cardiac enzymes', evidenceLevel: 'A' }],
    };
  }
  if (id === 'healthcare-clinical-practice-workflow-evaluator') {
    return {
      workflowRows: [{ facility: 'Main Clinic', scheduled: 100, completed: 80, noShows: 10, avgWaitMinutes: 45, billingDelayDays: 3 }],
    };
  }
  if (id === 'healthcare-patient-care-plan-educational-briefing-copilot') {
    return { condition: 'Type 2 Diabetes', goals: ['Maintain HbA1c below 7%'], educationTopics: ['Carbohydrate counting', 'Insulin administration'] };
  }
  if (id === 'healthcare-appointment-patient-intake-dispatcher') {
    return { endpoint: 'http://example.com', reasonForVisit: 'Annual checkup', dryRun: true };
  }
  if (id === 'care-resource-referral-coordinator') {
    return { patient: 'P123', clinicalNeeds: ['cardiology consultation'], dryRun: true };
  }
  return {};
}

function failureInputFor(id: string): Record<string, unknown> {
  if (id === 'healthcare-appointment-patient-intake-dispatcher') {
    return { dryRun: true };
  }
  if (id === 'care-resource-referral-coordinator') {
    return { dryRun: true };
  }
  return {};
}

describe('Embedded skill sources survive template-literal escaping', () => {
  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s embedded source is syntactically valid JavaScript',
    (_id, tool) => {
      const source = (tool.manifest as { sourceCode: string }).sourceCode;
      expect(() => new Function(source)).not.toThrow();
    },
  );
});

describe('Healthcare Advisor skills emit presentation blocks', () => {
  it('every canonical skill declares present as required in its outputSchema', () => {
    for (const tool of CANONICAL_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain('present');
      expect(Object.keys(schema.properties || {})).toContain('present');
    }
  });

  it.each(CANONICAL_SKILLS_NO_REFERRAL.map((t) => [t.id, t] as const))(
    '%s renders blocks on its success path with no raw JSON, placeholders, or repeated titles',
    async (_id, tool) => {
      const { result } = await run(tool, seedInputFor(tool.id));
      expect(result.success).toBe(true);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s renders blocks on its validation-failure path',
    async (_id, tool) => {
      const { result } = await run(tool, failureInputFor(tool.id));
      expect(result.success).toBe(false);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s output satisfies its own declared outputSchema',
    async (_id, tool) => {
      for (const input of [failureInputFor(tool.id), seedInputFor(tool.id)]) {
        const { result, output } = await run(tool, input);
        const issues = validateAgainstOutputSchema(result, tool.outputSchema);
        expect(issues).toEqual([]);
        expect(output?.outputSchemaIssues || []).toEqual([]);
      }
    },
  );
});

describe('Clinical decision-support evaluator computes real red flags', () => {
  it('flags chest pain as a red flag and matches guideline keywords', async () => {
    const { result } = await run(healthcareClinicalDecisionSupportEvaluator, {
      patient: { age: 30, symptoms: ['fever', 'chest pain'], history: [] },
      guidelines: [{ name: 'Cardiology', keywords: ['chest pain', 'fever'], pathway: 'EKG', evidenceLevel: 'A' }],
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('chest pain');
    expect(body).toContain('Red-flag symptom(s) identified');
    expect(body).toContain('Escalation recommendation: urgent');
    expect(body).toContain('1. Cardiology');
    expect(body).toContain('2 of 2 symptom(s) matched');
  });

  it('reports not-connected when symptoms and guidelines are absent', async () => {
    const { result } = await run(healthcareClinicalDecisionSupportEvaluator, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(result.error).toMatch(/symptoms and evidence-based guideline inputs are required/);
    assertPresentClean(result);
  });
});

describe('Clinical practice workflow evaluator derives deterministic metrics', () => {
  it('computes utilization and no-show rate from the supplied numbers', async () => {
    const { result } = await run(healthcareClinicalPracticeWorkflowEvaluator, {
      workflowRows: [{ facility: 'Main Clinic', scheduled: 100, completed: 80, noShows: 10, avgWaitMinutes: 45, billingDelayDays: 3 }],
    });

    expect(result.success).toBe(true);
    const data = result.data as { summary: Record<string, unknown> };
    expect(data.summary).toMatchObject({ totalScheduled: 100, totalCompleted: 80, totalNoShows: 10 });
    expect(data.summary.avgUtilization).toBe(80);
    expect(data.summary.avgNoShowRate).toBe(10);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Utilization: 80%');
    expect(body).toContain('No-show rate: 10%');
    expect(body).toContain('Bottleneck: access');
    expect(body).toContain('Review access capacity and wait-time handoffs.');
  });

  it('reports no bottlenecks when thresholds are not exceeded', async () => {
    const { result } = await run(healthcareClinicalPracticeWorkflowEvaluator, {
      workflowRows: [{ facility: 'Small Clinic', scheduled: 20, completed: 20, noShows: 0, avgWaitMinutes: 10, billingDelayDays: 1 }],
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Bottlenecks identified: none');
    expect(body).toContain('Recommendations: none — no thresholds exceeded');
  });

  it('reports not-connected when no workflow rows are supplied', async () => {
    const { result } = await run(healthcareClinicalPracticeWorkflowEvaluator, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });
});

describe('Care plan briefing co-pilot lists topics verbatim', () => {
  it('lists education topics from the input and never invents explanatory prose', async () => {
    const { result } = await run(healthcarePatientCarePlanEducationalBriefingCopilot, {
      condition: 'Hypertension',
      goals: ['Lower systolic below 130'],
      educationTopics: ['Sodium restriction', 'Medication adherence'],
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Patient care-plan briefing for: Hypertension');
    expect(body).toContain('1. Sodium restriction');
    expect(body).toContain('2. Medication adherence');
    // No hardcoded boilerplate content:
    expect(body).not.toContain('Explain only the supplied');
  });

  it('reports not-connected when condition, goals, or education topics are missing', async () => {
    const { result } = await run(healthcarePatientCarePlanEducationalBriefingCopilot, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });
});

describe('Appointment intake dispatcher gates and stages honestly', () => {
  it('stays in not-connected state when no endpoint is configured', async () => {
    const { result } = await run(APPOINTMENT_PATIENT_INTAKE_DISPATCHER, { dryRun: true });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });

  it('stages intake in dry-run mode with present blocks', async () => {
    const { result } = await run(APPOINTMENT_PATIENT_INTAKE_DISPATCHER, {
      endpoint: 'http://example.com',
      reasonForVisit: 'Annual checkup',
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('dry-run');
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Staged intake payload');
    expect(body).toContain('Annual checkup');
    assertPresentClean(result);
  });

  it('blocks emergency urgency with a safety-escalation present block', async () => {
    const { result } = await run(APPOINTMENT_PATIENT_INTAKE_DISPATCHER, {
      endpoint: 'http://example.com',
      urgency: 'emergency',
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('safety-escalation');
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Emergency intake cannot be dispatched');
    assertPresentClean(result);
  });

  it('the executor refuses a live dispatch without confirmation', async () => {
    await expect(
      run(APPOINTMENT_PATIENT_INTAKE_DISPATCHER, { endpoint: 'http://example.com', dryRun: false }),
    ).rejects.toThrow(/confirmation/i);
  });
});

describe('Care resource referral coordinator reports delegation honestly', () => {
  it('reports not-connected when required inputs are missing', async () => {
    const { result } = await run(careResourceReferralCoordinator, { dryRun: true });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });

  it('blocks emergency referrals with a safety-escalation present block', async () => {
    const { result } = await run(careResourceReferralCoordinator, {
      patient: 'P123',
      clinicalNeeds: ['cardiology consultation'],
      urgency: 'emergency',
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('safety-escalation');
    assertPresentClean(result);
  });

  it('propagates lower-order tool failure and does not report success', async () => {
    const stubs = [
      failingStub('healthcare-records-scheduling-ops', 'Lower-order tool not configured'),
      failingStub('healthcare-resource-coordination', 'Lower-order tool not configured'),
      failingStub('healthcare-patient-communication', 'Lower-order tool not configured'),
    ];
    const { result } = await run(careResourceReferralCoordinator, {
      patient: 'P123',
      clinicalNeeds: ['cardiology consultation'],
      dryRun: true,
    }, stubs);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Lower-order tool not configured/);
    assertPresentClean(result);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('records_scheduling: FAILED');
    expect(body).toContain('resource_coordination: not attempted');
    expect(body).toContain('patient_communication: not attempted');
  });

  it('succeeds when all lower-order tools return success', async () => {
    const stubs = [
      successStub('healthcare-records-scheduling-ops', { status: 'ok' }),
      successStub('healthcare-resource-coordination', {
        candidates: [{ name: 'Cardiology Clinic', distance: '2.5 miles' }],
        referral: { id: 'ref-123' },
        referralStatus: 'created',
        followUpRequired: false,
      }),
      successStub('healthcare-patient-communication', { sent: true }),
    ];
    const { result } = await run(careResourceReferralCoordinator, {
      patient: 'P123',
      clinicalNeeds: ['cardiology consultation'],
      dryRun: true,
    }, stubs);
    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Referral coordination: completed successfully');
    expect(body).toContain('records_scheduling: succeeded');
    expect(body).toContain('resource_coordination: succeeded');
    expect(body).toContain('Cardiology Clinic');
    assertPresentClean(result);
  });
});
