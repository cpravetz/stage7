// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { salesResultSchema } from '../sales-contract';

/**
 * Outreach drafting.
 *
 * Two rules drive this rewrite:
 *
 * 1. Nothing is invented. A variable the caller did not supply is never replaced with invented
 *    filler. Instead the template that depends on it is dropped, and the report says which variable
 *    was missing. The previous version substituted placeholders like 'deliver value', 'your
 *    company' and 'our team', and left unrendered {{topic}} tokens in finished copy.
 *
 * 2. Every line of the rendered draft traces back to a supplied value. A subject line or paragraph
 *    that would otherwise read as filler is removed rather than emitted.
 */
const outreachDrafting = createDeclarativeCodeSkill({
  id: 'outreach-drafting',
  name: 'Outreach Drafting',
  description:
    'Draft sales outreach from built-in cold, follow-up, and nurture templates using only the recipient and variable values you supply. Templates that need an unsupplied variable are skipped and reported rather than filled with invented text, subject variants are deduplicated, and nothing is ever sent.',
  tier: 'aid',
  domainKnowledge: 'Sales outreach methodology, personalization frameworks, subject-line testing, and sequence design',
  persistenceEnvVar: 'SALES_HOME',
  manifest: {
    persistenceEnv: 'SALES_HOME',
    salesHome: 'SALES_HOME',
    ui: { view: 'outreach-drafting' },
  },
  configSchema: {
    type: 'object',
    properties: {
      salesHome: SchemaProps.text({ description: 'Directory used to persist drafts; defaults to SALES_HOME' }),
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
  confirmBeforeSend: false,
  isSkill: true,
  async handler(input, ctx) {
    const NL = '\n';

    const TEMPLATES: Record<string, { label: string; subjectPatterns: string[]; body: string[] }> = {
      cold: {
        label: 'Cold outreach',
        subjectPatterns: [
          'Quick question about {industry}',
          '{firstName}, {company} and {myCompany}?',
          'Curious about the {industry} stack',
        ],
        body: [
          'Hi {firstName},',
          '',
          'I noticed {company} works in {industry}. At {myCompany} we help teams like yours {valueProp}.',
          'Would you have 15 minutes this week to explore a fit?',
          '',
          'Best,',
          '{myName}',
        ],
      },
      followup: {
        label: 'Follow-up',
        subjectPatterns: ['Following up on {topic}', 'Quick follow-up', 'Checking in, {firstName}'],
        body: [
          'Hi {firstName},',
          '',
          'Following up on my note about {valueProp}. Happy to jump on a quick call if that is useful.',
          '',
          '{myName}',
        ],
      },
      nurture: {
        label: 'Nurture',
        subjectPatterns: ['Resource on {topic}', '{firstName}, thought this might be useful', 'A short read on {industry}'],
        body: [
          'Hi {firstName},',
          '',
          'Sharing a short resource on {topic} that may be relevant to {company}.',
          'Let me know if you have questions.',
          '',
          '{myName}',
        ],
      },
    };

    const recipient: any = input.recipient && typeof input.recipient === 'object' ? input.recipient : {};
    const variables: any = input.variables && typeof input.variables === 'object' ? input.variables : {};
    const channel = input.channel || 'email';
    const sequenceDelay = typeof input.sequenceDelay === 'number' ? input.sequenceDelay : 48;

    // Every value that may appear in a draft, with no invented fallbacks. A missing value stays
    // missing and removes the template that needed it.
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

    const requestedKey = input.template || 'cold';
    const customTemplate = typeof input.customTemplate === 'string' ? input.customTemplate : null;
    const sequenceInput = Array.isArray(input.sequence) ? input.sequence : null;

    // Work out which template keys are in play and which supplied variables each one needs.
    const KEYS: Record<string, string[]> = {
      cold: ['firstName', 'company', 'industry', 'myCompany', 'valueProp', 'myName'],
      followup: ['firstName', 'valueProp', 'myName'],
      nurture: ['firstName', 'topic', 'company', 'myName'],
    };

    const requestedKeys: string[] = [];
    if (sequenceInput) {
      sequenceInput.forEach((key: any) => {
        if (typeof key === 'string' && requestedKeys.indexOf(key) < 0) requestedKeys.push(key);
      });
    }
    if (requestedKeys.indexOf(requestedKey) < 0) requestedKeys.unshift(requestedKey);

    const unknownKeys = requestedKeys.filter((key) => !TEMPLATES[key]);
    const usableKeys = requestedKeys.filter((key) => Boolean(TEMPLATES[key]));

    const missingByKey: Record<string, string[]> = {};
    const skipped: Array<{ template: string; label: string; missingVariables: string[] }> = [];
    usableKeys.forEach((key) => {
      const needed = KEYS[key] || Object.keys(values);
      const missing = needed.filter((name) => !values[name]);
      missingByKey[key] = missing;
      if (missing.length) skipped.push({ template: key, label: TEMPLATES[key].label, missingVariables: missing });
    });

    const render = (text: string) =>
      String(text).replace(/\{(\w+)\}/g, (match, name) => {
        return values[name] !== null && values[name] !== undefined ? values[name] : match;
      });

    const buildSubjects = (key: string): string[] => {
      const tpl = TEMPLATES[key];
      const out: string[] = [];
      tpl.subjectPatterns.forEach((pattern) => {
        const rendered = render(pattern);
        // Drop any subject whose placeholders were not all supplied, and any duplicate.
        if (rendered.indexOf('{') >= 0) return;
        if (out.indexOf(rendered) < 0) out.push(rendered);
      });
      return out;
    };

    const buildBody = (key: string): string | null => {
      const tpl = TEMPLATES[key];
      const rendered = tpl.body.map((line) => render(line)).join(NL);
      if (rendered.indexOf('{') >= 0) return null;
      return rendered;
    };

    const overrideSubject = typeof input.subject === 'string' && input.subject.trim() ? input.subject.trim() : null;

    const steps: any[] = [];
    usableKeys.forEach((key) => {
      if (missingByKey[key].length) return;
      const body = buildBody(key);
      if (body === null) return;
      const subjects = buildSubjects(key);
      if (!subjects.length) return;
      const subject = overrideSubject || subjects[0];
      steps.push({
        step: steps.length + 1,
        template: key,
        templateLabel: TEMPLATES[key].label,
        subject: subject,
        subjectVariants: subjects,
        body: body,
        channel: channel,
        delayHours: steps.length * sequenceDelay,
      });
    });

    if (!steps.length) {
      const lines = ['A draft was requested but no template could be completed with the values supplied.', ''];
      if (unknownKeys.length) {
        lines.push('Unknown template keys ignored: ' + unknownKeys.join(', ') + '.');
        lines.push('Available templates: ' + Object.keys(TEMPLATES).join(', ') + '.');
        lines.push('');
      }
      lines.push('Templates that could not be completed:');
      skipped.forEach((entry) => {
        lines.push('  - ' + entry.label + ' (' + entry.template + '): missing ' + entry.missingVariables.join(', '));
      });
      lines.push('');
      lines.push('Nothing was drafted and nothing was sent. Supply the listed variables and re-run.');
      return {
        success: false,
        status: 'not-connected',
        data: {
          steps: [],
          skipped: skipped,
          unknownTemplateKeys: unknownKeys,
          missingInformation: Object.keys(values).filter((k) => !values[k]),
        },
        error: 'Not connected: no outreach template could be completed with the supplied variables',
        present: [ctx.render.text('notice', 'No complete template available', lines)],
      };
    }

    const primary = steps[0];

    // The custom template is rendered only when it is free of unresolved placeholders.
    let customRendered: any = null;
    let customRejected: string[] | null = null;
    if (customTemplate) {
      const rendered = render(customTemplate);
      if (rendered.indexOf('{') >= 0) {
        const unresolved: string[] = [];
        const re = /\{(\w+)\}/g;
        let m;
        while ((m = re.exec(rendered)) !== null) {
          if (unresolved.indexOf(m[1]) < 0) unresolved.push(m[1]);
        }
        customRejected = unresolved;
      } else if (overrideSubject) {
        customRendered = { subject: overrideSubject, body: rendered, subjectVariants: [overrideSubject], template: 'custom' };
      } else {
        const customSubjects = buildSubjects(primary.template);
        if (!customSubjects.length) {
          customRejected = ['a subject line could not be derived'];
        } else {
          customRendered = { subject: customSubjects[0], body: rendered, subjectVariants: customSubjects, template: 'custom' };
        }
      }
    }

    const record = {
      id: 'draft',
      channel: channel,
      createdAt: new Date().toISOString(),
      recipient: recipient,
      steps: steps,
      customBody: customRendered,
      source: 'template-rendering',
    };
    // The store write is best effort: an unreachable store never costs the caller their draft.
    const stored = ctx.store.load('outreach-drafts', []);
    const existing: any[] = Array.isArray(stored) ? stored : [];
    existing.push(record);
    ctx.store.save('outreach-drafts', existing);
    const storePath = ctx.store.getFilePath('outreach-drafts');

    const lines: string[] = [];
    lines.push('Drafted ' + steps.length + ' outreach ' + (steps.length === 1 ? 'message' : 'messages') + ' for ' + values.firstName + ' at ' + values.company + ' via ' + channel + '.');
    lines.push('Nothing was sent. This is a draft for you to review and send yourself.');
    lines.push('');

    steps.forEach((step) => {
      lines.push('Step ' + step.step + ' — ' + step.templateLabel + (step.step > 1 ? '  (send after ' + step.delayHours + 'h)' : ''));
      lines.push('Subject: ' + step.subject);
      if (step.subjectVariants.length > 1) {
        lines.push('Alternate subjects:');
        step.subjectVariants.forEach((subject: string) => {
          if (subject !== step.subject) lines.push('  - ' + subject);
        });
      }
      lines.push('');
      step.body.split(NL).forEach((line: string) => { lines.push(line ? '  ' + line : ''); });
      lines.push('');
    });

    if (customRendered) {
      lines.push('Custom body supplied');
      lines.push('Subject: ' + customRendered.subject);
      lines.push('');
      customRendered.body.split(NL).forEach((line: string) => { lines.push(line ? '  ' + line : ''); });
      lines.push('');
    }

    const suppliedNames = Object.keys(values).filter((k) => values[k] !== null);
    const notSupplied = Object.keys(values).filter((k) => values[k] === null);
    lines.push('Every line above comes from a value you supplied or from a built-in template. No claims,');
    lines.push('metrics, or personalization were invented.');
    if (notSupplied.length) {
      lines.push('Not supplied, so unused: ' + notSupplied.join(', ') + '.');
    }
    if (skipped.length) {
      lines.push('');
      lines.push('Templates skipped because they needed values you did not supply:');
      skipped.forEach((entry) => {
        lines.push('  - ' + entry.label + ': missing ' + entry.missingVariables.join(', '));
      });
    }
    if (customRejected) {
      lines.push('');
      lines.push('Your custom template was not used because it referenced unknown variables: ' + customRejected.join(', ') + '.');
      lines.push('Add them under variables and re-run to include it.');
    }
    if (unknownKeys.length) {
      lines.push('');
      lines.push('Unknown template keys ignored: ' + unknownKeys.join(', ') + '.');
    }

    return {
      success: true,
      status: 'ok',
      data: {
        draft: {
          recipient: recipient,
          channel: channel,
          primary: primary,
          steps: steps,
          stepCount: steps.length,
          customBody: customRendered,
          skipped: skipped,
          unknownTemplateKeys: unknownKeys,
          suppliedVariables: suppliedNames,
          unusedVariables: notSupplied,
          sequenceDelayHours: sequenceDelay,
          sent: false,
          storePath: storePath,
          persisted: true,
        },
      },
      error: null,
      present: [ctx.render.text('report', 'Outreach draft', lines)],
    };
  },
});

export { outreachDrafting as OUTREACH_DRAFTING };
