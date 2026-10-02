// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_COMPENSATION_BATTLECARD_INPUT = {
  type: 'object',
  properties: {
    company: { type: 'string', description: 'Company you are interviewing with', title: 'Company', order: 1, hint: 'The company you are interviewing with' },
    targetRole: { type: 'string', description: 'Target role title', title: 'Target Role', order: 2, hint: 'The role you are interviewing for', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'title', 'x-referenceLabel': 'your job search results' },
  },
  required: [],
};

const INTERVIEW_COMPENSATION_BATTLECARD = createDeclarativeCodeSkill({
  id: 'career-interview-compensation-battlecard-creator',
  name: 'Interview & Negotiation Prep',
  description: 'Generates a tailored interview Q&A briefing and a compensation negotiation script for a specific company. Delegates to career-interview-prep and career-advisory where available.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: INTERVIEW_COMPENSATION_BATTLECARD_INPUT,
  outputSchema: careerResultSchema('Interview briefing with questions and negotiation guide, derived from inputs'),
  triggers: [
    { kind: 'user', phrase_examples: ['Prepare me for this interview', 'Interview prep checklist', 'Compensation negotiation script'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  manifest: {
    lowerOrderTools: ['career-interview-prep', 'career-advisory'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Create interview briefing',
    // Must stay strictly inside nginx's 60s default proxy_read_timeout on
    // /api, with headroom for the teardown that follows the deadline. At 60000
    // it equalled the proxy budget exactly, so the 504 always won the tie. The
    // 44000 emit budget above must also stay under it, or the graceful
    // not-connected flush never runs.
    timeoutMs: 52000
  },
  handler: async function handler(input, ctx) {
      const role = input.targetRole || '';
      const company = input.company || '';
      const NL = '\n';

      // Deadline budget. nginx proxies /api with the default proxy_read_timeout of
      // 60s, so this skill must always answer inside that window. The manifest
      // timeoutMs below is 52000, and the bridge close, fs cleanup and JSON
      // serialisation that follow the deadline consume the rest.
      //
      // The budget is what actually guarantees the emit. CodeExecutor only returns the
      // child's captured stdout when the child exits cleanly (proc 'close' with code 0);
      // its SIGKILL path discards stdout entirely. So a script still awaiting at 52s
      // yields a bare timeout error, not a result. On expiry this flushes a
      // not-connected result and exits 0.
      //
      // 44000, raised from 30000. A run is sequential per topic -- delegation, then a
      // direct brain call only if that failed -- so the worst case is the SUM of the
      // two per-topic deadlines below. At the old 30000 budget that sum (43s) could
      // not fit, which is precisely how a healthy brain came to be reported offline.
      const SKILL_BUDGET_MS = Number(ctx.config?.skillBudgetMs) > 0
      ? Number(ctx.config?.skillBudgetMs)
      : 44000;
      // Bound on waiting for a delegated tool. The nested call exposes no signal of
      // its own, so this caps how long the skill WAITS for it; the request keeps
      // running in the parent and the child simply stops blocking on it. Sized to the
      // observed 23s delegation latency (a 27s outlier is capped and falls through to
      // the brain call), and to leave room for the fallback inside SKILL_BUDGET_MS.
      const DELEGATED_TIMEOUT_MS = Number(ctx.config?.delegatedTimeoutMs) > 0
      ? Number(ctx.config?.delegatedTimeoutMs)
      : 24000;
      // Bound on a single direct brain call, matching the SPORTS_REQUEST_TIMEOUT_MS
      // pattern in sports-battlecard-creator.ts. Without it a brain that accepts the
      // connection and never responds hangs the skill until the outer SIGKILL.
      //
      // 19000, not 10000: observed brain latency for these two prompts is 16-19s, so a
      // 10s abort discarded answers the brain had already produced. Aborting tears
      // down only the client socket, so the brain still ran to completion and logged a
      // full-duration OK while the skill treated the topic as unanswered -- which is
      // what made the Brain log and the skill's verdict disagree.
      const BRAIN_FALLBACK_TIMEOUT_MS = Number(ctx.config?.brainFallbackTimeoutMs) > 0
      ? Number(ctx.config?.brainFallbackTimeoutMs)
      : 19000;

      let settled = false;

      function payload(success, status, data, error, present) {
      return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
      }

      // Emits exactly one result and exits immediately, dropping any handle left open
      // by work still in flight. process.exit inside the write callback guarantees
      // stdout is flushed first, which a bare process.exit(0) would not.
      function emitAndExit(success, status, data, error, present) {
      if (settled) return;
      settled = true;
      const out = JSON.stringify(payload(success, status, data, error, present));
      process.stdout.write(out + '\n', function () { process.exit(0); });
      }

      const NOT_CONNECTED_BODY = [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Interview preparation requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.' }];
      const NOT_CONNECTED_ERROR = 'Interview prep and negotiation guidance are unavailable; set brainEndpoint in this Skill configuration and ensure the assistant model is reachable';

      // __execute_tool has two return shapes, and conflating them is what made a
      // healthy brain look dead.
      //
      //   - a skill callee emits { success, status, data, ... } as JSON, which the
      //     bridge parses and hands back verbatim;
      //   - a reasoning callee (career-interview-prep, career-advisory are both
      //     type: 'reasoning' base tools) produces a ToolExecution shaped
      //     { status: 'completed', output: { summary, _raw, ... } } with NO 'success'
      //     key at all. The bridge only ever sets success:false, on failure.
      //
      // So result.success is undefined for a delegation that in fact succeeded.
      // Treating that as failure recorded two working brain calls as missing, fired a
      // redundant direct-brain fallback for each, and pushed the skill past its
      // deadline. Unwrap both shapes, and decide success on presence of usable text.
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

      // Pulls displayable text out of a delegation payload. A reasoning callee returns
      // { summary, _raw, _model, ... } where summary is the model's answer.
      function delegatedText(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') return payload.trim() ? payload : null;
      if (typeof payload !== 'object') return null;
      if (typeof payload.summary === 'string' && payload.summary.trim()) return payload.summary;
      if (typeof payload._raw === 'string' && payload._raw.trim()) return payload._raw;
      return null;
      }

      // Resolves a topic from its delegated tool, falling back to a direct brain call
      // only when the delegation yields nothing usable. The fallback is deliberately
      // NOT started concurrently: it asks the same brain for the same content, so
      // racing them would spend a second pair of brain calls on every healthy run just
      // to discard the slower answer. Sequential costs an extra call only when the
      // delegation actually failed.
      function resolveTopic(toolId, toolInput, brainPrompt, brainUnwrap) {
      return (async function () {
        let raw = null;
        try {
          raw = await withDeadline(ctx.delegate(toolId, toolInput), DELEGATED_TIMEOUT_MS);
        } catch (e) {
          raw = null;
        }
        const payload = unwrapDelegated(raw);
        const text = delegatedText(payload);
        if (text) return { via: 'delegated', payload: payload, text: text };
        const direct = await callBrain(brainPrompt);
        const brainPayload = brainUnwrap(direct);
        const brainText = delegatedText(brainPayload);
        return brainText ? { via: 'brain', payload: brainPayload, text: brainText } : null;
      })();
      }

      // Caps how long a step is waited on without cancelling it.
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
      return String(ctx.config?.brainEndpoint || '').trim();
      }

      async function callBrain(prompt) {
      // Never dial a port that may not be served: with no BRAIN_URL configured the
      // caller falls straight through to the not-connected emit.
      const base = brainBaseUrl();
      if (!base) return null;
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, BRAIN_FALLBACK_TIMEOUT_MS);
      try {
        const res = await fetch(base + '/api/brain/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            systemPrompt: 'You are a career coach. Provide concise, practical guidance.',
            prompt: prompt,
            options: { temperature: 0.4, maxTokens: 2048 },
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content || data.summary || null;
      } catch (e) {
        return null;
      } finally {
        clearTimeout(timer);
      }
      }

      const work = (async function () {
      const delegatedTo = [];
      const coverage = [];
      const missing = [];
      const brainBacked = [];

      let questions = [];
      let negotiation = null;
      let sourceNote = null;

      if (role || company) {
      const brainPrompt = 'Generate 5-7 interview questions for a ' + (role || 'role') + ' position' + (company ? ' at ' + company : '') + '. Focus on the specific challenges, culture, and role expectations. Format as a plain list.';
      const negoPrompt = 'Generate compensation negotiation advice for a ' + (role || 'role') + ' position' + (company ? ' at ' + company : '') + '. Include market rate context, what to negotiate beyond base salary, and key tactics.';

      // A direct brain answer is plain prose, so the question list is split on
      // newlines exactly as the previous sequential fallback did; without this the
      // whole answer renders as one bullet.
      function brainPrepPayload(t) {
        if (!t) return null;
        return { summary: t, questions: t.split('\n').filter(function (l) { return l.trim().length > 0; }) };
      }
      function brainProsePayload(t) {
        return t ? { summary: t } : null;
      }

      // The two topics are independent, so they run together; each waits on its own
      // delegation and only then, if that produced nothing, on its own brain call.
      // A run costs 2 brain calls when the delegations work and 4 when they do not,
      // rather than always paying for a fallback whose answer is thrown away.
      const [prepResult, advisoryResult] = await Promise.all([
        resolveTopic('career-interview-prep', { targetRole: role, company: company }, brainPrompt, brainPrepPayload),
        resolveTopic('career-advisory', { question: 'Generate compensation negotiation points for a ' + (role || 'role') + ' position at ' + (company || 'the company'), targetRole: role, company: company }, negoPrompt, brainProsePayload),
      ]);

      if (prepResult) {
        if (prepResult.via === 'delegated') delegatedTo.push('career-interview-prep');
        else brainBacked.push('interview-prep');
        coverage.push('interview-prep');
        const d = prepResult.payload;
        questions = d.questions || d.q_and_a || (delegatedText(d) ? [delegatedText(d)] : []);
      } else {
        missing.push('interview-prep');
      }

      if (advisoryResult) {
        if (advisoryResult.via === 'delegated') delegatedTo.push('career-advisory');
        else brainBacked.push('negotiation-advice');
        coverage.push('negotiation-advice');
        negotiation = advisoryResult.text;
      } else {
        missing.push('negotiation-advice');
      }

      if (brainBacked.length) {
        sourceNote = 'Generated via direct brain call (' + brainBacked.join(', ') + ').';
      }
      }

      if (!questions.length && !negotiation) {
      return { success: false, status: 'not-connected', data: null, error: NOT_CONNECTED_ERROR, present: NOT_CONNECTED_BODY };
      return null;
      }

      const briefing = {
      company: company,
      targetRole: role,
      questions: typeof questions === 'string' ? [questions] : questions,
      negotiation: negotiation ? String(negotiation) : null,
      generatedAt: new Date().toISOString(),
      delegatedTo,
      coverage,
      missing,
      sourceNote,
      };

      const present = [];
      present.push({ id: 'interview-questions', title: 'Interview Questions', kind: 'text', body: (typeof questions === 'string' ? questions : questions.map(function (q) { return '- ' + q; }).join(NL)) || '(No questions available.)' });
      if (negotiation) {
      present.push({ id: 'negotiation-script', title: 'Compensation Negotiation', kind: 'text', body: String(negotiation) });
      }
      if (sourceNote) {
      present.push({ id: 'source', title: 'Source', kind: 'text', body: sourceNote });
      }

      return { success: true, status: 'ok', data: briefing, error: null, present: present };
      })();

      let budgetTimer = null;
      const budget = new Promise(function (resolve) {
      budgetTimer = setTimeout(function () { resolve('budget-exhausted'); }, SKILL_BUDGET_MS);
      });

      const outcome = await Promise.race([work, budget]);
      // Released on both paths so a settled run does not hold the child open until the
      // budget would have fired.
      clearTimeout(budgetTimer);

      if (outcome === 'budget-exhausted') {
      // This is the skill's own deadline expiring, not evidence about the brain. The
      // previous wording claimed the brain "did not respond" and pointed at
      // BRAIN_URL and quota, which sent the investigation after a healthy service
      // that had in fact answered every request. Say what is actually known.
      emitAndExit(false, 'not-connected', null, 'Interview prep and negotiation guidance did not complete within the ' + Math.round(SKILL_BUDGET_MS / 1000) + 's deadline of this skill. The assistant model (brain) may still be processing the request; retry, and check the Brain activity log for the matching entries', NOT_CONNECTED_BODY);
      }
      return outcome;
    }
  });
INTERVIEW_COMPENSATION_BATTLECARD.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;
export { INTERVIEW_COMPENSATION_BATTLECARD };
