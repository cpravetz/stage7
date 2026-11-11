// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const CREATE_ROADMAP = createDeclarativeCodeSkill({
    id: 'create-roadmap',
    tier: 'advise',
    isSkill: true,
    name: 'Create Roadmap',
    description: 'Generate a product roadmap with RICE-prioritized goals, topologically-sorted initiatives, capacity planning, milestones, risk assessment, theme allocation, and OKR alignment.',
    persistenceEnvVar: 'ASSISTANT_HOME',
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', description: 'Roadmap quarter (e.g., Q1 2026)' },
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Goal description' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Goal priority' },
              owner: { type: 'string', description: 'Goal owner' },
              reach: { type: 'number', description: 'RICE reach estimate (users affected)' },
              impact: { type: 'number', description: 'RICE impact (0.25-3 scale)' },
              confidence: { type: 'number', description: 'RICE confidence (0-1)' },
              effort: { type: 'number', description: 'RICE effort (person-weeks)' }
            }
          },
          description: 'Business/product goals to prioritize'
        },
        initiatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Initiative name' },
              goals: { type: 'array', items: { type: 'string' }, description: 'Goals this initiative supports' },
              effort: { type: 'number', description: 'Estimated effort in person-weeks' },
              dependencies: { type: 'array', items: { type: 'string' }, description: 'Initiative IDs this depends on' },
              risk: { type: 'number', description: 'Risk score (0-1)' }
            }
          },
          description: 'Initiatives to sequence and schedule'
        },
        themes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Strategic themes to allocate across'
        },
        timeHorizon: { type: 'number', description: 'Number of quarters to plan' },
        capacity: { type: 'number', description: 'Team size (capacity per quarter)' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the roadmap was generated' },
        roadmap: { type: 'object', description: 'Generated roadmap with RICE-scored goals, sequenced initiatives, capacity plan, milestones, risks, OKRs, and themes' },
        okrs: { type: 'array', description: 'OKR objects aligned to each goal' },
        metrics: { type: 'object', description: 'Summary metrics' }
      },
      required: ['success', 'roadmap'],
    },
    triggers: [{ kind: 'user', phrase_examples: ["Create a roadmap", "Plan a release", "Check roadmap status"] }],
    manifest: {
      lowerOrderTools: ['product-slack', 'product-calendar'],
    },
    handler: async function handler(input, ctx) {
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
              systemPrompt: 'You are a senior product manager. Return only the finished roadmap JSON, no prose or fences.',
              prompt: prompt,
              options: { temperature: 0.3, maxTokens: 8192 },
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

        const NOT_CONNECTED_BODY = [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Roadmap generation requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.' }];
        const NOT_CONNECTED_ERROR = 'Roadmap generation is unavailable; set brainEndpoint in this Skill configuration and ensure the assistant model is reachable';

        const toolInput = {
          quarter: input.quarter || '',
          goals: Array.isArray(input.goals) ? input.goals : [],
          initiatives: Array.isArray(input.initiatives) ? input.initiatives : [],
          themes: Array.isArray(input.themes) ? input.themes : [],
          timeHorizon: typeof input.timeHorizon === 'number' ? input.timeHorizon : undefined,
          capacity: typeof input.capacity === 'number' ? input.capacity : undefined,
        };

        const brainPrompt =
          'You are a senior product manager. Generate a product roadmap as a single JSON object — no prose, no preamble, no markdown fences. ' +
          'Return only the finished roadmap JSON.\n\n' +
          'Input:\n' + JSON.stringify(toolInput, null, 2);

        function parseRoadmap(value) {
        if (!value) return null;
        if (typeof value === 'object' && value.quarter) return value;
        const text = delegatedText(value);
        if (!text) return null;
        try { return JSON.parse(text); } catch {}
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { try { return JSON.parse(match[0]); } catch {} }
        return null;
        }

        let parsed = null;
        let via = null;
        try {
          const raw = await withDeadline(ctx.delegate('product-roadmap-generator', toolInput), DELEGATED_TIMEOUT_MS);
          const payload = unwrapDelegated(raw);
          parsed = parseRoadmap(payload);
          via = parsed ? 'delegated' : null;
        } catch (e) {
          parsed = null;
        }

        if (!parsed) {
          const direct = await callBrain(brainPrompt);
          parsed = parseRoadmap(direct);
          via = parsed ? 'brain' : null;
        }

        if (!parsed) {
          return {
            success: false,
            status: 'not-connected',
            data: null,
            error: NOT_CONNECTED_ERROR,
            present: NOT_CONNECTED_BODY,
          };
        }

        const roadmap = parsed;
        const quarter = roadmap.quarter || input.quarter || 'Untitled Quarter';
        const goals = Array.isArray(roadmap.goals) ? roadmap.goals : [];
        const initiatives = Array.isArray(roadmap.initiatives) ? roadmap.initiatives : [];
        const themes = Array.isArray(roadmap.themes) ? roadmap.themes : [];
        const milestones = Array.isArray(roadmap.milestones) ? roadmap.milestones : [];
        const riskAssessment = roadmap.riskAssessment || {};
        const risks = Array.isArray(riskAssessment.risks) ? riskAssessment.risks : [];
        const okrs = Array.isArray(roadmap.okrs) ? roadmap.okrs : [];
        const metrics = roadmap.metrics || {};

        const present = [];
        present.push({ id: 'roadmap-overview', title: 'Roadmap Overview', kind: 'text', body: quarter + '\n\nTime Horizon: ' + (roadmap.timeHorizon != null ? String(roadmap.timeHorizon) : '(not specified)') + ' quarters\n\nCapacity: ' + (roadmap.capacity != null ? String(roadmap.capacity) : '(not specified)') });
        if (goals.length) {
          present.push({ id: 'roadmap-goals', title: 'Goals', kind: 'text', body: goals.map(function (g) { return '- ' + g.text + ' [' + g.priority + '] owner: ' + (g.owner || 'unassigned'); }).join(NL) });
        }
        if (initiatives.length) {
          present.push({ id: 'roadmap-initiatives', title: 'Initiatives', kind: 'text', body: initiatives.map(function (i) { return '- ' + i.text + ' (effort: ' + (i.effort != null ? String(i.effort) : '?') + ', risk: ' + (i.riskLevel || i.risk) + ')'; }).join(NL) });
        }
        if (themes.length) {
          present.push({ id: 'roadmap-themes', title: 'Themes', kind: 'text', body: themes.map(function (t) { return '- ' + t; }).join(NL) });
        }
        if (milestones.length) {
          present.push({ id: 'roadmap-milestones', title: 'Milestones', kind: 'text', body: milestones.map(function (m) { return '- ' + (m.name || 'Milestone') + ' — ' + (m.deliverable || ''); }).join(NL) });
        }
        if (risks.length) {
          present.push({ id: 'roadmap-risks', title: 'Risk Assessment', kind: 'text', body: risks.map(function (r) { return '- ' + r.title + ' — ' + (r.mitigation || ''); }).join(NL) });
        }
        if (okrs.length) {
          present.push({ id: 'roadmap-okrs', title: 'OKRs', kind: 'text', body: okrs.map(function (o) { return '- ' + (o.objective || o.title || 'OKR'); }).join(NL) });
        }
        if (via) {
          present.push({ id: 'roadmap-source', title: 'Source', kind: 'text', body: 'Generated via ' + via + ' call.' });
        }

        const record = {
          id: 'roadmap_' + Date.now(),
          quarter,
          source: 'llm',
          generatedAt: new Date().toISOString(),
          roadmap,
        };

        return {
          success: true,
          status: 'ok',
          data: {
            roadmap: roadmap,
            okrs: okrs,
            metrics: metrics,
            source: 'llm',
            record: record,
          },
          error: null,
          present: present,
        };
      }
    });
