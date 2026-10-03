import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * The four document-production tools behind the Legal Skills.
 *
 * v9 §2: these are `aid` and `advise`, not `represent`. None of them writes to
 * an external system or sends anything; they produce a document the lawyer
 * reads, changes and sends themselves. That distinction is the whole reason
 * they sit below the advisory Skills rather than being exposed directly.
 *
 * Every one of them works from supplied text. A clause library is a position
 * list, not a source of truth about the deal in front of you, so nothing here
 * asserts a term the caller did not supply.
 */
const LEGAL_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string' },
    data: { type: ['object', 'null'] },
    error: { type: ['string', 'null'] },
    present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable identifier for the block' },
          title: { type: 'string', description: 'Optional heading shown above the block' },
          kind: { type: 'string', description: 'How to interpret the body' },
          body: { type: 'string', description: 'Pre-formatted plain text, rendered verbatim' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'status', 'data', 'error', 'present'],
};

const LEGAL_CONFIG_SCHEMA = { type: 'object', properties: {} };

/** Clause families every one of these tools classifies against, in review order. */
const CLAUSE_FAMILIES = [
  'term-and-renewal',
  'termination',
  'liability',
  'indemnity',
  'ip-and-ownership',
  'confidentiality',
  'data-protection',
  'warranties',
  'payment',
  'regulatory',
  'change-control',
  'exit',
];

const FAMILY_PATTERNS: Record<string, RegExp> = {
  'term-and-renewal': /\b(term|renewal|renew|effective date|expiry|expiration|notice period)\b/i,
  termination: /\b(terminat|for cause|for convenience|cure period|rescind)\b/i,
  liability: /\b(liabilit|consequential|indirect loss|limitation of liability|liability cap|damages)\b/i,
  indemnity: /\b(indemnif|hold harmless|defend|defence)\b/i,
  'ip-and-ownership': /\b(intellectual property|ownership|work made for hire|assign|assignment|licen[cs]e)\b/i,
  confidentiality: /\b(confidential|non-disclosure|nda|proprietary)\b/i,
  'data-protection': /\b(gdpr|personal data|data protection|sub-processor|controller|processor|privacy)\b/i,
  warranties: /\b(warrant|disclaim|as is|remedy|service level|sla)\b/i,
  payment: /\b(payment|invoice|fees|price|indexation|set-off|net \d+)\b/i,
  regulatory: /\b(compliance|regulat|audit|soc ?2|hipaa|iso ?\d+|pci)\b/i,
  'change-control': /\b(change order|change control|scope change|price adjustment)\b/i,
  exit: /\b(exit|transition assistance|data return|termination assistance|migration)\b/i,
};

/** Positions the practice takes, keyed by family. Mirrors knowledge/contract-playbooks.md. */
const FAMILY_POSITIONS: Record<string, string> = {
  'term-and-renewal': 'Auto-renewal is acceptable; silence is not. Notice should be at least 30 days and the falling-due date recorded.',
  termination: 'Termination for cause should carry a cure period. Termination for convenience should be mutual, or fee-bearing and declining.',
  liability: 'The cap should be a multiple of 12 months of fees and not below required insurance. Excluding indirect and consequential loss is expected; no cap at all is an unallocated risk.',
  indemnity: 'Indemnities should be mutual where risk is comparable, with the indemnifying party controlling the defence. Survival stated in years.',
  'ip-and-ownership': 'Pre-existing IP stays with its creator under licence. Assignment of background IP is a finding.',
  confidentiality: 'Definition specific enough to exclude independently developed information. Duration stated; five years standard.',
  'data-protection': 'Roles stated, sub-processor changes notified with an objection right, breach notice within 72 hours for personal data.',
  warranties: 'Express warranty for a stated period with a repair/replace/refund ladder. Disclaimer acceptable only alongside it.',
  payment: 'Terms reflect supplier size; above 60 days from a small supplier is a commercial finding. Indexation on a published index.',
  regulatory: 'Every compliance covenant carries a remedy, an audit right and a termination trigger.',
  'change-control': 'Scope changes priced in advance, in writing, with a defined acceptance step.',
  exit: 'Data return in a usable format and transition assistance for a defined period where the vendor holds dependency.',
};

function classify(text: string): string[] {
  return CLAUSE_FAMILIES.filter((family) => FAMILY_PATTERNS[family].test(text));
}

/* ------------------------------------------------------------------ */
/* legal-draft                                                          */
/* ------------------------------------------------------------------ */

const DRAFT = createDeclarativeCodeSkill({
  id: 'legal-draft',
  name: 'Draft Legal Document',
  description:
    'Assembles a first-draft legal document from supplied parties, terms and document type, with every clause family it could not fill marked as requiring input. Produces a document for the lawyer to revise; it does not send or file anything.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        enum: ['nda', 'msa', 'sow', 'dpa', 'employment', 'consulting', 'lease', 'licence'],
        description: 'Type of document to draft',
      },
      partyDetails: {
        type: 'object',
        description: 'The parties: name, role, address, jurisdiction for each',
      },
      terms: {
        type: 'object',
        description: 'Supplied commercial terms: dates, fees, notice periods and any special terms',
      },
      clauses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra clause text to include verbatim',
      },
      dryRun: SchemaProps.boolean({ description: 'Report the structure without generating the draft' }),
    },
    required: ['documentType'],
  },
  outputSchema: LEGAL_RESULT_SCHEMA,
  triggers: [],
  tier: 'aid',
  domainKnowledge: 'Legal drafting: document structure by type, clause family sequencing, party and term capture, and marking the gaps that must be filled before a draft is reviewable',
  isSkill: false,
  manifest: { configSchema: LEGAL_CONFIG_SCHEMA, lowerOrderTools: [] },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const documentType = String(input.documentType || '').trim();
    if (!documentType) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No document type was supplied; there is nothing to draft.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to draft',
            kind: 'text',
            body: 'Supply a documentType — one of: nda, msa, sow, dpa, employment, consulting, lease, licence.',
          },
        ],
      };
    }

    const parties = (input.partyDetails || {}) as Record<string, unknown>;
    const terms = (input.terms || {}) as Record<string, unknown>;
    const partyNames = Object.keys(parties).filter((k) => parties[k]);
    const supplied = Object.keys(terms).filter((k) => terms[k] != null && terms[k] !== '');

    const lines: string[] = [];
    lines.push(`Draft ${documentType.toUpperCase()}`);
    lines.push('='.repeat(`Draft ${documentType.toUpperCase()}`.length));
    lines.push('');

    if (input.dryRun !== false) {
      lines.push('Structure only — no clause text generated (dry run).');
      lines.push('');
      lines.push('Clause families this document will need:');
      for (const family of CLAUSE_FAMILIES) {
        const covered = FAMILY_PATTERNS[family].test(Object.keys(terms).join(' ')) ? ' (term supplied)' : '';
        lines.push(`  - ${family}${covered}`);
      }
    } else {
      lines.push('This is a working draft for review. It is not advice and has not been checked');
      lines.push('against the counterparty paper, which governs where the two differ.');
      lines.push('');

      if (partyNames.length) {
        lines.push('PARTIES');
        for (const name of partyNames) {
          const detail = parties[name];
          lines.push(`  ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
        }
        lines.push('');
      } else {
        lines.push('PARTIES');
        lines.push('  [REQUIRED: party names, roles and jurisdictions were not supplied]');
        lines.push('');
      }

      lines.push('TERMS');
      if (supplied.length) {
        for (const key of supplied) {
          lines.push(`  ${key}: ${JSON.stringify(terms[key])}`);
        }
      } else {
        lines.push('  [REQUIRED: no commercial terms were supplied]');
      }
      lines.push('');

      lines.push('CLAUSES');
      for (const family of CLAUSE_FAMILIES) {
        const suppliedTerm = supplied.find((k) => FAMILY_PATTERNS[family].test(k));
        if (suppliedTerm) {
          lines.push(`  ${family} — from supplied term "${suppliedTerm}": ${JSON.stringify(terms[suppliedTerm])}`);
        } else {
          lines.push(`  ${family} — [REQUIRED: no term supplied] position: ${FAMILY_POSITIONS[family]}`);
        }
      }
      lines.push('');

      if (Array.isArray(input.clauses) && input.clauses.length) {
        lines.push('SUPPLIED CLAUSE TEXT');
        input.clauses.forEach((c: unknown, i: number) => {
          lines.push(`  ${i + 1}. ${String(c)}`);
        });
        lines.push('');
      }
    }

    const missing = CLAUSE_FAMILIES.filter(
      (f) => !supplied.some((k) => FAMILY_PATTERNS[f].test(k)),
    ).length;

    ctx.store.save('legal-drafts', [
      ...(ctx.store.load('legal-drafts', []) || []),
      { documentType, partyNames, suppliedTerms: supplied, missingFamilies: missing, createdAt: new Date().toISOString() },
    ]);

    return {
      success: true,
      status: input.dryRun === false ? 'ok' : 'dry-run',
      data: {
        documentType,
        partyNames,
        suppliedTerms: supplied,
        requiredInput: missing,
        familiesCovered: CLAUSE_FAMILIES.length - missing,
        source: 'supplied-input',
      },
      error: null,
      present: [
        { id: 'draft', title: `Draft ${documentType.toUpperCase()}`, kind: 'text', body: lines.join(NL) },
      ],
    };
  },
});

/* ------------------------------------------------------------------ */
/* legal-redline                                                        */
/* ------------------------------------------------------------------ */

const REDLINE = createDeclarativeCodeSkill({
  id: 'legal-redline',
  name: 'Redline Document',
  description:
    'Compares an original and a proposed text, reports every changed clause family, and marks the risk variance each change carries against the practice position. Produces markup for a lawyer to work from; it does not send or file anything.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      originalText: { type: 'string', description: 'The document as it stands', multiline: true },
      proposedText: { type: 'string', description: 'The counterparty or drafter\'s proposed text', multiline: true },
    },
    required: ['originalText', 'proposedText'],
  },
  outputSchema: LEGAL_RESULT_SCHEMA,
  triggers: [],
  tier: 'aid',
  domainKnowledge: 'Contract comparison: clause family presence, removal and addition, risk variance weighting, and the limits of a presence test against a clause-by-clause review',
  isSkill: false,
  manifest: { configSchema: LEGAL_CONFIG_SCHEMA, lowerOrderTools: [] },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const original = String(input.originalText || '');
    const proposed = String(input.proposedText || '');
    if (!original.trim() || !proposed.trim()) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'Both originalText and proposedText are required; a redline needs two texts.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to compare',
            kind: 'text',
            body: 'Supply both originalText and proposedText.',
          },
        ],
      };
    }

    const origFamilies = classify(original);
    const propFamilies = classify(proposed);

    // A family the counterparty dropped is the dangerous direction: the clause
    // is not stricter, it is gone.
    const removed = origFamilies.filter((f) => !propFamilies.includes(f));
    const added = propFamilies.filter((f) => !origFamilies.includes(f));
    const retained = origFamilies.filter((f) => propFamilies.includes(f));

    const origWords = original.split(/\s+/).filter(Boolean).length;
    const propWords = proposed.split(/\s+/).filter(Boolean).length;
    const delta = propWords - origWords;

    const lines: string[] = [];
    lines.push('Redline Summary');
    lines.push('===============');
    lines.push('');
    lines.push(`Original:  ${origWords} words, ${origFamilies.length} clause families`);
    lines.push(`Proposed:  ${propWords} words, ${propFamilies.length} clause families`);
    lines.push(`Net change: ${delta >= 0 ? '+' : ''}${delta} words`);
    lines.push('');

    if (removed.length) {
      lines.push('REMOVED BY THE PROPOSAL — these are the ones to push back on');
      for (const f of removed) lines.push(`  - ${f}: ${FAMILY_POSITIONS[f]}`);
      lines.push('');
    }
    if (added.length) {
      lines.push('ADDED BY THE PROPOSAL');
      for (const f of added) lines.push(`  - ${f}: ${FAMILY_POSITIONS[f]}`);
      lines.push('');
    }
    if (retained.length) {
      lines.push('RETAINED — still need a clause-by-clause read');
      for (const f of retained) lines.push(`  - ${f}`);
      lines.push('');
    }
    if (!removed.length && !added.length) {
      lines.push('No clause family changed presence. Wording within a family may still have');
      lines.push('moved; the family test is presence, not substance.');
      lines.push('');
    }

    lines.push('This is a presence comparison, not a clause-by-clause review. A family can');
    lines.push('survive the test and still have had its substance reversed.');

    // Risk variance: removal is the costly direction, so it carries the weight.
    const riskScore = Math.min(100, removed.length * 15 + added.length * 5);

    ctx.store.save('legal-redlines', [
      ...(ctx.store.load('legal-redlines', []) || []),
      { removed, added, retained, deltaWords: delta, riskScore, createdAt: new Date().toISOString() },
    ]);

    return {
      success: true,
      status: 'ok',
      data: {
        removedFamilies: removed,
        addedFamilies: added,
        retainedFamilies: retained,
        netWordDelta: delta,
        riskScore,
        riskBand: riskScore >= 45 ? 'high' : riskScore >= 15 ? 'moderate' : 'low',
        source: 'supplied-input',
      },
      error: null,
      present: [{ id: 'redline', title: 'Redline Summary', kind: 'text', body: lines.join(NL) }],
    };
  },
});

/* ------------------------------------------------------------------ */
/* legal-analyze-clauses                                                */
/* ------------------------------------------------------------------ */

const ANALYZE_CLAUSES = createDeclarativeCodeSkill({
  id: 'legal-analyze-clauses',
  name: 'Analyse Clauses',
  description:
    'Classifies supplied clause text into clause families, compares each against the practice position for that family, and scores the divergence. Reports from the text given; it does not read a contract store or fetch anything.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      clauseText: { type: 'string', description: 'The clause text to analyse', multiline: true },
      targetStandard: {
        type: 'string',
        description: 'Standard to compare against; defaults to the house position in the contract playbook',
      },
    },
    required: ['clauseText'],
  },
  outputSchema: LEGAL_RESULT_SCHEMA,
  triggers: [],
  tier: 'advise',
  domainKnowledge: 'Clause classification across the twelve contract families, comparison against the house position, and scoring divergence per family rather than per document',
  isSkill: false,
  manifest: { configSchema: LEGAL_CONFIG_SCHEMA, lowerOrderTools: [] },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const text = String(input.clauseText || '');
    if (!text.trim()) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No clause text was supplied; there is nothing to analyse.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to analyse',
            kind: 'text',
            body: 'Supply clauseText — the wording to be assessed.',
          },
        ],
      };
    }

    const found = classify(text);
    const standard = String(input.targetStandard || 'house position in knowledge/contract-playbooks.md');
    const unspecified = found.length === 0;

    // One family carries the whole risk score when the clause is single-purpose;
    // a multi-family clause divides it, because each is read separately.
    const perFamily = found.length ? Math.round(100 / found.length) : 0;

    const lines: string[] = [];
    lines.push('Clause Analysis');
    lines.push('===============');
    lines.push('');
    lines.push(`Compared against: ${standard}`);
    lines.push('');

    if (unspecified) {
      lines.push('No clause family was recognised in this text. Either it is not a clause, or it');
      lines.push('is drafted unusually enough that automated classification is not safe to rely');
      lines.push('on. Read it by hand.');
    } else {
      for (const family of found) {
        lines.push(`${family.toUpperCase()}`);
        lines.push(`  risk: ${perFamily} of 100 (each family scored separately)`);
        lines.push(`  position: ${FAMILY_POSITIONS[family]}`);
        lines.push('');
      }
    }

    const result = {
      families: found,
      familyCount: found.length,
      riskScore: unspecified ? 0 : perFamily,
      riskBand: unspecified ? 'unclassified' : perFamily >= 50 ? 'high' : perFamily >= 25 ? 'moderate' : 'low',
      standard,
      source: 'supplied-input',
    };

    ctx.store.save('legal-clause-analyses', [
      ...(ctx.store.load('legal-clause-analyses', []) || []),
      { ...result, createdAt: new Date().toISOString() },
    ]);

    return {
      success: true,
      status: unspecified ? 'not-connected' : 'ok',
      data: result,
      error: unspecified ? 'No clause family was recognised; the text was not scored.' : null,
      present: [{ id: 'analysis', title: 'Clause Analysis', kind: 'text', body: lines.join(NL) }],
    };
  },
});

/* ------------------------------------------------------------------ */
/* legal-finalize                                                       */
/* ------------------------------------------------------------------ */

const FINALIZE = createDeclarativeCodeSkill({
  id: 'legal-finalize',
  name: 'Finalize Document',
  description:
    'Takes reviewed document text, strips redline artefacts and drafting placeholders, and returns a clean reading copy. The output is a work product for the user to review and deliver themselves; nothing is sent, filed or executed.',
  persistenceEnvVar: 'LEGAL_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      documentText: { type: 'string', description: 'The reviewed document text', multiline: true },
      removeComments: {
        type: 'boolean',
        description: 'Strip reviewer comments as well as redline marks',
        default: true,
      },
    },
    required: ['documentText'],
  },
  outputSchema: LEGAL_RESULT_SCHEMA,
  triggers: [],
  tier: 'aid',
  domainKnowledge: 'Document finalisation: redline artefact removal, drafting placeholder detection, and the reading copy a lawyer reviews before delivery',
  isSkill: false,
  manifest: { configSchema: LEGAL_CONFIG_SCHEMA, lowerOrderTools: [] },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const original = String(input.documentText || '');
    if (!original.trim()) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No document text was supplied; there is nothing to finalise.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to finalise',
            kind: 'text',
            body: 'Supply documentText — the reviewed text.',
          },
        ],
      };
    }

    // Placeholders that survived drafting are the last thing to catch: shipping a
    // document containing [REQUIRED: ...] or a TBD is the failure this catches.
    const placeholders = original.match(/\[[A-Z][A-Z :_\-[\]/]*\]|\bTBD\b|\bTODO\b|\bXXX\b/gi) || [];
    const stripped = original
      .split(NL)
      .filter((l) => {
        const t = l.trim();
        if (!t) return true;
        if (input.removeComments !== false && /^(>>|\/\*|<!--)/.test(t)) return false;
        return true;
      })
      .join(NL)
      .replace(/\[+\[|\]\+]/g, '[')
      // collapse the whitespace a hand-marked document accumulates
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const unresolved = stripped.match(/\[[A-Z][A-Z :_\-[\]/]*\]|\bTBD\b|\bTODO\b|\bXXX\b/gi) || [];

    const lines: string[] = [];
    lines.push('Final Reading Copy');
    lines.push('==================');
    lines.push('');
    lines.push(`Original: ${original.split(/\s+/).filter(Boolean).length} words`);
    lines.push(`Final:    ${stripped.split(/\s+/).filter(Boolean).length} words`);
    lines.push('');

    if (unresolved.length) {
      lines.push('UNRESOLVED PLACEHOLDERS — this document is not ready to send');
      for (const p of new Set(unresolved)) lines.push(`  ${p}`);
      lines.push('');
    } else {
      lines.push('No unresolved drafting placeholders were found.');
      lines.push('');
    }

    lines.push('');
    lines.push(stripped);

    ctx.store.save('legal-finalized', [
      ...(ctx.store.load('legal-finalized', []) || []),
      {
        placeholdersRemoved: placeholders.length,
        unresolved: unresolved.length,
        wordCount: stripped.split(/\s+/).filter(Boolean).length,
        createdAt: new Date().toISOString(),
      },
    ]);

    return {
      success: unresolved.length === 0,
      status: unresolved.length === 0 ? 'ok' : 'blocked',
      data: {
        text: stripped,
        placeholdersRemoved: placeholders.length,
        unresolvedPlaceholders: unresolved,
        wordCount: stripped.split(/\s+/).filter(Boolean).length,
        readyToSend: unresolved.length === 0,
        source: 'supplied-input',
      },
      error: unresolved.length === 0 ? null : `${unresolved.length} unresolved drafting placeholder(s) remain.`,
      present: [{ id: 'final', title: 'Final Reading Copy', kind: 'text', body: lines.join(NL) }],
    };
  },
});

export { DRAFT, REDLINE, ANALYZE_CLAUSES, FINALIZE };
