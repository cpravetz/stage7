import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const COMPLIANCE_TRACKING = createDeclarativeCodeSkill({
  id: 'compliance-tracking',
  name: 'Compliance Tracking',
  description: 'Track and verify compliance against regulatory requirements with local analysis.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      documentText: SchemaProps.text({ description: 'Text of the document to check for compliance' }),
      regulation: SchemaProps.select(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'FERPA'], { description: 'Regulation or standard to check against (e.g., GDPR, HIPAA, SOX)' }),
      jurisdiction: SchemaProps.text({ description: 'Regulatory jurisdiction to check (e.g., US, EU, CA)' }),
      effectiveDate: SchemaProps.text({ description: 'Effective date for compliance check (ISO 8601 format)' }),
    },
    required: ['documentText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          report: { type: 'object' },
          storePath: { type: 'string' },
          violationCount: { type: ['number', 'null'] },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Regulatory compliance frameworks (GDPR, HIPAA, SOX, PCI-DSS, FERPA), audit horizon planning, and compliance risk scorecarding',
  triggers: [
    { kind: 'schedule', cadence: 'Monthly compliance audit' },
  ],
  async handler(input, ctx) {
    const regulation = input.regulation || 'GDPR';
    const jurisdiction = input.jurisdiction || 'US';
    const effectiveDate = input.effectiveDate || new Date().toISOString();

    const store = ctx.store.load('compliance');
    const report = {
      id: `comp_${Date.now()}`,
      regulation,
      jurisdiction,
      effectiveDate,
      totalRules: 0,
      violations: null,
      compliant: null,
      checks: [],
      status: 'manual-review-required',
      createdAt: new Date().toISOString(),
      source: 'local',
      notice: 'No regulatory rule set or connected compliance provider is configured; no compliance conclusion was produced.',
    };

    store.push(report);
    ctx.store.save('compliance', store);

    return {
      success: true,
      data: { report, violationCount: null },
      present: [
        ctx.render.text('report', 'Compliance Check Report', `Regulation: ${regulation}, Jurisdiction: ${jurisdiction}. Status: manual-review-required.`),
      ],
    };
  },
});

export { COMPLIANCE_TRACKING };
