// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * User half of the response-drafting split. It was event-triggered
 * ("Ticket classification output is available") while requiring customerMessage,
 * which that event does not supply -- so the trigger promised automation the
 * input schema could not satisfy. This half is now user-triggered, which is what
 * the required input actually implied. The notifier half
 * (response-drafting-notifier) owns the automated path and reads its queued
 * messages from configured stores.
 */
const RESPONSE_DRAFTING_USER = createDeclarativeCodeSkill({
  id: 'response-drafting-user',
  name: 'Response Drafting',
  description: 'Draft a support reply to a customer message you supply, using KB articles and response templates.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  tier: 'aid',
  domainKnowledge: 'Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage',
  inputSchema: {
    type: 'object',
    properties: {
      ticket: SchemaProps.text({ description: 'Ticket identifier for the response' }),
      customerMessage: SchemaProps.text({ description: 'Customer message to respond to' }),
      tone: SchemaProps.select(['professional', 'friendly', 'empathetic', 'technical'], { description: 'Tone of the generated response', default: 'empathetic' }),
      template: SchemaProps.text({ description: 'Response template to use' }),
      includeKB: SchemaProps.boolean({ description: 'Whether to include knowledge base references', default: true }),
      suggestedActions: SchemaProps.stringArray({ description: 'Suggested next steps' }),
    },
    required: ['customerMessage'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      response: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'response'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Draft a reply to this customer',
        'Write a response to this ticket',
        'Help me respond to this message',
      ],
    },
  ],
  isSkill: true,
  manifest: {
    lowerOrderTools: ['support-response-drafter'],
  },
  handler: async function handler(input, ctx) {
    const ticketId = input.ticket || '';
    const customerMessage = input.customerMessage || '';
    const tone = input.tone || 'empathetic';
    const template = input.template || '';
    const includeKB = input.includeKB !== false;
    const suggestedActions = input.suggestedActions || [];
    const NL = '\n';

    const kbArticles = includeKB ? ctx.store.load('kb', []) : [];
    const templates = ctx.store.load('templates', []);
    const tmpl = template ? templates.find((x) => (x.name || x.id) === template) : null;
    const tmplBody = tmpl ? (tmpl.body || tmpl.content || '') : '';

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

    function delegatedText(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') return cleanDelegatedText(payload);
      if (typeof payload !== 'object') return null;
      if (typeof payload.summary === 'string' && payload.summary.trim()) return cleanDelegatedText(payload.summary);
      if (typeof payload._raw === 'string' && payload._raw.trim()) return cleanDelegatedText(payload._raw);
      return null;
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
            systemPrompt: 'Reply with the finished deliverable only. Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique.',
            prompt,
            options: { temperature: 0.4, maxTokens: 2048 },
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content || data.summary || null;
      } catch (e) {
        return null;
      }
    }

    function parseDraft(raw, source) {
      if (!raw) return null;
      let obj = raw;
      if (typeof raw === 'string') {
        const cleaned = cleanDelegatedText(raw) || raw.trim();
        try {
          obj = JSON.parse(cleaned);
        } catch (e) {
          const m = cleaned.match(/\{[\s\S]*\}/);
          if (m) {
            try { obj = JSON.parse(m[0]); } catch (_) { return null; }
          } else {
            return null;
          }
        }
      }
      if (!obj || typeof obj !== 'object') return null;
      const nowIso = new Date().toISOString();
      return {
        ticketId: String(obj.ticketId || ticketId || ''),
        response: String(obj.response || obj.summary || ''),
        alternatives: Array.isArray(obj.alternatives) ? obj.alternatives.map(String) : [],
        confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.8,
        suggestedActions: Array.isArray(obj.suggestedActions) ? obj.suggestedActions.map(String) : suggestedActions,
        kbReferences: Array.isArray(obj.kbReferences) ? obj.kbReferences.map(String) : [],
        tone: String(obj.tone || tone),
        template: obj.template != null ? String(obj.template) : (template || null),
        createdAt: String(obj.createdAt || nowIso),
        source: String(obj.source || source || 'brain'),
      };
    }

    const delegationInput = {
      ticket: ticketId,
      customerMessage,
      tone,
      template: template || null,
      includeKB,
      suggestedActions,
      kbArticles: kbArticles.slice(0, 5).map((a) => ({ id: a.id, title: a.title || a.id })),
      tmplBody,
    };

    let draft = null;
    try {
      const raw = await ctx.delegate('support-response-drafter', delegationInput);
      const payload = unwrapDelegated(raw);
      if (payload) {
        draft = parseDraft(payload, 'delegated');
        if (!draft) {
          const text = delegatedText(payload);
          if (text) draft = parseDraft(text, 'delegated');
        }
      }
    } catch (e) {
      draft = null;
    }

    if (!draft) {
      const prompt =
        'Draft a customer support reply and return ONLY a JSON object with shape {ticketId,response,alternatives,confidence,suggestedActions,kbReferences,tone,template,createdAt,source}. ' +
        'Use only this material. Customer message: ' + customerMessage +
        '. Tone: ' + tone +
        '. Ticket: ' + ticketId +
        '. KB article titles: ' + JSON.stringify(kbArticles.slice(0, 5).map((a) => a.title || a.id)) +
        '. Response template body: ' + (tmplBody || '(none)') +
        '. Suggested actions: ' + JSON.stringify(suggestedActions) + '.';
      const direct = await callBrain(prompt);
      draft = parseDraft(direct, 'brain');
    }

    if (!draft || !draft.response) {
      return {
        success: false,
        status: 'not-connected',
        response: null,
        error: 'Support response drafting is unavailable; ensure the assistant model is reachable.',
        present: [
          ctx.render.text('error', 'Not Connected', 'Support response drafting requires a reachable assistant model. Contact your administrator to verify model availability.'),
        ],
      };
    }

    const store = ctx.store.load('responses', []);
    store.push(draft);
    ctx.store.save('responses', store);

    return {
      success: true,
      data: { response: draft, storePath: ctx.store.getFilePath('responses') },
      present: [
        ctx.render.text('report', 'Drafted Response', [
          'Ticket: ' + (draft.ticketId || '(unspecified)'),
          'Tone: ' + draft.tone,
          draft.kbReferences.length ? 'KB references: ' + draft.kbReferences.join(', ') : 'KB references: none',
          '',
          draft.response || '(no response body produced)',
          '',
          'Alternatives:',
          '  - ' + (draft.alternatives[0] || '(none)'),
          '  - ' + (draft.alternatives[1] || '(none)'),
          '',
          'Stored at: ' + ctx.store.getFilePath('responses'),
        ]),
      ],
    };
  },
});

export { RESPONSE_DRAFTING_USER };
