// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const WRITE_PRD = createDeclarativeCodeSkill({
    id: 'write-prd',
    tier: 'aid',
    isSkill: true,
    name: 'Write PRD',
    description: 'Generate a structured product requirements document with INVEST user stories, Given/When/Then acceptance criteria, technical requirements, data model, UX flows, and phased rollout plan.',
    persistenceEnvVar: 'ASSISTANT_HOME',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the PRD' },
        problem: { type: 'string', description: 'Problem statement describing the user or business need' },
        scope: { type: 'string', description: 'Scope and boundaries of the product or feature' },
        goals: { type: 'array', items: { type: 'string' }, description: 'Goals the product should achieve' },
        successMetrics: { type: 'array', items: { type: 'string' }, description: 'Measurable indicators of success' },
        nonGoals: { type: 'array', items: { type: 'string' }, description: 'Items explicitly excluded' },
        openQuestions: { type: 'array', items: { type: 'string' }, description: 'Unresolved questions needing follow-up' },
        targetUsers: { type: 'array', items: { type: 'string' }, description: 'Target user personas' },
        userStories: { type: 'array', items: { type: 'string' }, description: 'Existing user stories' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Technical or business constraints' },
        assumptions: { type: 'array', items: { type: 'string' }, description: 'Assumptions made' },
        risks: { type: 'array', items: { type: 'string' }, description: 'Identified risks' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the PRD was generated' },
        prd: { type: 'object', description: 'The structured PRD with all sections, stories, criteria, requirements, data model, UX, and rollout plan' },
        userStories: { type: 'array', description: 'Generated INVEST user stories with acceptance criteria' },
        acceptanceCriteria: { type: 'array', description: 'Given/When/Then acceptance criteria' },
        rolloutPlan: { type: 'object', description: 'Phased rollout with feature flags and rollback' }
      },
      required: ['success', 'prd'],
    },
    triggers: [{ kind: 'user', phrase_examples: ["Write a PRD", "Update requirements", "Review requirements"] }],
    manifest: {
      lowerOrderTools: ['product-jira', 'product-confluence', 'product-markdown-parsing'],
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
              systemPrompt: 'You are a senior product manager. Return only the finished PRD JSON, no prose or fences.',
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

        const NOT_CONNECTED_BODY = [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'PRD generation requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.' }];
        const NOT_CONNECTED_ERROR = 'PRD generation is unavailable; set brainEndpoint in this Skill configuration and ensure the assistant model is reachable';

        const toolInput = {
          title: input.title || '',
          problem: input.problem || '',
          scope: input.scope || '',
          goals: Array.isArray(input.goals) ? input.goals : [],
          successMetrics: Array.isArray(input.successMetrics) ? input.successMetrics : [],
          nonGoals: Array.isArray(input.nonGoals) ? input.nonGoals : [],
          openQuestions: Array.isArray(input.openQuestions) ? input.openQuestions : [],
          targetUsers: Array.isArray(input.targetUsers) ? input.targetUsers : [],
          userStories: Array.isArray(input.userStories) ? input.userStories : [],
          constraints: Array.isArray(input.constraints) ? input.constraints : [],
          assumptions: Array.isArray(input.assumptions) ? input.assumptions : [],
          risks: Array.isArray(input.risks) ? input.risks : [],
        };

        const brainPrompt =
          'You are a senior product manager. Generate a complete product requirements document as a single JSON object — no prose, no preamble, no markdown fences. ' +
          'Return only the finished PRD JSON.\n\n' +
          'Input:\n' + JSON.stringify(toolInput, null, 2);

        function parsePrd(value) {
        if (!value) return null;
        if (typeof value === 'object' && value.title) return value;
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
          const raw = await withDeadline(ctx.delegate('product-prd-generator', toolInput), DELEGATED_TIMEOUT_MS);
          const payload = unwrapDelegated(raw);
          parsed = parsePrd(payload);
          via = parsed ? 'delegated' : null;
        } catch (e) {
          parsed = null;
        }

        if (!parsed) {
          const direct = await callBrain(brainPrompt);
          parsed = parsePrd(direct);
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

        const prd = parsed;
        const title = prd.title || input.title || 'Untitled PRD';
        const userStories = Array.isArray(prd.userStories) ? prd.userStories : [];
        const acceptanceCriteria = userStories.flatMap((s) => Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : []);
        const techReq = prd.technicalRequirements || {};
        const functional = Array.isArray(techReq.functional) ? techReq.functional : [];
        const nonFunctional = Array.isArray(techReq.nonFunctional) ? techReq.nonFunctional : [];
        const dataReq = prd.dataRequirements || {};
        const entities = Array.isArray(dataReq.entities) ? dataReq.entities : [];
        const uxReq = prd.uxRequirements || {};
        const flows = Array.isArray(uxReq.flows) ? uxReq.flows : [];
        const uiComponents = Array.isArray(uxReq.uiComponents) ? uxReq.uiComponents : [];
        const rolloutPlan = prd.rolloutPlan || {};
        const phases = Array.isArray(rolloutPlan.phases) ? rolloutPlan.phases : [];

        const present = [];
        present.push({ id: 'prd-overview', title: 'PRD Overview', kind: 'text', body: title + '\n\nProblem: ' + (prd.problem || '(none provided)') + '\n\nScope: ' + (prd.scope || '(none provided)') });
        if (prd.goals && prd.goals.length) {
          present.push({ id: 'prd-goals', title: 'Goals', kind: 'text', body: prd.goals.map(function (g) { return '- ' + g; }).join(NL) });
        }
        if (prd.successMetrics && prd.successMetrics.length) {
          present.push({ id: 'prd-metrics', title: 'Success Metrics', kind: 'text', body: prd.successMetrics.map(function (m) { return '- ' + m; }).join(NL) });
        }
        if (userStories.length) {
          present.push({ id: 'prd-user-stories', title: 'User Stories', kind: 'text', body: userStories.map(function (s) { return '- [' + s.id + '] ' + s.text + ' (' + s.userType + ')'; }).join(NL) });
        }
        if (acceptanceCriteria.length) {
          present.push({ id: 'prd-acceptance-criteria', title: 'Acceptance Criteria', kind: 'text', body: acceptanceCriteria.map(function (ac) { return '- ' + ac.given + ' | ' + ac.when + ' | ' + ac.then + ' [' + ac.priority + ']'; }).join(NL) });
        }
        if (functional.length || nonFunctional.length) {
          present.push({ id: 'prd-tech-reqs', title: 'Technical Requirements', kind: 'text', body: 'Functional:\n' + functional.map(function (f) { return '- ' + f.category + ': ' + f.description + ' [' + f.priority + ']'; }).join(NL) + '\n\nNon-Functional:\n' + nonFunctional.map(function (nf) { return '- ' + nf.category + ': ' + nf.description + ' [' + nf.priority + ']'; }).join(NL) });
        }
        if (entities.length) {
          present.push({ id: 'prd-data-reqs', title: 'Data Requirements', kind: 'text', body: entities.map(function (e) { return '- ' + e.name + ': ' + (Array.isArray(e.attributes) ? e.attributes.map(function (a) { return a.name + ' (' + a.type + ')'; }).join(', ') : ''); }).join(NL) });
        }
        if (flows.length || uiComponents.length) {
          present.push({ id: 'prd-ux', title: 'UX Requirements', kind: 'text', body: 'Flows:\n' + flows.map(function (f) { return '- ' + (f.name || 'Flow'); }).join(NL) + '\n\nUI Components:\n' + uiComponents.map(function (c) { return '- ' + (c.component || 'Component'); }).join(NL) });
        }
        if (phases.length) {
          present.push({ id: 'prd-rollout', title: 'Rollout Plan', kind: 'text', body: phases.map(function (p) { return '- ' + (p.name || 'Phase') + ': ' + (p.criteria || ''); }).join(NL) });
        }
        if (via) {
          present.push({ id: 'prd-source', title: 'Source', kind: 'text', body: 'Generated via ' + via + ' call.' });
        }

        const record = {
          id: 'prd_' + Date.now(),
          title,
          source: 'llm',
          generatedAt: new Date().toISOString(),
          prd,
        };

        return {
          success: true,
          status: 'ok',
          data: {
            prd: prd,
            userStories: userStories,
            acceptanceCriteria: acceptanceCriteria,
            rolloutPlan: rolloutPlan,
            source: 'llm',
            record: record,
          },
          error: null,
          present: present,
        };
      }
    });
