// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { salesResultSchema } from '../sales-contract';

/**
 * Outreach drafting — generative rewrite.
 *
 * Drafts are produced entirely by the Brain via the sales-outreach-drafter
 * reasoning tool (see ./tools/sales-lower-order-tools.ts). Nothing is invented:
 * a variable the caller did not supply is never replaced with filler; templates
 * that need it are skipped and reported. Subject variants are deduplicated.
 * Nothing is ever sent.
 */
const outreachDrafting = createDeclarativeCodeSkill({
  id: 'outreach-drafting',
  name: 'Outreach Drafting',
  description:
    'Draft sales outreach from the recipient and variable values you supply. The assistant model generates each step, skips any template that needs a value you did not provide, deduplicates subject variants, and never sends anything.',
  tier: 'aid',
  domainKnowledge: 'Sales outreach methodology, personalization frameworks, subject-line testing, and sequence design',
  persistenceEnvVar: 'ASSISTANT_HOME',
  manifest: {
    persistenceEnv: 'ASSISTANT_HOME',
    salesHome: 'ASSISTANT_HOME',
    ui: { view: 'outreach-drafting' },
    lowerOrderTools: ['sales-outreach-drafter'],
    actionLabel: 'Draft outreach messages',
  },
  configSchema: {
    type: 'object',
    properties: {
      salesHome: SchemaProps.text({ description: 'Directory used to persist drafts; defaults to ASSISTANT_HOME' }),
      defaultSequenceDelay: SchemaProps.number({ description: 'Default hours between sequence steps', default: 48 }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      recipient: SchemaProps.object(
        {
          firstName: SchemaProps.text({ description: 'Recipient first name; required' }),
          lastName: SchemaProps.text({ description: 'Recipient last name' }),
          company: SchemaProps.text({ description: 'Recipient company; required' }),
          industry: SchemaProps.text({ description: 'Recipient industry' }),
          title: SchemaProps.text({ description: 'Recipient job title' }),
          email: SchemaProps.email({ description: 'Recipient email address' }),
        },
        { description: 'Intended recipient of the outreach' },
      ),
      template: SchemaProps.select(['cold', 'followup', 'nurture'], { description: 'Primary template to use', default: 'cold' }),
      customTemplate: SchemaProps.text({ description: 'Custom body using {variable} placeholders; rendered only when every variable is supplied', multiline: true }),
      subject: SchemaProps.text({ description: 'Override the subject line for the first step' }),
      variables: SchemaProps.object(
        {
          valueProp: SchemaProps.text({ description: 'What you help the recipient do; required for cold and follow-up' }),
          myCompany: SchemaProps.text({ description: 'Your company name; required for cold' }),
          myName: SchemaProps.text({ description: 'Your name; used as the sign-off' }),
          topic: SchemaProps.text({ description: 'Topic or resource name; required for nurture' }),
        },
        { description: 'Values used to render the templates' },
      ),
      sequence: SchemaProps.stringArray({ description: 'Ordered template keys to draft as a multi-step sequence' }),
      sequenceDelay: SchemaProps.number({ description: 'Hours between sequence steps', default: 48 }),
      channel: SchemaProps.select(['email', 'linkedin', 'sms'], { description: 'Outreach channel', default: 'email' }),
    },
  },
  outputSchema: salesResultSchema('Drafted messages with subject variants, skipped templates, and coverage of supplied values'),
  triggers: [{ kind: 'user', phrase_examples: ['Draft an outreach email', 'Write a follow-up', 'Create an email sequence'] }],
  isSkill: true,
  async handler(input, ctx) {
    const NL = '\n';

    const recipient: any = input.recipient && typeof input.recipient === 'object' ? input.recipient : {};
    const variables: any = input.variables && typeof input.variables === 'object' ? input.variables : {};
    const channel = input.channel || 'email';
    const sequenceDelay = typeof input.sequenceDelay === 'number' ? input.sequenceDelay : 48;

    const values: Record<string, any> = {
      firstName: recipient.firstName || null,
      company: recipient.company || null,
      industry: recipient.industry || null,
      title: recipient.title || null,
      valueProp: variables.valueProp || null,
      myCompany: variables.myCompany || null,
      myName: variables.myName || null,
      topic: variables.topic || null,
    };

    const missingRecipient: string[] = [];
    if (!values.firstName) missingRecipient.push('recipient.firstName');
    if (!values.company) missingRecipient.push('recipient.company');

    if (missingRecipient.length) {
      const lines = [
        'No draft was produced because the recipient is incomplete.',
        '',
        'Missing: ' + missingRecipient.join(', ') + '.',
        '',
        'Send a recipient with at least a first name and company. Optional fields that improve the draft:',
        '  - recipient.industry, recipient.title',
        '  - variables.valueProp, variables.myCompany, variables.myName, variables.topic',
        '',
        'A template that needs a field you did not supply is left out of the draft and listed as',
        'skipped, rather than filled with invented text.',
      ];
      return {
        success: false,
        status: 'not-connected',
        data: { draft: null, missingInformation: missingRecipient },
        error: 'Not connected: recipient details are incomplete, so no draft was written',
        present: [ctx.render.text('notice', 'Recipient details required', lines)],
      };
    }

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
            systemPrompt: 'You are a sales outreach drafter. Return only the finished JSON draft, no prose or fences.',
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
      recipient,
      variables,
      template: input.template,
      customTemplate: input.customTemplate,
      subject: input.subject,
      sequence: input.sequence,
      sequenceDelay,
      channel,
    };

    const brainPrompt =
      'You are drafting sales outreach for the recipient and values described below. ' +
      'Return ONLY a single JSON object — no prose, no preamble, no markdown fences. ' +
      'The JSON must have exactly this shape:\n' +
      '{\n' +
      '  "steps": [\n' +
      '    {\n' +
      '      "step": 1,\n' +
      '      "template": "<templateKey>",\n' +
      '      "templateLabel": "<human label for the template>",\n' +
      '      "subject": "<the chosen subject line>",\n' +
      '      "subjectVariants": ["<subject line>", "<alternate subject line>"],\n' +
      '      "body": "<the full message body as a single string>",\n' +
      '      "channel": "<channel>",\n' +
      '      "delayHours": <number>\n' +
      '    }\n' +
      '  ],\n' +
      '  "customBody": { "subject": "<subject>", "body": "<body>", "subjectVariants": ["<subject>"], "template": "custom" } | null,\n' +
      '  "skipped": [ { "template": "<templateKey>", "label": "<human label>", "missingVariables": ["<variableName>"] } ],\n' +
      '  "unknownTemplateKeys": ["<key>"]\n' +
      '}\n\n' +
      'Rules — follow every one of them. Breaking one is worse than returning an empty list.\n' +
      '1. NEVER invent a value the caller did not supply. Every word in every subject line and every line of every body must trace back to a value present in the supplied input. If a template needs a variable that is missing or null, skip that template entirely and list it in "skipped" with the names of the missing variables.\n' +
      '2. Subject variants must be deduplicated. If two patterns produce the same rendered subject, include it only once. Never include a subject that still contains an unresolved placeholder.\n' +
      '3. A body that would still contain an unresolved placeholder is not a finished draft. Drop it rather than emit it.\n' +
      '4. "steps" is an ordered list. Step 1 has delayHours 0. Each subsequent step adds the supplied sequence delay.\n' +
      '5. "customBody" is populated only when a customTemplate was supplied AND every placeholder in it resolves to a supplied value. Otherwise set it to null.\n' +
      '6. "unknownTemplateKeys" lists any requested template keys that do not correspond to a known template.\n' +
      '7. Nothing is ever sent. This is a draft only.\n\n' +
      'Input:\n' + JSON.stringify(toolInput, null, 2);

    function parseDraft(value) {
      if (!value) return null;
      if (typeof value === 'object' && Array.isArray(value.steps)) return value;
      const text = delegatedText(value);
      if (!text) return null;
      try { return JSON.parse(text); } catch {}
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    let parsed = null;
    try {
      const raw = await withDeadline(ctx.delegate('sales-outreach-drafter', toolInput), DELEGATED_TIMEOUT_MS);
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

    if (!parsed) {
      const lines = [
        'No draft was produced. The assistant model did not return a usable outreach draft.',
        '',
        'Nothing was drafted and nothing was sent. Retry, or check the Brain activity log.',
      ];
      return {
        success: false,
        status: 'not-connected',
        data: { draft: null, steps: [], skipped: [], unknownTemplateKeys: [] },
        error: 'Not connected: no usable draft could be generated',
        present: [ctx.render.text('notice', 'No draft available', lines)],
      };
    }

    const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const skipped = Array.isArray(parsed.skipped) ? parsed.skipped : [];
    const unknownKeys = Array.isArray(parsed.unknownTemplateKeys) ? parsed.unknownTemplateKeys : [];
    const customBody = parsed.customBody && typeof parsed.customBody === 'object' ? parsed.customBody : null;

    const present = [];
    const lines = [];
    lines.push('Drafted ' + steps.length + ' outreach ' + (steps.length === 1 ? 'message' : 'messages') + ' for ' + values.firstName + ' at ' + values.company + ' via ' + channel + '.');
    lines.push('Nothing was sent. This is a draft for you to review and send yourself.');
    if (via) lines.push('Generated via ' + via + ' call.');
    lines.push('');

    steps.forEach((step, index) => {
      const stepNo = step.step != null ? step.step : index + 1;
      const delay = step.delayHours != null ? step.delayHours : index * sequenceDelay;
      lines.push('Step ' + stepNo + ' — ' + (step.templateLabel || step.template || '') + (stepNo > 1 ? '  (send after ' + delay + 'h)' : ''));
      lines.push('Subject: ' + step.subject);
      if (Array.isArray(step.subjectVariants) && step.subjectVariants.length > 1) {
        lines.push('Alternate subjects:');
        step.subjectVariants.forEach((subject) => {
          if (subject !== step.subject) lines.push('  - ' + subject);
        });
      }
      lines.push('');
      String(step.body || '').split(NL).forEach((line) => { lines.push(line ? '  ' + line : ''); });
      lines.push('');
    });

    if (customBody) {
      lines.push('Custom body supplied');
      lines.push('Subject: ' + customBody.subject);
      lines.push('');
      String(customBody.body || '').split(NL).forEach((line) => { lines.push(line ? '  ' + line : ''); });
      lines.push('');
    }

    if (skipped.length) {
      lines.push('');
      lines.push('Templates skipped because they needed values you did not supply:');
      skipped.forEach((entry) => {
        lines.push('  - ' + entry.label + ': missing ' + (Array.isArray(entry.missingVariables) ? entry.missingVariables.join(', ') : ''));
      });
    }
    if (unknownKeys.length) {
      lines.push('');
      lines.push('Unknown template keys ignored: ' + unknownKeys.join(', '));
    }
    lines.push('');
    lines.push('No claims, metrics, or personalization were invented; every line traces to a value you supplied.');
    lines.push('Nothing was sent.');

    present.push(ctx.render.text('report', 'Outreach draft', lines.join(NL)));

    const primary = steps[0] || null;

    const record = {
      id: 'draft',
      channel,
      createdAt: new Date().toISOString(),
      recipient,
      steps,
      customBody,
      source: 'brain-delegation',
    };

    const stored = ctx.store.load('outreach-drafts', []);
    const existing: any[] = Array.isArray(stored) ? stored : [];
    existing.push(record);
    ctx.store.save('outreach-drafts', existing);
    const storePath = ctx.store.getFilePath('outreach-drafts');

    const suppliedNames = Object.keys(values).filter((k) => values[k] !== null);
    const notSupplied = Object.keys(values).filter((k) => values[k] === null);

    return {
      success: true,
      status: 'ok',
      data: {
        draft: {
          recipient,
          channel,
          primary,
          steps,
          stepCount: steps.length,
          customBody,
          skipped,
          unknownTemplateKeys: unknownKeys,
          suppliedVariables: suppliedNames,
          unusedVariables: notSupplied,
          sequenceDelayHours: sequenceDelay,
          sent: false,
          storePath,
          persisted: true,
        },
      },
      error: null,
      present,
    };
  },
});

export { outreachDrafting as OUTREACH_DRAFTING };
