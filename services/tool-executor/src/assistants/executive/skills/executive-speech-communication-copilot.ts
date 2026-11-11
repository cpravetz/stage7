// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { executiveResultSchema } from '../executive-contract';

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return;
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    property.order = typeof property.order === 'number' ? property.order : index + 1;
    property.hint = property.hint || property.description || 'See the tool documentation for details.';
  });
  return schema;
}

const SAFETY_BOUNDARY = 'Executive communication advisory only: drafts are for review and editing; do not send without human approval.';

const SPEECH_INPUT = createSchemaRecord({
  occasion: SchemaProps.text({ description: 'Event or occasion (e.g., "Annual All-Hands", "Board Meeting Q3", "Crisis Response")' }),
  audience: SchemaProps.text({ description: 'Target audience (e.g., "All employees", "Board of Directors", "Investors", "Customers")' }),
  keyMessages: SchemaProps.stringArray({ description: 'Core messages to convey (3-5 max)' }),
  tone: SchemaProps.select(['executive', 'inspirational', 'authoritative', 'conversational', 'empathetic-authoritative', 'visionary'], { description: 'Communication tone', default: 'executive' }),
  length: SchemaProps.select(['short', 'medium', 'long'], { description: 'Target length', default: 'medium' }),
  format: SchemaProps.select(['speech', 'board-comm', 'stakeholder-message', 'crisis-statement'], { description: 'Communication format', default: 'speech' }),
  context: SchemaProps.text({ description: 'Additional context, background, or constraints', multiline: true }),
  constraints: SchemaProps.stringArray({ description: 'Legal, compliance, or stylistic constraints' }),
  subject: SchemaProps.text({ description: 'Subject line (for board/stakeholder formats)' }),
  channel: SchemaProps.select(['email', 'slack', 'letter', 'video-script', 'linkedin'], { description: 'Delivery channel (for stakeholder-message)' }),
  priority: SchemaProps.select(['standard', 'urgent', 'confidential'], { description: 'Priority level (for board-comm)' }),
  urgency: SchemaProps.select(['immediate', 'within-hour', 'today', 'this-week'], { description: 'Urgency level (for crisis-statement)' }),
}, { required: [] });

const SPEECH_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to ASSISTANT_HOME' }),
});

export const SPEECH_COMMUNICATION_COPILOT = createDeclarativeCodeSkill({
  id: 'executive-speech-communication-copilot',
  name: 'Speech & Communication Co-Pilot',
  description: 'Draft executive speeches, board communications, stakeholder messages, and leadership communications with tone, structure, and messaging guidance.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  tier: 'aid',
  domainKnowledge: 'Executive communication strategy, speechwriting, board governance communication, crisis communication, stakeholder messaging frameworks',
  inputSchema: SPEECH_INPUT,
  outputSchema: executiveResultSchema('Speech and communication drafts with structure and messaging guidance'),
  triggers: [{ kind: 'user', phrase_examples: ['Draft a speech for', 'Write a board communication', 'Create a stakeholder message', 'Prepare crisis communication', 'Help me communicate'] }],
  isSkill: true,
  manifest: {
    configSchema: SPEECH_CONFIG,
    ui: { view: 'speech-communication-copilot' },
    lowerOrderTools: ['executive-communication-drafter'],
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = SAFETY_BOUNDARY;

      function fail(status, message, title, extra) {
        const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
        if (extra) { for (const key in extra) { base[key] = extra[key]; } }
        return base;
      }

      const occasion = input.occasion || '';
      const audience = input.audience || '';
      const keyMessages = Array.isArray(input.keyMessages) ? input.keyMessages : [];
      const tone = input.tone || 'executive';
      const length = input.length || 'medium';
      const format = input.format || 'speech';
      const context = input.context || '';
      const constraints = Array.isArray(input.constraints) ? input.constraints : [];

      if (!occasion && !audience && keyMessages.length === 0) {
        return fail('not-connected', 'Not connected: provide at least occasion, audience, or key messages', 'Input required');
      }

      const store = ctx.store.load('speech-communication-copilot', []);

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
              systemPrompt: 'You are an executive communication drafter. Return only the finished JSON object, no prose or fences.',
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

      const toolInput = {
        format,
        occasion,
        audience,
        keyMessages,
        tone,
        length,
        context,
        constraints,
        subject: input.subject || null,
        channel: input.channel || null,
        priority: input.priority || null,
        urgency: input.urgency || null,
      };

      const brainPrompt =
        'You are drafting an executive communication from the details supplied below. ' +
        'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
        'The JSON must have exactly this shape:\n' +
        '{\n' +
        '  "format": "<speech | board-comm | stakeholder-message | crisis-statement>",\n' +
        '  "occasion": "<occasion>",\n' +
        '  "audience": "<audience>",\n' +
        '  "tone": "<tone>",\n' +
        '  "length": "<short | medium | long>",\n' +
        '  "keyMessages": ["<key message>"],\n' +
        '  "constraints": ["<constraint>"],\n' +
        '  "context": "<additional context>",\n' +
        '  "subject": "<subject line or null>",\n' +
        '  "channel": "<delivery channel or null>",\n' +
        '  "priority": "<priority or null>",\n' +
        '  "urgency": "<urgency or null>",\n' +
        '  "draft": "<the fully-written communication text appropriate to the format>"\n' +
        '}\n\n' +
        'Rules — follow every one of them:\n' +
        '1. "draft" must be the complete, fully-written communication (speech body, board memo, stakeholder message, or crisis statement) appropriate to the requested format, occasion, audience, key messages, tone, length, context, and constraints.\n' +
        '2. Write the actual prose from the supplied details. Never emit a structure template, outline skeleton, or any text with [placeholder] brackets.\n' +
        '3. Include every supplied key message meaningfully in the draft. Reflect the requested tone, length, and any supplied constraints.\n' +
        '4. Echo back format, occasion, audience, tone, length, keyMessages, constraints, context, subject, channel, priority, and urgency from the input (use null for fields not supplied).\n' +
        '5. Return JSON only.\n\n' +
        'Input:\n' + JSON.stringify(toolInput, null, 2);

      function parseDraft(value) {
        if (!value) return null;
        if (typeof value === 'object' && typeof value.draft === 'string') return value;
        const text = delegatedText(value);
        if (!text) return null;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && typeof parsed.draft === 'string') return parsed;
        } catch {}
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && typeof parsed === 'object' && typeof parsed.draft === 'string') return parsed;
          } catch {}
        }
        return null;
      }

      let parsed = null;
      try {
        const raw = await withDeadline(ctx.delegate('executive-communication-drafter', toolInput), DELEGATED_TIMEOUT_MS);
        const payload = unwrapDelegated(raw);
        parsed = parseDraft(payload);
      } catch (e) {
        parsed = null;
      }

      let via = parsed ? 'delegated' : null;
      if (!parsed) {
        const direct = await callBrain(brainPrompt);
        parsed = parseDraft(direct);
        via = parsed ? 'brain' : null;
      }

      if (!parsed || typeof parsed.draft !== 'string' || !parsed.draft.trim()) {
        return fail('not-connected', 'Not connected: the assistant model did not return a usable executive communication draft. Retry, or check the Brain activity log.', 'No draft available');
      }

      const draftText = String(parsed.draft).trim();
      const result = {
        format: parsed.format || format,
        occasion: parsed.occasion || occasion,
        audience: parsed.audience || audience,
        tone: parsed.tone || tone,
        length: parsed.length || length,
        keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages : keyMessages,
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints : constraints,
        context: parsed.context || context,
        subject: parsed.subject != null ? parsed.subject : (input.subject || null),
        channel: parsed.channel != null ? parsed.channel : (input.channel || null),
        priority: parsed.priority != null ? parsed.priority : (input.priority || null),
        urgency: parsed.urgency != null ? parsed.urgency : (input.urgency || null),
        draft: draftText,
        source: via || 'brain',
      };

      store.push(result);
      ctx.store.save('speech-communication-copilot', store);

      const body = draftText + NL + NL + (via ? 'Generated via ' + via + ' call.' + NL + NL : '') + SAFETY;
      return {
        success: true,
        status: 'ok',
        data: result,
        error: null,
        present: [{ id: 'speech-draft', title: 'Executive Communication Draft', kind: 'text', body: body }],
      };
    }
  });
SPEECH_COMMUNICATION_COPILOT.configSchema = SPEECH_CONFIG;
withUxMetadata(SPEECH_COMMUNICATION_COPILOT.inputSchema as SchemaRecord);
if (SPEECH_COMMUNICATION_COPILOT.configSchema) withUxMetadata(SPEECH_COMMUNICATION_COPILOT.configSchema);
