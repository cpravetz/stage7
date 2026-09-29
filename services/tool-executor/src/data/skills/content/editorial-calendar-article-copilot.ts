import { createCodeSkill } from '../code-skill-factory';
import { contentResultSchema } from './content-contract';

/**
 * Turns a set of editorial topics into a dated calendar and drafts each one.
 *
 * The previous version ran every topic through the drafting tool, discarded the result when it
 * came back null, marked the topic "blocked", and still reported success: true. A live run returned
 * a full-looking calendar whose drafts were all null, because the drafting tool was throwing a
 * syntax error on every call. The calendar is now reported separately from drafting, coverage is
 * stated as a count, and the outer status is false when nothing was actually drafted.
 */
const EDITORIAL_CALENDAR_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' && __tool_input ? __tool_input : {};
  const NL = '\\n';
  const DRAFTING_TOOL = 'content-drafting-adaptation';

  const topics = Array.isArray(input.topics) ? input.topics : [];
  if (!topics.length) {
    console.log(JSON.stringify({
      success: false,
      status: 'error',
      error: 'No editorial topics were supplied, so no calendar could be built.',
      data: null,
      present: [{ id: 'notice', title: 'No topics supplied', kind: 'text', body: 'Supply at least one editorial topic to build a calendar and draft it.' }],
    }));
    return;
  }

  const startDate = String(input.startDate || '').trim();
  const cadenceDays = Number.isFinite(Number(input.cadenceDays)) && Number(input.cadenceDays) > 0
    ? Math.round(Number(input.cadenceDays))
    : 7;

  const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  };
  const anchor = parseDate(startDate);
  const toIsoDate = (date) => date.toISOString().slice(0, 10);

  // ---- Calendar (computed from the topics) ----------------------------------------
  const rows = [];
  const skipped = [];
  let scheduled = 0;

  topics.forEach(function (raw, index) {
    const title = String((raw && raw.title) || '').trim();
    if (!title) {
      skipped.push({ index: index, reason: 'topic has no title, so it cannot be placed in a calendar' });
      return;
    }
    const deadlineRaw = String((raw && raw.deadline) || '').trim();
    const deadline = parseDate(deadlineRaw);
    if (deadlineRaw && !deadline) {
      skipped.push({ index: index, title: title, reason: 'deadline "' + deadlineRaw + '" is not a parseable date' });
      return;
    }

    // A supplied deadline is the date. Otherwise the slot is derived from the cycle start and the
    // cadence, so an undated topic still lands on a real, stated day instead of an empty field.
    let dueDate;
    let dueBasis;
    if (deadline) {
      dueDate = toIsoDate(deadline);
      dueBasis = 'supplied deadline';
    } else if (anchor) {
      const derived = new Date(anchor.getTime());
      derived.setDate(derived.getDate() + index * cadenceDays);
      dueDate = toIsoDate(derived);
      dueBasis = 'derived: cycle start ' + toIsoDate(anchor) + ' plus ' + (index * cadenceDays) + ' days at a ' + cadenceDays + '-day cadence';
    } else {
      dueDate = null;
      dueBasis = 'unplaced: no startDate and no deadline supplied';
    }
    if (dueDate) scheduled += 1;

    const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter(function (k) { return typeof k === 'string' && k.trim(); }) : [];
    rows.push({
      index: index,
      title: title,
      dueDate: dueDate,
      dueBasis: dueBasis,
      format: String((raw && raw.format) || 'article'),
      platform: (raw && raw.platform) ? String(raw.platform) : null,
      audience: (raw && raw.audience) ? String(raw.audience) : null,
      intent: (raw && raw.intent) ? String(raw.intent) : null,
      primaryKeyword: keywords.length > 0 ? keywords[0] : ((raw && raw.keyword) ? String(raw.keyword) : null),
      keywords: keywords,
      tone: (raw && raw.tone) ? String(raw.tone) : null,
      length: (raw && raw.length) ? String(raw.length) : null,
    });
  });

  if (!rows.length) {
    const reasons = skipped.map(function (s) { return '- index ' + s.index + ': ' + s.reason; }).join(NL);
    console.log(JSON.stringify({
      success: false,
      status: 'error',
      error: 'None of the supplied topics could be placed in a calendar.',
      data: { calendar: [], drafts: [], coverage: { requested: topics.length, placed: 0, drafted: 0, failed: 0, skipped: skipped } },
      present: [{ id: 'notice', title: 'No usable topics', kind: 'text', body: 'Every supplied topic was rejected.' + NL + NL + reasons }],
    }));
    return;
  }

  // ---- Delegation: draft each placed topic ------------------------------------------
  const drafts = [];
  for (const row of rows) {
    const record = { title: row.title, status: 'drafted', brief: null, error: null, words: null, sections: null, missing: [] };
    if (!row.audience) record.missing.push('audience');
    if (!row.primaryKeyword) record.missing.push('primaryKeyword');
    if (!row.platform) record.missing.push('platform');

    try {
      const result = await __execute_tool(DRAFTING_TOOL, {
        task: 'draft',
        contentType: row.format,
        topic: row.title,
        targetPlatform: row.platform,
        targetAudience: row.audience,
        tone: row.tone,
        length: row.length,
        keywords: row.keywords,
      });
      if (result && result.success) {
        const payload = result.data || {};
        record.brief = (Array.isArray(result.present) && result.present.length > 0 ? result.present[0].body : null);
        record.words = payload.targetWords || null;
        record.sections = (payload.conventions && payload.conventions.sections) ? payload.conventions.sections.length : null;
      } else {
        // Previously swallowed: the topic was marked "blocked" and the outer call still succeeded.
        record.status = 'failed';
        record.error = (result && (result.error || result.message)) || 'The drafting tool returned no result.';
      }
    } catch (error) {
      record.status = 'failed';
      record.error = error && error.message ? error.message : String(error);
    }
    drafts.push(record);
  }

  const drafted = drafts.filter(function (d) { return d.status === 'drafted'; });
  const failed = drafts.filter(function (d) { return d.status === 'failed'; });
  const nothingDrafted = drafted.length === 0;
  const partial = !nothingDrafted && (failed.length > 0 || skipped.length > 0);

  // ---- Report -------------------------------------------------------------------------
  const L = [];
  L.push(scheduled + ' of ' + topics.length + ' topic' + (topics.length === 1 ? '' : 's') + ' placed'
    + (anchor ? ', starting ' + toIsoDate(anchor) : '')
    + (skipped.length > 0 ? ', ' + skipped.length + ' rejected' : '') + '.');
  L.push('');
  L.push('Schedule');
  rows.forEach(function (row) {
    L.push('  ' + (row.dueDate || 'unplaced') + '  ' + row.title);
    const details = [row.format];
    // Only mention the platform when it adds something the format did not already say.
    if (row.platform && row.platform !== row.format) details.push(row.platform);
    if (row.audience) details.push('for ' + row.audience);
    if (row.primaryKeyword) details.push('target "' + row.primaryKeyword + '"');
    L.push('      ' + details.join('  |  '));
    L.push('      date basis: ' + row.dueBasis);
  });
  L.push('');

  L.push('Draft briefs');
  if (nothingDrafted) {
    L.push('  No briefs were produced. ' + DRAFTING_TOOL + ' failed for all ' + failed.length + ' topic' + (failed.length === 1 ? '' : 's') + '.');
  } else {
    drafted.forEach(function (record) {
      L.push('  ' + record.title);
      L.push('      ' + (record.words || '?') + ' words across ' + (record.sections || '?') + ' sections'
        + (record.missing.length > 0 ? '   (not supplied: ' + record.missing.join(', ') + ')' : ''));
    });
  }
  if (failed.length > 0) {
    L.push('');
    L.push('  Failed to draft:');
    failed.forEach(function (record) {
      L.push('    ' + record.title + ' - ' + record.error);
    });
  }
  L.push('');
  L.push('Next step');
  if (nothingDrafted) {
    L.push('  Fix the drafting failure before scheduling. The dates above are real and are safe to keep,');
    L.push('  but no content brief exists for any of these slots yet.');
  } else if (partial) {
    L.push('  ' + drafted.length + ' of ' + rows.length + ' briefs are ready. The failed topics above have dates but no brief.');
  } else {
    L.push('  Every placed topic has a brief. The assistant model writes the copy from each brief.');
  }

  const coverageLines = [];
  coverageLines.push('Requested: ' + topics.length + ' topic' + (topics.length === 1 ? '' : 's') + '.');
  coverageLines.push('Placed in calendar: ' + scheduled + '.');
  coverageLines.push('Draft briefs produced: ' + drafted.length + ' of ' + scheduled + ' placed (' + Math.round((drafted.length / Math.max(scheduled, 1)) * 100) + '% coverage).');
  if (failed.length > 0) {
    coverageLines.push('Failed: ' + failed.map(function (d) { return d.title; }).join('; ') + '.');
  }
  if (skipped.length > 0) {
    coverageLines.push('Rejected before scheduling: ' + skipped.map(function (s) { return s.reason; }).join('; ') + '.');
  }
  if (record_missingCoverage(rows)) {
    coverageLines.push('Unassessed: topics with no audience, primary keyword, or platform received a brief without those constraints. Supply them to tighten the briefs.');
  }
  coverageLines.push('Dates are derived from the startDate and deadlines you supplied. No publishing calendar service or CMS was contacted.');

  const blocks = [
    { id: 'report', title: 'Editorial calendar', kind: 'text', body: L.join(NL) },
    { id: 'coverage', title: 'Coverage', kind: 'text', body: coverageLines.map(function (line) { return '- ' + line; }).join(NL) },
  ];

  console.log(JSON.stringify({
    success: !nothingDrafted,
    status: nothingDrafted ? 'failed' : (partial ? 'partial' : 'ok'),
    error: nothingDrafted
      ? 'No editorial brief could be produced: ' + DRAFTING_TOOL + ' failed for all ' + failed.length
        + ' topic' + (failed.length === 1 ? '' : 's') + '. First failure: '
        + ((failed[0] && failed[0].error) || 'no reason reported') + '.'
      : (partial ? failed.length + ' of ' + rows.length + ' topics could not be drafted. First failure: '
          + ((failed[0] && failed[0].error) || 'no reason reported') + '.' : null),
    data: {
      calendar: rows.map(function (row) {
        return {
          id: 'editorial_' + (row.dueDate || 'unplaced') + '_' + row.index,
          title: row.title,
          dueDate: row.dueDate,
          dueBasis: row.dueBasis,
          format: row.format,
          platform: row.platform,
          audience: row.audience,
          intent: row.intent,
          primaryKeyword: row.primaryKeyword,
        };
      }),
      drafts: drafts,
      coverage: {
        requested: topics.length,
        placed: scheduled,
        drafted: drafted.length,
        failed: failed.length,
        skipped: skipped,
        draftingTool: DRAFTING_TOOL,
      },
    },
    present: blocks,
  }));

  function record_missingCoverage(list) {
    return list.some(function (row) { return !row.audience || !row.primaryKeyword || !row.platform; });
  }
})();`;

export const EDITORIAL_CALENDAR_ARTICLE_COPILOT = createCodeSkill({
  id: 'editorial-calendar-article-copilot',
  name: 'Editorial Calendar & Article Co-Pilot',
  description:
    'Turns supplied editorial topics into a dated calendar and drafts a computed brief for each one. Dates come from the supplied deadlines, or are derived from the cycle start and cadence when a topic has none. Draft briefs are produced by the content drafting tool; if that fails the result says so, states the failure, and reports the number of topics actually drafted rather than reporting a full-looking calendar with empty drafts.',
  tier: 'aid',
  domainKnowledge:
    'Editorial calendar planning: topic placement, publication cadence, search-intent-led topic selection, and content brief construction for each slot',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: EDITORIAL_CALENDAR_SOURCE,
    persistenceEnv: 'CONTENT_HOME',
    ui: { view: 'editorial-calendar' },
    workflowStage: 'plan',
  },
  inputSchema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        description: 'Editorial topics. Each needs a title; audience, intent, format, platform, keywords, tone, length, and deadline sharpen the brief.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Topic title (required)' },
            audience: { type: 'string', description: 'Target audience' },
            intent: { type: 'string', description: 'Search intent (informational, commercial, transactional, navigational)' },
            format: { type: 'string', description: 'Content format (blog, case-study, newsletter, whitepaper, script, video, email, social)' },
            platform: { type: 'string', description: 'Target platform' },
            keywords: { type: 'array', items: { type: 'string' }, description: 'Target keywords' },
            tone: { type: 'string', description: 'Writing tone' },
            length: { type: 'string', description: 'Target length (short, medium, long)' },
            deadline: { type: 'string', description: 'Publication deadline (ISO 8601 date)' },
          },
          required: ['title'],
        },
      },
      startDate: { type: 'string', description: 'Calendar cycle start (ISO 8601 date); undated topics are placed from here' },
      cadenceDays: { type: 'number', description: 'Days between undated topics (default 7)' },
    },
    required: ['topics'],
  },
  outputSchema: contentResultSchema('Calendar rows, per-topic draft outcomes, and delegation coverage'),
  triggers: [
    { kind: 'event', on: 'Content Strategy & SEO Evaluator returns a ranked set of topics to schedule' },
    { kind: 'user', phrase_examples: ['plan the editorial calendar', 'schedule these topics', 'build content briefs'] },
  ],
  isSkill: true,
});
