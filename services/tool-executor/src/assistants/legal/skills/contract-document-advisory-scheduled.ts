import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Scheduled half of the contract-document-advisory split.
 *
 * Runs the shared clause heuristics across the contract stores the operator
 * configured. It never accepts a contract from a caller: `contractSources` is a
 * required config selector, so the Skill cannot start wide open and scan
 * everything. A tag filter narrows it further.
 */
const CONTRACT_DOCUMENT_ADVISORY_SCHEDULED = createDeclarativeCodeSkill({
  id: 'contract-document-advisory-scheduled',
  name: 'Contract Risk Sweep',
  description: 'Scheduled sweep of configured contract stores, reporting risk clauses found since the last run.',
  persistenceEnvVar: 'LEGAL_HOME',
  // No user-supplied input. What this Skill reviews comes from configuration,
  // not from whoever happened to trigger the run.
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual, upstream)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          sourcesScanned: { type: 'array' },
          sourcesEmpty: { type: 'array' },
          contractsReviewed: { type: 'number' },
          flagged: { type: 'array' },
          tagFilters: { type: 'array' },
          cadence: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  // Required selector. Without it this Skill would have no defined scope, which
  // is the wide-scope configuration the split exists to prevent.
  configSchema: {
    type: 'object',
    properties: {
      contractSources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Store keys of the contract collections to sweep',
      },
      tagFilters: { type: 'array', items: { type: 'string' }, description: 'Only review contracts carrying one of these tags' },
      cadence: { type: 'string', description: 'Cron expression or schedule id this run belongs to' },
    },
    required: ['contractSources'],
    additionalProperties: false,
  },
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation',
  triggers: [
    { kind: 'schedule', cadence: 'Weekly contract risk sweep (Mondays 07:00)' },
  ],
  async handler(input, ctx) {
    // Read config, not input: these selectors are operator-scoped.
    const sources = Array.isArray(ctx.config?.contractSources) ? (ctx.config!.contractSources as unknown[]).map(String) : [];
    const tagFilters = Array.isArray(ctx.config?.tagFilters) ? (ctx.config!.tagFilters as unknown[]).map(String) : [];
    const cadence = typeof ctx.config?.cadence === 'string' ? (ctx.config!.cadence as string) : undefined;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    const sourcesScanned: string[] = [];
    const sourcesEmpty: string[] = [];
    const flagged: Array<Record<string, unknown>> = [];
    let contractsReviewed = 0;

    const CONTRACT_RISK_RULES = [
      { type: 'liability', severity: 'high', clause: 'Indemnification', terms: ['indemnif', 'consequential damages', 'unlimited liability'], description: 'Review liability and indemnification language' },
      { type: 'termination', severity: 'medium', clause: 'Termination', terms: ['termination', 'terminate', 'notice period'], description: 'Review termination rights and notice requirements' },
      { type: 'ip', severity: 'medium', clause: 'Intellectual Property', terms: ['intellectual property', 'work product', 'ownership'], description: 'Review intellectual property ownership language' },
      { type: 'confidentiality', severity: 'low', clause: 'Confidentiality', terms: ['confidential', 'non-disclosure', 'nda'], description: 'Review confidentiality obligations' },
      { type: 'payment', severity: 'high', clause: 'Payment Terms', terms: ['payment', 'invoice', 'net-'], description: 'Review payment timing and remedies' },
      { type: 'dispute', severity: 'medium', clause: 'Dispute Resolution', terms: ['arbitration', 'dispute', 'governing law'], description: 'Review dispute resolution and governing law' },
      { type: 'force-majeure', severity: 'low', clause: 'Force Majeure', terms: ['force majeure', 'act of god'], description: 'Review force majeure coverage' },
      { type: 'limitation', severity: 'medium', clause: 'Limitation of Liability', terms: ['limitation of liability', 'liability cap', 'damages cap'], description: 'Review liability limits' },
    ];

    for (const source of sources) {
      sourcesScanned.push(source);
      const raw = ctx.store.load(source, []);
      // A source record may be a bare array or wrap its contracts under a key;
      // accept both rather than silently reviewing nothing.
      const records = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.contracts)
          ? ((raw as Record<string, unknown>).contracts as unknown[])
          : [];
      let matched = 0;
      for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        const doc = record as Record<string, unknown>;
        const tags = Array.isArray(doc.tags) ? (doc.tags as unknown[]).map(String) : [];
        if (tagFilters.length && !tagFilters.some((t) => tags.includes(t))) continue;
        const text = typeof doc.text === 'string' ? doc.text : typeof doc.contractText === 'string' ? doc.contractText : '';
        if (!text) continue;
        matched++;
        contractsReviewed++;
        // Same rules as the User half, inlined for the same reason: an imported
        // identifier is an undefined reference inside the sandbox.
        const normalizedText = text.toLowerCase();
        const hitRules = CONTRACT_RISK_RULES.filter((r) => r.terms.some((term) => normalizedText.includes(term)));
        const hitIssues = hitRules.map((r) => ({ issue: r.description, severity: r.severity, type: r.type, clause: r.clause }));
        if (hitIssues.length > 0) {
          flagged.push({
            contractId: String(doc.id ?? `${source}:${matched}`),
            source,
            contractType: typeof doc.contractType === 'string' ? doc.contractType : 'general',
            jurisdiction: typeof doc.jurisdiction === 'string' ? doc.jurisdiction : 'US',
            issueCount: hitIssues.length,
            issues: hitIssues,
          });
        }
      }
      if (matched === 0) sourcesEmpty.push(source);
    }

    const report = {
      runReason,
      cadence: cadence ?? null,
      tagFilters,
      sourcesScanned,
      sourcesEmpty,
      contractsReviewed,
      flagged,
      disclaimer: 'Heuristic review only; not legal advice and not a substitute for counsel.',
    };
    ctx.store.save('advisory-sweep', report);

    return {
      success: true,
      data: report,
      present: [
        ctx.render.text(
          'report',
          'Contract Risk Sweep',
          `Reviewed ${contractsReviewed} contract(s) across ${sourcesScanned.length} configured source(s); ${flagged.length} flagged for manual review.`,
        ),
      ],
    };
  },
});

export { CONTRACT_DOCUMENT_ADVISORY_SCHEDULED };