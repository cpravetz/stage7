import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

/**
 * User half of the compliance-tracking split: a person names the regulation and
 * jurisdiction to check against. The scheduled half
 * (compliance-tracking-scheduled) does the recurring scan across the sources and
 * notification targets the operator configured.
 */
const COMPLIANCE_TRACKING_USER = createDeclarativeCodeSkill({
  id: 'compliance-tracking-user',
  name: 'Compliance Tracking',
  description: 'Records a compliance check against a regulation and jurisdiction you choose.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      documentText: SchemaProps.text({ description: 'Text of the document to check for compliance' }),
      regulation: SchemaProps.select(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'FERPA'], { description: 'Regulation or standard to check against (e.g., GDPR, HIPAA, SOX)' }),
      jurisdiction: SchemaProps.text({ description: 'Regulatory jurisdiction to check (e.g., US, EU, CA)' }),
      effectiveDate: SchemaProps.text({ description: 'Effective date for compliance check (ISO 8601 format)' }),
    },
    // documentText is deliberately NOT required. Nothing in this Skill reads it:
    // there is no rule set or compliance provider wired up, so no conclusion can
    // be drawn from a document. It used to be required, which meant the schema
    // demanded a value the handler discarded and then returned a placeholder
    // report as if the check had run (design 1.1/0.8). It stays optional so the
    // subject of the intended work is still expressible until a provider lands.
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
    {
      kind: 'user',
      phrase_examples: [
        'Check this against GDPR',
        'Start a compliance check for HIPAA',
        'Record our SOCX compliance status',
      ],
    },
  ],
  async handler(input, ctx) {
    const regulation = input.regulation || 'GDPR';
    const jurisdiction = input.jurisdiction || 'US';
    const effectiveDate = input.effectiveDate || new Date().toISOString();
    // Recorded so the report cannot imply a document was checked when none was
    // supplied. The absence of a rule set is what makes the result a placeholder,
    // not the absence of input.
    const documentProvided = typeof input.documentText === 'string' && input.documentText.trim().length > 0;

    const store = ctx.store.load('compliance');
    const report = {
      id: `comp_${Date.now()}`,
      regulation,
      jurisdiction,
      effectiveDate,
      documentProvided,
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

export { COMPLIANCE_TRACKING_USER };
