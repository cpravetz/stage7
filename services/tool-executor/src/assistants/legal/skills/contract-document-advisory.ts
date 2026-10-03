import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * The clause rules live inside the handler body, not in an imported module.
 *
 * `createDeclarativeCodeSkill` embeds `handler.toString()` into the generated
 * source, and the executor runs that text in a sandbox where only
 * `stage7-runtime` has been copied in. An identifier from a sibling module is
 * therefore an undefined reference at runtime, which surfaces as
 * `import_contract_risk_rules is not defined` and a failed envelope. The
 * scheduled half carries the same copy; `legal/contract-risk-rules.test.ts`
 * asserts the two stay identical, which is what stops them drifting.
 */
const CONTRACT_RULES_IN_HANDLER = true;

/**
 * User half of the contract-document-advisory split. It reviews the contract the
 * person supplies right now. The scheduled half (contract-document-advisory-
 * scheduled) runs the same clause heuristics over the contract stores the
 * operator configured; the split exists because only this half can review a
 * contract that has not been ingested yet, and only the other half can run
 * without a person in the loop.
 */
const CONTRACT_DOCUMENT_ADVISORY_USER = createDeclarativeCodeSkill({
  id: 'contract-document-advisory-user',
  name: 'Contract & Document Advisory',
  description: 'Reviews a contract you supply: clause risk assessment and issue list, stored locally for follow-up.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      contractText: SchemaProps.text({ description: 'Full text of the contract to review' }),
      contractType: SchemaProps.text({ description: 'Type of contract (e.g., employment, NDA, service agreement, general)' }),
      jurisdiction: SchemaProps.text({ description: 'Applicable legal jurisdiction (e.g., US, CA, NY, EU)' }),
    },
    required: ['contractText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          review: { type: 'object' },
          storePath: { type: 'string' },
          issueCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  isSkill: true,
  tier: 'advise',
  // Drafting, redlining and finalising a document are this Skill's own work.
  // Holding the tools here keeps them reachable by delegation rather than as
  // four separate entry points competing with the Skill that uses them.
  manifest: { actionLabel: 'Advise on a contract', lowerOrderTools: ['legal-draft', 'legal-redline', 'legal-finalize'] },
  domainKnowledge: 'Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation',
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Review this contract',
        'Check these clauses for risk',
        'What are the risky parts of this agreement?',
      ],
    },
  ],
  async handler(input, ctx) {
    const contractText = input.contractText || '';
    const contractType = input.contractType || 'general';
    const jurisdiction = input.jurisdiction || 'US';

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
    const normalizedText = (contractText || '').toLowerCase();
    const risks = CONTRACT_RISK_RULES.filter(function (r) {
      return r.terms.some(function (term) { return normalizedText.indexOf(term) !== -1; });
    });
    const issues = risks.map(function (r) { return { issue: r.description, severity: r.severity, type: r.type, clause: r.clause }; });
    const clauses = risks.map(function (r) { return { clause: r.clause, status: 'review', note: r.description + '; manual legal review required' }; });
    const issueCount = issues.length;

    const store = ctx.store.load('advisory');
    const review = {
      id: `review_${Date.now()}`,
      contractType,
      textLength: contractText.length,
      risks,
      issues,
      clauses,
      jurisdiction,
      createdAt: new Date().toISOString(),
      source: 'local',
      method: 'keyword-heuristic',
      disclaimer: 'Heuristic review only; not legal advice and not a substitute for counsel.',
    };

    store.push(review);
    ctx.store.save('advisory', store);

    return {
      success: true,
      data: { review, issueCount },
      present: [
        ctx.render.text('report', 'Contract Risk Assessment', `Identified ${issueCount} potential risk clauses in ${contractType} contract (${jurisdiction}).`),
      ],
    };
  },
});

export { CONTRACT_DOCUMENT_ADVISORY_USER };
