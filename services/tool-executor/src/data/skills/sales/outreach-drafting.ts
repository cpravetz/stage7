import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { salesResultSchema } from './sales-contract';

const SALES_HOME = process.env.SALES_HOME || '/tmp/sales';

const TEMPLATES = {
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
const source = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const fs = require('fs');
  const path = require('path');
  const baseDir = ${JSON.stringify(SALES_HOME)};

  const TEMPLATES = ${JSON.stringify(TEMPLATES)};

  function emit(success, status, data, error, present) {
    const payload = { success: success, status: status, data: data || null, error: error || null, present: present || [] };
    console.log(JSON.stringify(payload));
    return payload;
  }

  const recipient = input.recipient && typeof input.recipient === 'object' ? input.recipient : {};
  const variables = input.variables && typeof input.variables === 'object' ? input.variables : {};
  const channel = input.channel || 'email';
  const sequenceDelay = typeof input.sequenceDelay === 'number' ? input.sequenceDelay : 48;

  // Every value that may appear in a draft, with no invented fallbacks. A missing value stays
  // missing and removes the template that needed it.
  const values = {
    firstName: recipient.firstName || null,
    company: recipient.company || null,
    industry: recipient.industry || null,
    title: recipient.title || null,
    valueProp: variables.valueProp || null,
    myCompany: variables.myCompany || null,
    myName: variables.myName || null,
    topic: variables.topic || null,
  };

  const missingRecipient = [];
  if (!values.firstName) missingRecipient.push('recipient.firstName');
  if (!values.company) missingRecipient.push('recipient.company');

  if (missingRecipient.length) {
    const lines = [];
    lines.push('No draft was produced because the recipient is incomplete.');
    lines.push('');
    lines.push('Missing: ' + missingRecipient.join(', ') + '.');
    lines.push('');
    lines.push('Send a recipient with at least a first name and company. Optional fields that improve the draft:');
    lines.push('  - recipient.industry, recipient.title');
    lines.push('  - variables.valueProp, variables.myCompany, variables.myName, variables.topic');
    lines.push('');
    lines.push('A template that needs a field you did not supply is left out of the draft and listed as');
    lines.push('skipped, rather than filled with invented text.');
    emit(false, 'not-connected', { draft: null, missingInformation: missingRecipient },
      'Not connected: recipient details are incomplete, so no draft was written',
      [{ id: 'notice', title: 'Recipient details required', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  const requestedKey = input.template || 'cold';
  const customTemplate = typeof input.customTemplate === 'string' ? input.customTemplate : null;
  const sequenceInput = Array.isArray(input.sequence) ? input.sequence : null;

  // Work out which template keys are in play and which supplied variables each one needs.
  const KEYS = {
    cold: ['firstName', 'company', 'industry', 'myCompany', 'valueProp', 'myName'],
    followup: ['firstName', 'valueProp', 'myName'],
    nurture: ['firstName', 'topic', 'company', 'myName'],
  };

  const requestedKeys = [];
  if (sequenceInput) {
    sequenceInput.forEach(function (key) {
      if (typeof key === 'string' && requestedKeys.indexOf(key) < 0) requestedKeys.push(key);
    });
  }
  if (requestedKeys.indexOf(requestedKey) < 0) requestedKeys.unshift(requestedKey);

  const unknownKeys = requestedKeys.filter(function (key) { return !TEMPLATES[key]; });
  const usableKeys = requestedKeys.filter(function (key) { return Boolean(TEMPLATES[key]); });

  const missingByKey = {};
  const skipped = [];
  usableKeys.forEach(function (key) {
    const needed = KEYS[key] || Object.keys(values);
    const missing = needed.filter(function (name) { return !values[name]; });
    missingByKey[key] = missing;
    if (missing.length) skipped.push({ template: key, label: TEMPLATES[key].label, missingVariables: missing });
  });

  const render = function (text, key) {
    return String(text).replace(/\\{(\\w+)\\}/g, function (match, name) {
      return values[name] !== null && values[name] !== undefined ? values[name] : match;
    });
  };

  const buildSubjects = function (key) {
    const tpl = TEMPLATES[key];
    const out = [];
    tpl.subjectPatterns.forEach(function (pattern) {
      const rendered = render(pattern, key);
      // Drop any subject whose placeholders were not all supplied, and any duplicate.
      if (rendered.indexOf('{') >= 0) return;
      if (out.indexOf(rendered) < 0) out.push(rendered);
    });
    return out;
  };

  const buildBody = function (key) {
    const tpl = TEMPLATES[key];
    const rendered = tpl.body.map(function (line) { return render(line, key); }).join(NL);
    if (rendered.indexOf('{') >= 0) return null;
    return rendered;
  };

  const overrideSubject = typeof input.subject === 'string' && input.subject.trim() ? input.subject.trim() : null;

  const steps = [];
  usableKeys.forEach(function (key, index) {
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
    const lines = [];
    lines.push('A draft was requested but no template could be completed with the values supplied.');
    lines.push('');
    if (unknownKeys.length) {
      lines.push('Unknown template keys ignored: ' + unknownKeys.join(', ') + '.');
      lines.push('Available templates: ' + Object.keys(TEMPLATES).join(', ') + '.');
      lines.push('');
    }
    lines.push('Templates that could not be completed:');
    skipped.forEach(function (entry) {
      lines.push('  - ' + entry.label + ' (' + entry.template + '): missing ' + entry.missingVariables.join(', '));
    });
    lines.push('');
    lines.push('Nothing was drafted and nothing was sent. Supply the listed variables and re-run.');
    emit(false, 'not-connected', { steps: [], skipped: skipped, unknownTemplateKeys: unknownKeys, missingInformation: Object.keys(values).filter(function (k) { return !values[k]; }) },
      'Not connected: no outreach template could be completed with the supplied variables',
      [{ id: 'notice', title: 'No complete template available', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  const primary = steps[0];

  // The custom template is rendered only when it is free of unresolved placeholders.
  let customRendered = null;
  let customRejected = null;
  if (customTemplate) {
    const rendered = render(customTemplate, 'custom');
    if (rendered.indexOf('{') >= 0) {
      const unresolved = [];
      const re = /\\{(\\w+)\\}/g;
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

  let storePath = null;
  let persisted = false;
  const record = {
    id: 'draft',
    channel: channel,
    createdAt: new Date().toISOString(),
    recipient: recipient,
    steps: steps,
    customBody: customRendered,
    source: 'template-rendering',
  };
  try {
    fs.mkdirSync(baseDir, { recursive: true });
    storePath = path.join(baseDir, 'outreach-drafts.json');
    const existing = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
    if (!Array.isArray(existing)) throw new Error('store is not an array');
    existing.push(record);
    fs.writeFileSync(storePath, JSON.stringify(existing, null, 2));
    persisted = true;
  } catch (e) {
    storePath = null;
  }

  const lines = [];
  lines.push('Drafted ' + steps.length + ' outreach ' + (steps.length === 1 ? 'message' : 'messages') + ' for ' + values.firstName + ' at ' + values.company + ' via ' + channel + '.');
  lines.push('Nothing was sent. This is a draft for you to review and send yourself.');
  lines.push('');

  steps.forEach(function (step) {
    lines.push('Step ' + step.step + ' — ' + step.templateLabel + (step.step > 1 ? '  (send after ' + step.delayHours + 'h)' : ''));
    lines.push('Subject: ' + step.subject);
    if (step.subjectVariants.length > 1) {
      lines.push('Alternate subjects:');
      step.subjectVariants.forEach(function (subject) {
        if (subject !== step.subject) lines.push('  - ' + subject);
      });
    }
    lines.push('');
    step.body.split(NL).forEach(function (line) { lines.push(line ? '  ' + line : ''); });
    lines.push('');
  });

  if (customRendered) {
    lines.push('Custom body supplied');
    lines.push('Subject: ' + customRendered.subject);
    lines.push('');
    customRendered.body.split(NL).forEach(function (line) { lines.push(line ? '  ' + line : ''); });
    lines.push('');
  }

  const suppliedNames = Object.keys(values).filter(function (k) { return values[k] !== null; });
  const notSupplied = Object.keys(values).filter(function (k) { return values[k] === null; });
  lines.push('Every line above comes from a value you supplied or from a built-in template. No claims,');
  lines.push('metrics, or personalization were invented.');
  if (notSupplied.length) {
    lines.push('Not supplied, so unused: ' + notSupplied.join(', ') + '.');
  }
  if (skipped.length) {
    lines.push('');
    lines.push('Templates skipped because they needed values you did not supply:');
    skipped.forEach(function (entry) {
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

  emit(true, 'ok', {
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
      persisted: persisted,
    },
  }, null, [{ id: 'report', title: 'Outreach draft', kind: 'text', body: lines.join(NL) }]);
})();`;

const outreachDrafting = createCodeSkill({
  id: 'outreach-drafting',
  name: 'Outreach Drafting',
  description:
    'Draft sales outreach from built-in cold, follow-up, and nurture templates using only the recipient and variable values you supply. Templates that need an unsupplied variable are skipped and reported rather than filled with invented text, subject variants are deduplicated, and nothing is ever sent.',
  tier: 'aid',
  domainKnowledge: 'Sales outreach methodology, personalization frameworks, subject-line testing, and sequence design',
  manifest: {
    sourceCode: source,
    configSchema: createSchemaRecord({
      salesHome: SchemaProps.text({ description: 'Directory used to persist drafts; defaults to SALES_HOME' }),
      defaultSequenceDelay: SchemaProps.number({ description: 'Default hours between sequence steps', default: 48 }),
    }),
    persistenceEnv: 'SALES_HOME',
    salesHome: SALES_HOME,
    confirmBeforeSend: false,
    ui: { view: 'outreach-drafting' },
  },
  inputSchema: createSchemaRecord({
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
  }),
  outputSchema: salesResultSchema('Drafted messages with subject variants, skipped templates, and coverage of supplied values'),
  triggers: [{ kind: 'user', phrase_examples: ['Draft an outreach email', 'Write a follow-up', 'Create an email sequence'] }],
  confirmBeforeSend: false,
  isSkill: true,
});

export { outreachDrafting as OUTREACH_DRAFTING };
