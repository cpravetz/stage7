// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { PLAN_CAMPAIGN_OUTPUT_SCHEMA } from '../marketing-contract';

export const PLAN_CAMPAIGN = createDeclarativeCodeSkill({
  id: 'plan-campaign',
  tier: 'advise',
  isSkill: true,
  name: 'Plan Campaign',
  description: 'Plan a marketing campaign with budget, channels, and timeline.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'string', description: 'Name or description of the product being marketed' },
      budget: { type: 'number', description: 'Total budget allocated for the campaign in currency units' },
      channels: { type: 'array', items: { type: 'string' }, description: 'List of marketing channels to use (e.g., email, social, search, display)' },
    },
  },
  outputSchema: PLAN_CAMPAIGN_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ["Plan a campaign", "Define campaign", "Create campaign plan"] },
  ],
  manifest: {
    lowerOrderTools: ['marketing-campaign-planner'],
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const product = input.product || '';
      const budget = Number(input.budget) || 0;
      const channels = Array.isArray(input.channels) ? input.channels : [];

      const store = ctx.store.load('campaigns', []);
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
              systemPrompt: 'You are a marketing campaign planner. Return only the finished JSON object, no prose or fences.',
              prompt: prompt,
              options: { temperature: 0.4, maxTokens: 4096 },
            }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data.content || data.summary || null;
        } catch (e) {
          return null;
        }
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

      const toolInput = { product, budget, channels };
      const brainPrompt =
        'You are planning a marketing campaign from the details supplied below. ' +
        'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
        'The JSON must have exactly this shape:\n' +
        '{\n' +
        '  "id": "<campaign id string>",\n' +
        '  "product": "<product name or description>",\n' +
        '  "budget": <number>,\n' +
        '  "channels": ["<channel>"],\n' +
        '  "timeline": [ { "phase": "<phase name>", "channel": "<channel>", "allocation": <number>, "duration": "<duration>", "activities": ["<activity>"], "kpis": ["<kpi name or focus>"] } ],\n' +
        '  "kpis": [ { "name": "<kpi name>", "target": "<target value>", "metric": "<metric definition>" } ],\n' +
        '  "strategy": "<overall campaign strategy>",\n' +
        '  "audience": "<target audience definition>",\n' +
        '  "messaging": "<core messaging and value proposition>",\n' +
        '  "createdAt": "<ISO-8601 timestamp>",\n' +
        '  "source": "brain"\n' +
        '}\n\n' +
        'Rules — follow every one of them:\n' +
        '1. Generate concrete timeline phases, channel allocations, activities, and phase KPIs from the supplied product, budget, and channels. Do not return empty timeline or kpis arrays.\n' +
        '2. Channel allocations across the timeline must sum to the supplied budget.\n' +
        '3. Generate meaningful campaign-level KPIs with targets and metrics appropriate to the supplied channels and goals.\n' +
        '4. Generate a clear strategy, audience definition, and messaging grounded in the supplied product and channels.\n' +
        '5. Return JSON only.\n\n' +
        'Input:\n' + JSON.stringify(toolInput, null, 2);

      function parsePlan(value) {
        if (!value) return null;
        if (typeof value === 'object' && Array.isArray(value.timeline) && Array.isArray(value.kpis)) return value;
        const text = delegatedText(value);
        if (!text) return null;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.timeline) && Array.isArray(parsed.kpis)) return parsed;
        } catch {}
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.timeline) && Array.isArray(parsed.kpis)) return parsed;
          } catch {}
        }
        return null;
      }

      let parsed = null;
      try {
        const raw = await withDeadline(ctx.delegate('marketing-campaign-planner', toolInput), DELEGATED_TIMEOUT_MS);
        const payload = unwrapDelegated(raw);
        parsed = parsePlan(payload);
      } catch (e) {
        parsed = null;
      }

      let via = parsed ? 'delegated' : null;
      if (!parsed) {
        const direct = await callBrain(brainPrompt);
        parsed = parsePlan(direct);
        via = parsed ? 'brain' : null;
      }

      if (!parsed) {
        const lines = [
          'No campaign plan was produced. The assistant model did not return a usable plan.',
          '',
          'Retry, or check the Brain activity log.',
        ];
        return {
          success: false,
          status: 'not-connected',
          data: { campaign: null },
          error: 'Not connected: no usable campaign plan could be generated',
          present: [{ id: 'notice', title: 'No campaign plan available', kind: 'text', body: lines.join(NL) }],
        };
      }

      const campaign = {
        id: parsed.id || ('campaign_' + Date.now()),
        product: parsed.product || product,
        budget: typeof parsed.budget === 'number' ? parsed.budget : budget,
        channels: Array.isArray(parsed.channels) ? parsed.channels : channels,
        timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
        kpis: Array.isArray(parsed.kpis) ? parsed.kpis : [],
        strategy: parsed.strategy || '',
        audience: parsed.audience || '',
        messaging: parsed.messaging || '',
        createdAt: parsed.createdAt || new Date().toISOString(),
        source: via || parsed.source || 'brain',
      };

      store.push(campaign);
      ctx.store.save('campaigns', store);

      const present = [];
      const lines = [];
      lines.push('Campaign plan for ' + (campaign.product || 'product') + ' (budget: ' + campaign.budget + ').');
      lines.push('Channels: ' + (campaign.channels || []).join(', '));
      if (via) lines.push('Generated via ' + via + ' call.');
      lines.push('');
      if (campaign.strategy) { lines.push('Strategy: ' + campaign.strategy); lines.push(''); }
      if (campaign.audience) { lines.push('Audience: ' + campaign.audience); lines.push(''); }
      if (campaign.messaging) { lines.push('Messaging: ' + campaign.messaging); lines.push(''); }
      if (Array.isArray(campaign.timeline) && campaign.timeline.length) {
        lines.push('Timeline:');
        campaign.timeline.forEach(function (p, i) {
          const label = p.phase || ('Phase ' + (i + 1));
          const ch = p.channel ? (' [' + p.channel + ']') : '';
          const alloc = (p.allocation != null) ? (' allocation=' + p.allocation) : '';
          const dur = p.duration ? (' duration=' + p.duration) : '';
          lines.push('  - ' + label + ch + alloc + dur);
          if (Array.isArray(p.activities) && p.activities.length) lines.push('    activities: ' + p.activities.join('; '));
          if (Array.isArray(p.kpis) && p.kpis.length) lines.push('    kpis: ' + p.kpis.join(', '));
        });
        lines.push('');
      }
      if (Array.isArray(campaign.kpis) && campaign.kpis.length) {
        lines.push('KPIs:');
        campaign.kpis.forEach(function (k) {
          const name = k && k.name ? k.name : String(k);
          const target = k && k.target ? (' target=' + k.target) : '';
          const metric = k && k.metric ? (' metric=' + k.metric) : '';
          lines.push('  - ' + name + target + metric);
        });
      }
      present.push({ id: 'campaign-plan', title: 'Campaign Plan', kind: 'text', body: lines.join(NL) });

      return {
        success: true,
        status: 'ok',
        data: { campaign: campaign, storePath: ctx.store.getFilePath('campaigns') },
        error: null,
        present: present,
      };
    }
  });
