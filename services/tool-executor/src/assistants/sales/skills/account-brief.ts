import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Account brief and MEDDPICC dossier.
 *
 * v9 §2: an `aid` Skill assembles aids and returns a work product. This one
 * produces a document the rep works from; it neither sends it nor writes to a
 * CRM. The CRM write is `sales-crm-sync`, a separate `represent` tool behind
 * the approval gate, so the two cannot be confused for one another.
 *
 * Everything reported is either supplied by the caller or derived arithmetically
 * from what they supplied. Nothing is inferred about the account from the
 * domain, because a plausible-sounding guess about a real company is worse
 * than a blank the rep fills in.
 */
const MEDDPICC_STAGES = [
  { key: 'metrics', label: 'Metrics', question: 'What measurable problem does the buyer have?' },
  { key: 'economicBuyer', label: 'Economic Buyer', question: 'Who signs, and whose budget is this?' },
  { key: 'decisionCriteria', label: 'Decision Criteria', question: 'How will they choose, and against what?' },
  { key: 'decisionProcess', label: 'Decision Process', question: 'What steps, how long, who else is involved?' },
  { key: 'paperProcess', label: 'Paper Process', question: 'What has to be signed, and by when?' },
  { key: 'identifyPain', label: 'Identify Pain', question: 'What breaks if nothing changes?' },
  { key: 'champion', label: 'Champion', question: 'Who sells this internally when the rep is not there?' },
  { key: 'competition', label: 'Competition', question: 'What are they comparing against, including doing nothing?' },
];

const RESULT_SCHEMA = {
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
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'status', 'data', 'error', 'present'],
};

const ACCOUNT_BRIEF_GENERATOR = createDeclarativeCodeSkill({
  id: 'sales-account-brief-generator',
  name: 'Account Brief Generator',
  description:
    'Builds a full account brief and MEDDPICC dossier from supplied company and persona detail, marking every stage the caller has not answered. Returns a document for the rep to work from; it does not contact the account or write to a CRM.',
  persistenceEnvVar: 'SALES_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      companyDomain: { type: 'string', description: 'Company domain or name the brief is about' },
      targetPersonas: {
        type: 'array',
        items: { type: 'object' },
        description: 'People being targeted: name, role, seniority and known priorities',
      },
      accountNotes: { type: 'string', description: 'What the rep already knows about the account', multiline: true },
      dealValue: { type: 'number', description: 'Estimated deal value, used to report coverage ratios' },
      competitors: { type: 'array', items: { type: 'string' }, description: 'Known competitors in the deal' },
      meddpicc: {
        type: 'object',
        description: 'Answers keyed by MEDDPICC stage, as far as they are known',
      },
    },
    required: ['companyDomain'],
  },
  outputSchema: RESULT_SCHEMA,
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Build an account brief for northwind.example',
        'Draft the MEDDPICC dossier for this account',
        'What do I still need to find out about them',
      ],
    },
  ],
  tier: 'aid',
  domainKnowledge:
    'MEDDPICC qualification methodology, account planning, buyer persona mapping, competitive framing, and deal coverage math',
  isSkill: true,
  manifest: { actionLabel: 'Build account brief', lowerOrderTools: ['sales-crm-sync'] },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const company = String(input.companyDomain || '').trim();
    if (!company) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'No company was supplied; there is no account to brief.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to brief',
            kind: 'text',
            body: 'Supply companyDomain — the company or domain the brief is about.',
          },
        ],
      };
    }

    const personas = Array.isArray(input.targetPersonas) ? input.targetPersonas : [];
    const answers = (input.meddpicc || {}) as Record<string, unknown>;
    const competitors = Array.isArray(input.competitors) ? input.competitors.map(String) : [];
    const dealValue = Number(input.dealValue || 0);

    const answered = MEDDPICC_STAGES.filter(
      (s) => answers[s.key] != null && String(answers[s.key]).trim() !== '',
    );
    const gaps = MEDDPICC_STAGES.filter((s) => !answered.includes(s));

    // Coverage is answered stages over total. It is deliberately a progress
    // measure of the rep's knowledge, not a score of the deal's worth.
    const coverage = Math.round((answered.length / MEDDPICC_STAGES.length) * 100);

    const lines: string[] = [];
    lines.push(`Account Brief — ${company}`);
    lines.push('='.repeat(`Account Brief — ${company}`.length));
    lines.push('');
    lines.push(`MEDDPICC coverage: ${answered.length}/${MEDDPICC_STAGES.length} (${coverage}%)`);
    if (dealValue > 0) lines.push(`Deal value: ${dealValue.toLocaleString()}`);
    lines.push('');

    lines.push('TARGET PERSONAS');
    if (personas.length) {
      for (const p of personas) {
        const rec = (p || {}) as Record<string, unknown>;
        const who = [rec.name, rec.role, rec.seniority].filter(Boolean).map(String).join(' — ');
        lines.push(`  ${who || '(unnamed)'}`);
        if (rec.priorities) lines.push(`      priorities: ${String(rec.priorities)}`);
      }
    } else {
      lines.push('  [REQUIRED: no personas supplied]');
    }
    lines.push('');

    lines.push('MEDDPICC');
    for (const stage of MEDDPICC_STAGES) {
      const answer = answers[stage.key];
      if (answer != null && String(answer).trim() !== '') {
        lines.push(`  [x] ${stage.label} — ${stage.question}`);
        lines.push(`      ${String(answer)}`);
      } else {
        lines.push(`  [ ] ${stage.label} — ${stage.question}`);
      }
    }
    lines.push('');

    lines.push('COMPETITION');
    if (competitors.length) {
      for (const c of competitors) lines.push(`  - ${c}`);
      lines.push('  - (always include the incumbent, including "do nothing")');
    } else {
      lines.push('  [REQUIRED: none recorded] — include the incumbent, including "do nothing"');
    }
    lines.push('');

    if (input.accountNotes) {
      lines.push('REP NOTES');
      lines.push(String(input.accountNotes));
      lines.push('');
    }

    if (gaps.length) {
      lines.push('STILL TO FIND OUT');
      for (const g of gaps) lines.push(`  - ${g.label}: ${g.question}`);
      lines.push('');
    }

    lines.push('Prepared from what you supplied. Nothing here was inferred about the company,');
    lines.push('so a blank means it is genuinely unknown, not merely unfound.');

    ctx.store.save('account-briefs', [
      ...(ctx.store.load('account-briefs', []) || []),
      { company, personas: personas.length, coverage, gaps: gaps.map((g) => g.key), createdAt: new Date().toISOString() },
    ]);

    return {
      success: true,
      status: 'ok',
      data: {
        company,
        personaCount: personas.length,
        stagesAnswered: answered.length,
        stagesTotal: MEDDPICC_STAGES.length,
        coveragePercent: coverage,
        gaps: gaps.map((g) => g.key),
        competitors,
        dealValue: dealValue || null,
        source: 'supplied-input',
      },
      error: null,
      present: [
        { id: 'brief', title: `Account Brief — ${company}`, kind: 'text', body: lines.join(NL) },
      ],
    };
  },
});

export { ACCOUNT_BRIEF_GENERATOR };
