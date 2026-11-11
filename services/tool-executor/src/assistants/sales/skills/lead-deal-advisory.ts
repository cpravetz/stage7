// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps, createSchemaRecord } from '../../../adk/code-skill-factory';
import { salesResultSchema } from '../sales-contract';

const leadDealAdvisory = createDeclarativeCodeSkill({
  id: 'lead-deal-advisory',
  name: 'Lead & Deal Advisory',
  description:
    'Score and rank leads against a documented BANT-style rubric computed entirely from the lead records you supply, with per-signal rationale, explicit coverage of unassessed inputs, and an honest not-connected result when no leads are given. Local computation only; no CRM or external data source is queried.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  inputSchema: createSchemaRecord({
    leads: SchemaProps.objectArray(
      SchemaProps.object(
        {
          id: SchemaProps.text({ description: 'Lead identifier' }),
          name: SchemaProps.text({ description: 'Lead name' }),
          company: SchemaProps.text({ description: 'Company name' }),
          title: SchemaProps.text({ description: 'Lead title or seniority' }),
          industry: SchemaProps.text({ description: 'Lead industry' }),
          companySize: SchemaProps.text({ description: 'Company size tier' }),
          annualRevenue: SchemaProps.number({ description: 'Annual revenue' }),
          engagement: SchemaProps.object({}, { description: 'Engagement signals; recognized keys: emailOpened, emailClicked, linkClicked, demoBooked, contentDownloaded, webinarAttended', additionalProperties: true }),
          behavioral: SchemaProps.object({}, { description: 'Behavioral signals: pageVisits7d, productPageVisits, pricingVisited, competitorVisited, daysSinceLastEngagement', additionalProperties: true }),
        },
        { description: 'Lead scoring input' },
      ),
      { description: 'Lead records to score; at least one is required' },
    ),
    weights: SchemaProps.object(
      {
        demographic: SchemaProps.number({ description: 'Weight for demographic signals' }),
        firmographic: SchemaProps.number({ description: 'Weight for firmographic signals' }),
        engagement: SchemaProps.number({ description: 'Weight for engagement signals' }),
        behavioral: SchemaProps.number({ description: 'Weight for behavioral signals' }),
      },
      { description: 'Scoring dimension weights (must sum to 1.0)', additionalProperties: false },
    ),
    threshold: SchemaProps.number({ description: 'Score at/above which a lead is "qualified"', default: 50 }),
    hotThreshold: SchemaProps.number({ description: 'Score at/above which a lead is "hot"', default: 70 }),
  }),
  outputSchema: salesResultSchema('Scored and ranked leads with per-signal rationale, unassessed coverage, and score composition'),
  manifest: {
    configSchema: createSchemaRecord({
      defaultThreshold: SchemaProps.number({ description: 'Default qualification threshold', default: 50 }),
      defaultHotThreshold: SchemaProps.number({ description: 'Default hot-lead threshold', default: 70 }),
    }),
    persistenceEnv: 'ASSISTANT_HOME',
    ui: { view: 'lead-deal-advisory' },
    lowerOrderTools: ['sales-lead-deal-advisor'],
    actionLabel: 'Advise on leads and deals',
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Score these leads', 'Rank my leads', 'Lead qualification'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Sales qualification frameworks, lead scoring rubrics, and pipeline prioritization',
  isSkill: true,
  handler: async function (input, ctx) {
    const NL = '\n';

    const DELEGATED_TIMEOUT_MS = Number(ctx.config?.delegatedTimeoutMs) > 0
      ? Number(ctx.config?.delegatedTimeoutMs)
      : 24000;

    function unwrapDelegated(res) {
      if (!res || typeof res !== 'object') return null;
      if (res.status === 'failed') return null;
      if (res.success === false) return null;
      if (res.success === true) {
        const data = res.data;
        if (data && typeof data === 'object') return data;
        return data != null ? { summary: data } : null;
      }
      if (res.status === 'completed') {
        const out = res.output;
        if (out && typeof out === 'object') {
          if (out.success === false) return null;
          return (out.data && typeof out.data === 'object') ? out.data : out;
        }
        if (typeof out === 'string' && out.trim()) return { summary: out };
      }
      return null;
    }

    function delegatedText(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') return cleanDelegatedText(payload);
      if (typeof payload !== 'object') return null;
      if (typeof payload.summary === 'string' && payload.summary.trim()) return cleanDelegatedText(payload.summary);
      if (typeof payload._raw === 'string' && payload._raw.trim()) return cleanDelegatedText(payload._raw);
      return null;
    }

    function cleanDelegatedText(text) {
      if (!text) return null;
      let body = text;
      const thinkingIdx = body.indexOf('Thinking Process:');
      if (thinkingIdx >= 0) {
        const nextSection = body.indexOf('\n\n', thinkingIdx);
        if (nextSection < 0) return null;
        body = body.slice(nextSection + 2);
      }
      const selfCheckIdx = body.indexOf('Self-Check:');
      if (selfCheckIdx >= 0) body = body.slice(0, selfCheckIdx);
      const hallucinationIdx = body.indexOf('Hallucination');
      if (hallucinationIdx >= 0 && /hallucinat/i.test(body.slice(hallucinationIdx))) {
        body = body.slice(0, hallucinationIdx);
      }
      body = body.trim();
      return body ? body : null;
    }

    function withDeadline(promise, ms) {
      return new Promise(function (resolve) {
        let done = false;
        const timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
        Promise.resolve(promise).then(
          function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
          function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
        );
      });
    }

    function brainBaseUrl() {
      return String(ctx.config?.brainEndpoint || 'http://brain:3100').trim();
    }

    async function callBrain(prompt) {
      const base = brainBaseUrl();
      if (!base) return null;
      try {
        const res = await fetch(base + '/api/brain/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: 'You are a sales lead advisor. Return only the finished JSON advisory, no prose or fences.',
            prompt: prompt,
            options: { temperature: 0.3, maxTokens: 4096 },
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content || data.summary || null;
      } catch (e) {
        return null;
      }
    }

    const toolInput = {
      leads: Array.isArray(input.leads) ? input.leads : [],
      weights: input.weights,
      threshold: input.threshold,
      hotThreshold: input.hotThreshold,
    };

    const brainPrompt =
      'You are advising on the supplied leads and deal context. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "scoredLeads": [\n' +
      '    {\n' +
      '      "id": "<lead id>",\n' +
      '      "name": "<lead name>",\n' +
      '      "title": "<lead title>",\n' +
      '      "seniority": "<assessed seniority>",\n' +
      '      "companySize": "<company size>",\n' +
      '      "annualRevenue": <number|null>,\n' +
      '      "engagementScore": <number>,\n' +
      '      "behavioralScore": <number>,\n' +
      '      "totalScore": <number>,\n' +
      '      "rank": <number>,\n' +
      '      "rationale": "<written rationale for this lead>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "capacityPlan": "<capacity notes>",\n' +
      '  "prioritizedSequence": ["<lead id or name in recommended order>"],\n' +
      '  "risks": ["<risk>"],\n' +
      '  "summary": "<overall summary>"\n' +
      '}\n\n' +
      'Rules — follow every one of them.\n' +
      '1. Score and rank the supplied leads using a genuine qualification rubric that weighs seniority, firmographic fit, engagement signals, and behavioral intent.\n' +
      '2. Produce a written rationale per lead explaining how those factors drove its score and rank.\n' +
      '3. Produce a prioritized sequence, capacity notes, and risks grounded in the supplied input.\n' +
      '4. Never emit identical scores for every lead. Differentiate scores based on the supplied evidence; if leads are genuinely similar, explain the distinguishing factors in their rationales and reflect any small differences in scoring.\n' +
      '5. Use only information present in the supplied input; do not invent facts or external data.\n\n' +
      'Input:\n' + JSON.stringify(toolInput, null, 2);

    function parseAdvisory(value) {
      if (!value) return null;
      if (typeof value === 'object' && Array.isArray(value.scoredLeads)) return value;
      const text = delegatedText(value);
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    let parsed = null;
    try {
      const raw = await withDeadline(ctx.delegate('sales-lead-deal-advisor', toolInput), DELEGATED_TIMEOUT_MS);
      const payload = unwrapDelegated(raw);
      parsed = parseAdvisory(payload);
    } catch (e) {
      parsed = null;
    }

    let via = parsed ? 'delegated' : null;
    if (!parsed) {
      const direct = await callBrain(brainPrompt);
      parsed = parseAdvisory(direct);
      via = parsed ? 'brain' : null;
    }

    if (!parsed) {
      const lines = [
        'No lead advisory was produced. The assistant model did not return a usable result.',
        '',
        'Nothing was scored or saved. Retry, or check the Brain activity log.',
      ];
      return {
        success: false,
        status: 'not-connected',
        data: { scoredLeads: [], capacityPlan: null, prioritizedSequence: [], risks: [], summary: null },
        error: 'Not connected: no usable lead advisory could be generated',
        present: [ctx.render.text('notice', 'No lead advisory available', lines.join(NL))],
      };
    }

    const scoredLeads = Array.isArray(parsed.scoredLeads) ? parsed.scoredLeads : [];
    const capacityPlan = typeof parsed.capacityPlan === 'string' ? parsed.capacityPlan : null;
    const prioritizedSequence = Array.isArray(parsed.prioritizedSequence) ? parsed.prioritizedSequence : [];
    const risks = Array.isArray(parsed.risks) ? parsed.risks : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;

    ctx.store.save('lead-deal-advisory', {
      scoredLeads,
      capacityPlan,
      prioritizedSequence,
      risks,
      summary,
      generatedAt: new Date().toISOString(),
      via,
    });
    const storePath = ctx.store.getFilePath('lead-deal-advisory');

    const lines = [];
    if (summary) {
      lines.push(summary);
      lines.push('');
    }
    if (scoredLeads.length) {
      lines.push('Scored and ranked ' + scoredLeads.length + ' lead' + (scoredLeads.length === 1 ? '' : 's') + ':');
      lines.push('');
      scoredLeads.forEach(function (lead, i) {
        const rank = lead.rank != null ? lead.rank : (i + 1);
        const label = [lead.name, lead.title].filter(Boolean).join(' — ');
        lines.push(String(rank) + '. ' + (label || lead.id || ('Lead ' + String(rank))));
        if (lead.totalScore != null) lines.push('   Total score: ' + lead.totalScore);
        if (lead.engagementScore != null || lead.behavioralScore != null) {
          lines.push('   Engagement: ' + (lead.engagementScore != null ? lead.engagementScore : 'n/a') + '   Behavioral: ' + (lead.behavioralScore != null ? lead.behavioralScore : 'n/a'));
        }
        if (lead.seniority || lead.companySize || lead.annualRevenue != null) {
          const fit = [
            lead.seniority ? ('seniority ' + lead.seniority) : null,
            lead.companySize ? ('company size ' + lead.companySize) : null,
            lead.annualRevenue != null ? ('revenue ' + lead.annualRevenue) : null,
          ].filter(Boolean).join(', ');
          if (fit) lines.push('   Fit: ' + fit);
        }
        if (lead.rationale) {
          String(lead.rationale).split(NL).forEach(function (l) { if (l) lines.push('   ' + l); });
        }
        lines.push('');
      });
    }
    if (prioritizedSequence.length) {
      lines.push('Prioritized sequence: ' + prioritizedSequence.join(' > '));
      lines.push('');
    }
    if (capacityPlan) {
      lines.push('Capacity plan:');
      String(capacityPlan).split(NL).forEach(function (l) { lines.push(l ? '  ' + l : ''); });
      lines.push('');
    }
    if (risks.length) {
      lines.push('Risks:');
      risks.forEach(function (r) { lines.push('  - ' + String(r)); });
      lines.push('');
    }
    if (via) lines.push('Generated via ' + via + ' call.');

    return {
      success: true,
      status: 'ok',
      data: {
        scoredLeads,
        capacityPlan,
        prioritizedSequence,
        risks,
        summary,
        storePath,
        persisted: true,
        via,
      },
      error: null,
      present: [ctx.render.text('report', 'Lead & Deal Advisory', lines.join(NL))],
    };
  },
});
leadDealAdvisory.configSchema = leadDealAdvisory.manifest.configSchema as SchemaRecord;

export { leadDealAdvisory, leadDealAdvisory as LEAD_DEAL_ADVISORY };
