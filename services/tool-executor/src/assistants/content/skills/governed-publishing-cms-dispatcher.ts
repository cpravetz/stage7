// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { contentResultSchema } from '../content-contract';

export const GOVERNED_PUBLISHING_CMS_DISPATCHER = createDeclarativeCodeSkill({
  id: 'governed-publishing-cms-dispatcher',
  name: 'Governed Publishing & CMS Dispatcher',
  description:
    'Runs a computed pre-flight over a publishing payload, then either previews it or sends it to the CMS. Pre-flight measures the payload you supplied (title and body length, derived slug, SEO field lengths, tags) against stated SEO conventions, so the governance result is real whether or not a CMS is connected. Sending requires dryRun: false plus confirmation: true; without it nothing is sent and the result says the run stopped at the approval gate. Reports blocked, not-connected, confirmation-required, failed, and published as distinct outcomes.',
  persistenceEnvVar: 'CONTENT_HOME',
  tier: 'represent',
  domainKnowledge:
    'Content publishing governance: pre-flight validation of SEO metadata, slug conventions, and taxonomy before dispatch, approval gating, and CMS dispatch outcomes',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Publishing channel (blog, social, video, newsletter)' },
      contentId: { type: 'string', description: 'Existing content identifier to update' },
      title: { type: 'string', description: 'Content title (required)' },
      content: { type: 'string', description: 'Content body (required)', multiline: true },
      excerpt: { type: 'string', description: 'Content excerpt' },
      category: { type: 'string', description: 'Content category' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Content tags' },
      slug: { type: 'string', description: 'URL slug; derived from the title when omitted' },
      seoTitle: { type: 'string', description: 'SEO title' },
      seoDescription: { type: 'string', description: 'SEO meta description' },
      dryRun: { type: 'boolean', description: 'Validate without publishing; defaults to true', default: true },
      confirmation: { type: 'boolean', description: 'Explicit approval required for a live publish', default: false },
    },
    required: [],
  },
  outputSchema: contentResultSchema('Payload measurements, pre-flight checks, and the dispatch outcome'),
  triggers: [
    { kind: 'event', on: 'A draft is approved and staged for publication' },
    { kind: 'user', phrase_examples: ['stage a CMS publish', 'publish this draft', 'run the publishing pre-flight'] },
  ],
  isSkill: true,
  manifest: {
    ui: { view: 'publishing-approval' }
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const PUBLISHING_TOOL = 'content-multi-channel-publishing';

      // Every outcome block states the same two standing caveats and then what this particular run
      // did with the publishing tool. Built in one place so the wording cannot drift between paths.
      const scopeBlock = (outcomeLine) => ([
        'Every figure above is measured from the payload you supplied.',
        'Character and word limits are SEO conventions, not measurements of the destination CMS.',
        outcomeLine,
      ].join(NL));

      const isLive = input.dryRun === false;
      const approved = input.confirmation === true;

      // ---- Local governance (always computable) ------------------------------------------
      const NLcheck = /[^a-z0-9]+/g;
      const title = String(input.title || '').trim();
      const body = String(input.content || '').trim();
      const excerpt = String(input.excerpt || '').trim();
      const slug = String(input.slug || '').trim();
      const seoTitle = String(input.seoTitle || '').trim();
      const seoDescription = String(input.seoDescription || '').trim();
      const channel = String(input.channel || '').trim();
      const tags = Array.isArray(input.tags) ? input.tags.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];

      // Length limits below are SEO conventions, not measurements of the destination system. They are
      // labelled as conventions in the report.
      const checks = [];
      const add = (id, severity, ok, message) => { checks.push({ id: id, severity: severity, ok: ok, message: message }); };

      add('channel', 'blocking', channel.length > 0, channel.length > 0
        ? 'Channel "' + channel + '" is set.'
        : 'No channel was supplied, so there is nowhere to publish to.');

      add('title', 'blocking', title.length > 0, title.length > 0
        ? 'Title is ' + title.length + ' characters (convention: 10-70).'
        : 'No title was supplied.');
      if (title.length > 0 && (title.length < 10 || title.length > 70)) {
        add('title-length', 'advisory', false, 'Title is ' + title.length + ' characters, outside the 10-70 convention.');
      }

      const bodyWords = (body.match(/[A-Za-z0-9'’-]+/g) || []).length;
      add('body', 'blocking', body.length > 0, body.length > 0
        ? 'Body is ' + bodyWords + ' words.'
        : 'No content body was supplied.');

      const derivedSlug = slug.length > 0
        ? slug
        : title.toLowerCase().replace(NLcheck, '-').replace(/^-+|-+$/g, '');
      if (!slug && derivedSlug) {
        add('slug-derived', 'info', true, 'No slug supplied; derived "' + derivedSlug + '" from the title.');
      }
      if (derivedSlug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(derivedSlug)) {
        add('slug-format', 'advisory', false, 'Slug "' + derivedSlug + '" is not lowercase-hyphenated; most CMS platforms will rewrite it.');
      }
      if (derivedSlug && derivedSlug.length > 75) {
        add('slug-length', 'advisory', false, 'Slug is ' + derivedSlug.length + ' characters (convention: under 75).');
      }

      if (seoTitle) {
        add('seo-title', seoTitle.length >= 10 && seoTitle.length <= 70 ? 'info' : 'advisory',
          seoTitle.length >= 10 && seoTitle.length <= 70,
          'SEO title is ' + seoTitle.length + ' characters (convention: 10-70).');
      } else {
        add('seo-title', 'advisory', false, 'No SEO title supplied; the platform title will be indexed instead.');
      }
      if (seoDescription) {
        add('seo-description', seoDescription.length >= 50 && seoDescription.length <= 160 ? 'info' : 'advisory',
          seoDescription.length >= 50 && seoDescription.length <= 160,
          'SEO description is ' + seoDescription.length + ' characters (convention: 50-160).');
      } else {
        add('seo-description', 'advisory', false, 'No SEO description supplied; the excerpt will be used if present.');
      }
      if (!excerpt) {
        add('excerpt', 'advisory', false, 'No excerpt supplied.');
      }
      if (tags.length === 0) {
        add('tags', 'advisory', false, 'No tags supplied.');
      }

      const blockers = checks.filter(function (c) { return c.severity === 'blocking' && !c.ok; });
      const advisories = checks.filter(function (c) { return c.severity === 'advisory' && !c.ok; });

      const payload = {
        channel: channel || null,
        title: title || null,
        bodyWords: bodyWords,
        slug: derivedSlug || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        tags: tags,
        checks: checks,
        blockers: blockers.length,
        advisories: advisories.length,
      };

      const governanceBlock = (extraTitle, extraBody) => {
        const L = [];
        L.push('This payload was not sent.');
        L.push('');
        L.push('Payload as supplied');
        L.push('  Channel    ' + (channel || 'not set'));
        L.push('  Title      ' + (title || 'not set') + (title ? '  (' + title.length + ' characters)' : ''));
        L.push('  Body       ' + (body.length > 0 ? bodyWords + ' words' : 'not set'));
        L.push('  Slug       ' + (derivedSlug || 'not set') + (slug ? '' : '  (derived from title)'));
        L.push('  SEO title  ' + (seoTitle ? seoTitle.length + ' characters' : 'not set'));
        L.push('  SEO desc   ' + (seoDescription ? seoDescription.length + ' characters' : 'not set'));
        L.push('  Tags       ' + (tags.length > 0 ? tags.join(', ') : 'not set'));
        L.push('');
        L.push('Checks (lengths are SEO conventions, not measurements of the destination CMS):');
        checks.forEach(function (check) {
          const mark = check.ok ? 'ok  ' : (check.severity === 'blocking' ? 'FAIL' : (check.severity === 'advisory' ? 'warn' : 'note'));
          L.push('  [' + mark + '] ' + check.message);
        });
        L.push('');
        L.push('Outcome');
        L.push('  ' + extraBody);
        return L.join(NL) + (extraTitle ? '' : '');
      };

      // ---- Ordering of refusals ---------------------------------------------------------
      if (blockers.length > 0) {
        const L = governanceBlock('Blocked', 'The payload has blocking issues and was not sent.');
        return { success: false, status: 'blocked', data: payload, present: [{ id: 'report', title: 'Publishing pre-flight blocked', kind: 'text', body: L }] };
      }

      if (!channel) {
        const L = governanceBlock('Blocked', 'No channel was supplied, so there is nowhere to publish to.');
        return { success: false, status: 'blocked', data: payload, present: [{ id: 'report', title: 'Publishing pre-flight blocked', kind: 'text', body: L }] };
      }

      if (isLive && !approved) {
        const L = governanceBlock('Confirmation required', 'A live publish was requested but explicit confirmation was not received. Nothing was sent.');
        return { success: false, status: 'confirmation-required', data: payload, present: [{ id: 'report', title: 'Publishing confirmation required', kind: 'text', body: L }] };
      }

      // ---- Delegation --------------------------------------------------------------------
      const targetStatus = isLive ? 'published' : 'draft';
      let nested = null;
      let nestedError = null;
      try {
        nested = await ctx.delegate(PUBLISHING_TOOL, {
          channel: channel || 'blog',
          contentId: input.contentId,
          title: title,
          content: body,
          excerpt: excerpt,
          category: input.category,
          tags: tags,
          slug: derivedSlug,
          seoTitle: seoTitle,
          seoDescription: seoDescription,
          status: targetStatus,
          dryRun: !isLive,
        });
      } catch (error) {
        nestedError = error && error.message ? error.message : String(error);
      }

      // PUBLISHING_TOOL is a createExternalActionSkill, which emits
      // { success, system, action, request, response, error } and has no top-level
      // data key. The CMS reply arrives at response.data, so reading nested.data
      // yielded null and the report stated there had been no response even when the
      // publish had succeeded.
      const nestedBody = nested
        ? (nested.response && nested.response.data !== undefined && nested.response.data !== null
          ? nested.response.data
          : nested.data)
        : null;

      if (nestedError || !nested || nested.success !== true) {
        const reason = nestedError
          || ((nested && (nested.error || nested.message)) || 'The publishing tool returned no result.');

        // "Not connected" and "the send failed" are different facts and are reported as such. The
        // connection question is answered by the publishing tool itself rather than guessed here, so
        // this skill never has to be told where a CMS lives. An unavailable tool or an unconfigured
        // endpoint is a connection problem; anything else is a send that was attempted and failed.
        const isConnectionIssue = /not connected|not configured|no endpoint|not available|configuration issue|missing[^.]*config/i.test(reason);
        const status = isConnectionIssue ? 'not-connected' : 'failed';
        // The lower-order tool already prefixes its own message; re-prefixing produced a doubled
        // "Not connected: Not connected: ..." in the rendered report.
        // Escaped as \s because this source lives inside a TypeScript template literal: a single
        // s there collapses to the letter "s", turning this into /not connected:s*/i, which strips the
        // label but leaves the space and produces a doubled "Not connected:  " in the rendered report.
        const outcomeLine = isConnectionIssue
          ? 'The payload passed every check, but ' + PUBLISHING_TOOL + ' reported that no CMS is configured, so nothing was sent. The pre-flight result above is real and still valid. Configure the publishing platform and run this again.'
          : 'The payload passed every check but the send did not succeed: ' + reason + ' Nothing was published.';

        const L = governanceBlock(status === 'not-connected' ? 'Not connected' : 'Send failed', outcomeLine);
        return { success: false, status: status, data: Object.assign({}, payload, { dispatched: false }), error: reason, present: [{ id: 'report', title: 'Publishing ' + status, kind: 'text', body: L }] };
      }

      const L = [];
      L.push(isLive ? 'Published.' : 'Dry run only - nothing was sent.');
      L.push('');
      L.push('Payload as supplied');
      L.push('  Channel    ' + (channel || 'not set'));
      L.push('  Title      ' + (title || 'not set') + (title ? '  (' + title.length + ' characters)' : ''));
      L.push('  Body       ' + (body.length > 0 ? bodyWords + ' words' : 'not set'));
      L.push('  Slug       ' + (derivedSlug || 'not set') + (slug ? '' : '  (derived from title)'));
      L.push('  SEO title  ' + (seoTitle ? seoTitle.length + ' characters' : 'not set'));
      L.push('  SEO desc   ' + (seoDescription ? seoDescription.length + ' characters' : 'not set'));
      L.push('  Tags       ' + (tags.length > 0 ? tags.join(', ') : 'not set'));
      L.push('');
      L.push('What was sent');
      L.push('  Mode       ' + (isLive ? 'live' : 'dry run'));
      L.push('  Channel    ' + channel);
      L.push('  Title      ' + title);
      L.push('  Slug       ' + (derivedSlug || 'not set'));
      L.push('  Body       ' + bodyWords + ' words');
      L.push('  Status     ' + targetStatus);
      if (tags.length > 0) L.push('  Tags       ' + tags.join(', '));
      L.push('');
      L.push('Pre-flight checks (SEO conventions, not measurements of the destination CMS):');
      checks.forEach(function (check) {
        const mark = check.ok ? 'ok  ' : (check.severity === 'advisory' ? 'warn' : 'note');
        L.push('  [' + mark + '] ' + check.message);
      });
      L.push('');
      L.push('Response from ' + PUBLISHING_TOOL);
      const response = nestedBody;
      if (response && typeof response === 'object') {
        const text = JSON.stringify(response, null, 2);
        L.push(text.length > 1500 ? text.slice(0, 1500) + NL + '  (truncated)' : text);
      } else if (response) {
        L.push(String(response));
      } else {
        L.push('  The tool reported success but returned no payload.');
      }
      if (advisories.length > 0) {
        L.push('');
        L.push('Advisory notes carried into publish');
        advisories.forEach(function (a) { L.push('  - ' + a.message); });
      }

      const coverageLines = [];
      coverageLines.push(PUBLISHING_TOOL + ' was called and reported success.');
      coverageLines.push('Mode: ' + (isLive ? 'live - the content was sent to the publishing platform.' : 'dry run - the payload was validated and deliberately not sent.'));
      coverageLines.push('Every figure above is measured from the payload you supplied.');
      coverageLines.push('Character and word limits are SEO conventions, not measurements of the destination CMS.');
      if (!isLive) coverageLines.push('No content was published. Run again with dryRun: false and confirmation: true to publish.');
      const blocks = [
        { id: 'report', title: isLive ? 'Published' : 'Dry run', kind: 'text', body: L.join(NL) },
        { id: 'coverage', title: 'Coverage', kind: 'text', body: coverageLines.map(function (line) { return '- ' + line; }).join(NL) },
      ];
      return { success: true, data: Object.assign({}, payload, { dispatched: isLive, published: isLive, targetStatus: targetStatus, nested: nestedBody }), present: blocks };
    }
  });
