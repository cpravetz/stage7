// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const SCRIPT_FORMATTING_INPUT = {
  type: 'object',
  properties: {
    script: SchemaProps.textarea({ title: 'Script', description: 'Raw script text to format', order: 1, hint: 'Paste the script; scene headings, character cues, parentheticals and dialogue are detected automatically' }),
    title: SchemaProps.text({ title: 'Title', description: 'Script title used on the submission artifact', order: 2, default: 'Untitled script', hint: 'Display title on the formatted and submitted script' }),
    format: SchemaProps.select(['standard', 'fountain', 'finaldraft', 'celtx', 'writerduet'], { title: 'Input Format', description: 'Input script format', order: 3, default: 'standard', hint: 'How the pasted script is currently written' }),
    targetFormat: SchemaProps.select(['pdf', 'fountain', 'finaldraft', 'celtx', 'txt'], { title: 'Target Format', description: 'Output format', order: 4, default: 'fountain', hint: 'fountain emits Fountain syntax; the others emit industry standard screenplay layout' }),
    sceneHeadingStyle: SchemaProps.select(['smart', 'master'], { title: 'Scene Heading Style', description: 'Whether to normalize or uppercase scene headings', order: 5, default: 'smart', hint: 'smart fixes INT./EXT. and a missing time of day; master uppercases everything' }),
    pageSize: SchemaProps.select(['US Letter', 'A4'], { title: 'Page Size', description: 'Page size for the formatted script', order: 6, default: 'US Letter', hint: 'Recorded on the artifact' }),
    submitTo: SchemaProps.stringArray({ title: 'Submit To', description: 'Platforms the script is destined for', order: 7, hint: 'e.g. blacklist, coverage-services, contests' }),
    submissionEndpointUrl: SchemaProps.url({ title: 'Submission Endpoint', description: 'Endpoint that receives the formatted submission', order: 8, hint: 'Required before any platform submission can actually be sent' }),
    dryRun: SchemaProps.boolean({ title: 'Dry Run', description: 'Stage the submission without sending it', order: 10, default: true, hint: 'When true, no request leaves the system even if an endpoint is configured' }),
    confirmation: SchemaProps.boolean({ title: 'Confirmation', description: 'Explicit approval to submit', order: 11, default: false, hint: 'Required in addition to dryRun false before anything is sent' }),
  },
  required: ['script'],
};

const SCRIPT_FORMATTING_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether formatting completed' },
    data: { type: 'object', description: 'Formatted script, element counts, format checks, honest submission status, and a formatted report' },
      present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks. This is how a skill controls its own layout without the renderer needing any knowledge of the skill.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable identifier for the block' },
          title: { type: 'string', description: 'Optional heading shown above the block' },
          kind: { type: 'string', description: "How to interpret the body. Defaults to 'text'." },
          body: { type: 'string', description: 'Pre-formatted plain text, rendered verbatim with line breaks preserved' },
        },
        required: ['id', 'body'],
      },
    },
    error: { type: 'string', description: 'Validation or execution error message' },
  },
  required: ['success', 'present'],
};

export const SCRIPT_FORMATTING_SUBMISSION_MANAGER = createDeclarativeCodeSkill({
  id: 'scriptwriting-script-formatting-submission-manager',
  name: 'Script Formatting & Submission Manager',
  description: 'Parses raw script text into scene headings, action, character cues, parentheticals, dialogue and transitions, then re-renders it in Fountain syntax or industry-standard screenplay layout with page markers. Submission status reports exactly what was sent: nothing is claimed as submitted without a configured endpoint and explicit confirmation.',
  persistenceEnvVar: 'SCRIPTWRITING_HOME',
  inputSchema: SCRIPT_FORMATTING_INPUT,
  outputSchema: SCRIPT_FORMATTING_OUTPUT,
  triggers: [
    // User, not Event: `script` is a required input and the handler now returns an
    // honest "No script was supplied" when it is absent, so with no wired edge to
    // deliver a script there is nothing but a person who can invoke it.
    { kind: 'user', phrase_examples: ['Format this script for submission', 'Lay this out as a Fountain screenplay', 'Prepare this draft for a platform'] },
  ],
  tier: 'represent',
  emitEvent: 'scriptwriting.script_submission.sent',
  domainKnowledge: 'Screenplay formatting standards (Master Scene Heading style), script submission platforms, industry formatting guidelines',
  isSkill: true,
  manifest: {
    // Declared as a credential, not a plain config field, so the key can come from
    // the vault via `vault:<id>` and is never echoed back into emitted output.
    credentialSource: {
      apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
    },
    endpointConfigKey: 'submissionEndpointUrl'
  },
  handler: async function handler(input, ctx) {

      const script = String(input.script || '');
      const format = String(input.format || 'standard');
      const targetFormat = String(input.targetFormat || 'fountain');
      const submitTo = Array.isArray(input.submitTo) ? input.submitTo.map(String) : [];
      const pageSize = String(input.pageSize || 'US Letter');
      const sceneHeadingStyle = String(input.sceneHeadingStyle || 'smart');

      if (!script.trim()) {
        // This guard used to have an empty body, so a blank script fell straight
        // through a handler that also had no return statement. The skill then
        // finished with "Execution completed with no output" instead of saying
        // why it produced nothing (0.8, 1.1).
        return {
          success: false,
          error: 'No script was supplied to format.',
          data: null,
          present: [
            {
              id: 'missing-script',
              title: 'Nothing to format',
              kind: 'text',
              body: 'Paste the script text you want formatted into the Script field, then run the Skill again.',
            },
          ],
        };
      }

      const WORDS_PER_PAGE = 180;
      const CHARS_PER_LINE = 58;
      const LINES_PER_PAGE = 55;

      // ---- Element parsing ---------------------------------------------------------
      const isSlug = function (t) {
        const m = t.match(/^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i);
        return Boolean(m);
      };
      const isTransition = function (t) {
        return /(TO:|CUT TO:|BACK TO:)$/.test(t) || /^(FADE (IN|OUT|TO)|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO|WIPE TO|JUMP CUT TO)$/i.test(t);
      };
      const isAllCaps = function (t) { return t === t.toUpperCase() && /[A-Z]/.test(t); };
      const isParenthetical = function (t) { return /^\(.*\)$/.test(t) && t.length <= 70; };
      const isCharacterCue = function (t) {
        if (t.length > 45) return false;
        if (isTransition(t)) return false;
        return isAllCaps(t) && /[A-Z]{2,}/.test(t) && !/[.!?]/.test(t);
      };
      const stripExtension = function (t) { return t.replace(/\((?:V\.?O\.?|O\.?S\.?|C\.?O\.?)\)/gi, '').trim(); };

      const lines = script.split(/\r?\n/);
      const elements = [];
      let i = 0;
      function nextNonEmpty(from) {
        for (let k = from; k < lines.length; k++) { if (lines[k].trim()) return lines[k].trim(); }
        return null;
      }

      while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (!trimmed) { i++; continue; }

        if (isSlug(trimmed)) {
          elements.push({ type: 'slug', text: normalizedSlug(trimmed, sceneHeadingStyle) });
          i++;
          continue;
        }
        if (isTransition(trimmed)) {
          elements.push({ type: 'transition', text: trimmed.toUpperCase() });
          i++;
          continue;
        }
        const lookAhead = nextNonEmpty(i + 1);
        if (isCharacterCue(trimmed) && lookAhead && !isAllCaps(lookAhead) && !isSlug(lookAhead) && !isTransition(lookAhead)) {
          const character = stripExtension(trimmed).toUpperCase();
          let parenthetical = null;
          let cursor = i + 1;
          if (isParenthetical(lines[cursor] ? lines[cursor].trim() : '')) {
            parenthetical = lines[cursor].trim();
            cursor++;
          }
          const spoken = [];
          while (cursor < lines.length && lines[cursor].trim()) {
            const line = lines[cursor].trim();
            if (isSlug(line) || isTransition(line) || isParenthetical(line)) break;
            spoken.push(line);
            cursor++;
          }
          elements.push({ type: 'dialogue', character: character, parenthetical: parenthetical, lines: spoken });
          i = cursor;
          continue;
        }
        const actionRun = [];
        while (i < lines.length && lines[i].trim()) {
          const line = lines[i].trim();
          if (isSlug(line) || isTransition(line)) break;
          if (isCharacterCue(line) && isParenthetical(lines[i + 1] ? lines[i + 1].trim() : '')) break;
          actionRun.push(line);
          i++;
        }
        elements.push({ type: 'action', text: actionRun.join(' ') });
      }

      function normalizedSlug(text, style) {
        if (style === 'master') return text.toUpperCase();
        // "smart" keeps the case the writer used but guarantees INT./EXT. and a time-of-day token.
        let out = text.replace(/^INT\.?\s*\/\s*EXT\.?/i, 'INT./EXT.');
        if (!/\b(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|MOMENTS LATER)\b/i.test(out)) {
          out = out + ' - DAY';
        }
        return out;
      }

      // ---- Rendering ---------------------------------------------------------------
      function pad(n) { return ' '.repeat(n); }
      function wrap(text, width, indent) {
        const words = text.split(/\s+/).filter(Boolean);
        const out = [];
        let line = '';
        words.forEach(function (w) {
          if (!line.length) { line = indent + w; return; }
          if ((line.length - indent) + 1 + w.length <= width) { line += ' ' + w; return; }
          out.push(line);
          line = indent + w;
        });
        if (line.length) out.push(line);
        return out;
      }

      function renderStandard() {
        const out = [];
        elements.forEach(function (el, idx) {
          if (idx > 0) out.push('');
          if (el.type === 'slug') { out.push(el.text.toUpperCase()); return; }
          if (el.type === 'action') { wrap(el.text, CHARS_PER_LINE, 0).forEach(function (l) { out.push(l); }); return; }
          if (el.type === 'transition') { out.push(pad(34) + el.text); return; }
          if (el.type === 'dialogue') {
            out.push(pad(22) + el.character);
            if (el.parenthetical) out.push(pad(16) + el.parenthetical);
            el.lines.forEach(function (l) { wrap(l, 35, 10).forEach(function (x) { out.push(x); }); });
            return;
          }
        });
        return out;
      }

      function renderFountain() {
        const out = [];
        let previous = null;
        elements.forEach(function (el) {
          if (el.type === 'slug') {
            out.push(el.text.toUpperCase());
          } else if (el.type === 'transition') {
            out.push('> ' + el.text.replace(/:+$/, ':'));
          } else if (el.type === 'dialogue') {
            if (previous && previous !== 'action') out.push('');
            out.push(el.character);
            if (el.parenthetical) out.push(el.parenthetical);
            el.lines.forEach(function (l) { out.push(l); });
          } else if (el.type === 'action') {
            if (previous && previous !== 'action') out.push('');
            out.push(el.text);
          }
          previous = el.type === 'dialogue' ? 'dialogue' : el.type;
        });
        return out;
      }

      const standardLines = renderStandard();
      const wordCount = elements.reduce(function (sum, el) {
        if (el.type === 'action') return sum + el.text.split(/\s+/).filter(Boolean).length;
        if (el.type === 'dialogue') return sum + el.lines.join(' ').split(/\s+/).filter(Boolean).length;
        return sum;
      }, 0);
      const estimatedPages = Math.max(1, Math.round((wordCount / WORDS_PER_PAGE) * 100) / 100);

      let body;
      let outputLines;
      if (targetFormat === 'fountain') {
        outputLines = renderFountain();
        body = outputLines.join('\n');
      } else {
        outputLines = standardLines;
        const withBreaks = [];
        outputLines.forEach(function (l) {
          withBreaks.push(l);
          if (targetFormat === 'pdf' && withBreaks.length % LINES_PER_PAGE === 0) {
            withBreaks.push('');
            withBreaks.push('[[PAGE ' + (withBreaks.length / LINES_PER_PAGE) + ']]');
            withBreaks.push('');
          }
        });
        body = withBreaks.join('\n');
      }

      // ---- Format verification -----------------------------------------------------
      const counts = { slug: 0, action: 0, character: 0, parenthetical: 0, dialogue: 0, transition: 0 };
      elements.forEach(function (el) {
        if (el.type === 'slug') counts.slug++;
        else if (el.type === 'action') counts.action++;
        else if (el.type === 'transition') counts.transition++;
        else if (el.type === 'dialogue') { counts.character++; counts.dialogue++; if (el.parenthetical) counts.parenthetical++; }
      });

      const formatChecks = [];
      if (counts.slug === 0) {
        formatChecks.push({ severity: 'error', code: 'no-slug', message: 'No INT./EXT. scene headings were found, so the script has no scene boundaries in standard format.' });
      }
      if (counts.slug === 1 && counts.character > 0) {
        formatChecks.push({ severity: 'warn', code: 'single-scene', message: 'Only one scene heading was found. Confirm the rest of the script is a single scene and not missing its headings.' });
      }
      if (counts.character === 0 && counts.action > 0) {
        formatChecks.push({ severity: 'warn', code: 'no-dialogue', message: 'No dialogue was detected. Everything was treated as action.' });
      }
      elements.forEach(function (el) {
        if (el.type === 'dialogue' && !el.lines.length) {
          formatChecks.push({ severity: 'warn', code: 'empty-dialogue', message: 'Character cue "' + el.character + '" has no dialogue after it.' });
        }
      });
      if (counts.slug > 0 && counts.character > 0) {
        formatChecks.push({ severity: 'ok', code: 'elements-resolved', message: 'Resolved ' + counts.slug + ' scene heading(s), ' + counts.character + ' character cue(s), ' + counts.parenthetical + ' parenthetical(s) and ' + counts.transition + ' transition(s).' });
      }

      // ---- Submission --------------------------------------------------------------
      const endpoint = String(input.submissionEndpointUrl || String(ctx.config?.submissionEndpointUrl || ''));
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '');
      const dryRun = input.dryRun !== false;
      const confirmed = input.confirmation === true || input.confirmed === true;

      const artifact = {
        title: String(input.title || 'Untitled script'),
        targetFormat: targetFormat,
        pageSize: pageSize,
        submitTo: submitTo,
        wordCount: wordCount,
        estimatedPages: estimatedPages,
        content: body,
      };

      let submissionStatus;
      let submissionMessage;
      let submissionResponse = null;

      if (submitTo.length === 0) {
        submissionStatus = 'not-requested';
        submissionMessage = 'No submission platforms were selected; the formatted script was produced and staged locally only.';
      } else if (!endpoint) {
        submissionStatus = 'blocked-not-connected';
        submissionMessage = 'Platforms were selected but no submission endpoint is configured, so nothing was sent to ' + submitTo.join(', ') + '. Set submissionEndpointUrl (or SCRIPTWRITING_SUBMISSION_ENDPOINT) to enable dispatch.';
      } else if (dryRun) {
        submissionStatus = 'dry-run';
        submissionMessage = 'Submission to ' + submitTo.join(', ') + ' was staged as a dry run against ' + endpoint + '. No request was sent. Re-run with dryRun false and confirmation true to submit.';
      } else if (!confirmed) {
        submissionStatus = 'awaiting-confirmation';
        submissionMessage = 'Submission to ' + submitTo.join(', ') + ' requires explicit confirmation. Re-run with confirmation true to send.';
      } else {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (apiKey) headers['X-API-Key'] = apiKey;
          const res = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(artifact) });
          const text = await res.text();
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (_) { data = { text: text }; }
          submissionResponse = { status: res.status, data: data };
          submissionStatus = res.ok ? 'submitted' : 'failed';
          submissionMessage = res.ok
            ? 'Submitted to ' + submitTo.join(', ') + ' and accepted with HTTP ' + res.status + '.'
            : 'Endpoint ' + endpoint + ' rejected the submission with HTTP ' + res.status + '. The formatted script remains available locally.';
        } catch (error) {
          submissionStatus = 'failed';
          submissionMessage = 'Submission to ' + endpoint + ' failed: ' + (error && error.message ? error.message : String(error)) + '. The formatted script remains available locally.';
          submissionResponse = { status: null, data: null };
        }
      }

      const reportLines = [];
      reportLines.push('Input format: ' + format + '   Target format: ' + targetFormat + '   Page size: ' + pageSize);
      reportLines.push('Title: ' + artifact.title);
      reportLines.push('');
      reportLines.push('ELEMENTS RESOLVED');
      reportLines.push('  Scene headings : ' + counts.slug);
      reportLines.push('  Action blocks  : ' + counts.action);
      reportLines.push('  Character cues : ' + counts.character);
      reportLines.push('  Parentheticals : ' + counts.parenthetical);
      reportLines.push('  Dialogue lines : ' + counts.dialogue);
      reportLines.push('  Transitions    : ' + counts.transition);
      reportLines.push('  Words          : ' + wordCount + '   Estimated pages: ' + estimatedPages);
      reportLines.push('');
      reportLines.push('FORMAT CHECKS');
      if (formatChecks.length === 0) {
        reportLines.push('  No issues raised.');
      } else {
        formatChecks.forEach(function (c) { reportLines.push('  [' + c.severity.toUpperCase() + '] ' + c.message); });
      }
      reportLines.push('');
      reportLines.push('SUBMISSION');
      reportLines.push('  Platforms requested: ' + (submitTo.length ? submitTo.join(', ') : 'none'));
      reportLines.push('  Endpoint: ' + (endpoint || 'not configured'));
      reportLines.push('  Status: ' + submissionStatus);
      reportLines.push('  ' + submissionMessage);
      if (submissionResponse) {
        reportLines.push('  Response: HTTP ' + submissionResponse.status);
      }
      reportLines.push('');
      reportLines.push('FORMATTED SCRIPT (' + targetFormat.toUpperCase() + ')');
      reportLines.push('-------------------------------------');
      reportLines.push(body);

      const output = {
        id: 'sfm_' + Date.now(),
        title: artifact.title,
        format: format,
        targetFormat: targetFormat,
        pageSize: pageSize,
        submitTo: submitTo,
        wordCount: wordCount,
        estimatedPages: estimatedPages,
        elementCounts: counts,
        formatChecks: formatChecks,
        submissionStatus: submissionStatus,
        submissionMessage: submissionMessage,
        submissionEndpoint: endpoint || null,
        submissionResponse: submissionResponse,
        generatedAt: new Date().toISOString(),
      };

      const store = ctx.store.load('formatting-submissions', []);
      store.push(output);
      ctx.store.save('formatting-submissions', store);
      output.storePath = ctx.store.getFilePath('formatting-submissions');

      // The skill owns its report and screenplay layout. 'present' is the generic block contract.
      const present = [
        {
          id: 'formatting-report',
          title: output.title,
          kind: 'text',
          body: reportLines.join('\n'),
        },
      ];
      return {
        success: true,
        data: { ...output, present },
        present,
      };
    }
  });
