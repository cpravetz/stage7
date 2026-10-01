// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const CONTENT_DRAFTING_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: ['string', 'null'], description: 'ok, error, or not-connected' },
    data: { type: ['object', 'null'] },
    error: { type: ['string', 'null'] },
    present: {
      type: 'array',
      description: 'User-formatted blocks conforming to the generic presentation contract',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          kind: { type: 'string' },
        },
        required: ['id', 'body'],
      },
    },
  },
  required: ['success', 'present'],
};

export const CONTENT_DRAFTING_ADAPTATION = createDeclarativeCodeSkill({
  id: 'content-drafting-adaptation',
  name: 'Content Drafting & Adaptation',
  description:
    'Produces a computed editorial brief and measures supplied source text. For draft tasks it derives a section plan with word budgets and a keyword placement plan from the supplied parameters. For adapt/repurpose it measures the source (words, sentences, headings, Flesch reading ease, keyword coverage) and returns the concrete transformation steps. It does not write prose: it has no language model behind it and says so in its output.',
  persistenceEnvVar: 'CONTENT_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      task: SchemaProps.select(['draft', 'adapt', 'repurpose'], { description: 'draft a brief, adapt existing content, or repurpose it' }),
      contentType: SchemaProps.select(['blog', 'social', 'video', 'email', 'script', 'whitepaper', 'case-study', 'newsletter'], { description: 'Type of content' }),
      topic: SchemaProps.text({ description: 'Topic or title (required for draft)' }),
      sourceContent: SchemaProps.text({ description: 'Existing content to measure (required for adapt and repurpose)', multiline: true }),
      targetFormat: SchemaProps.select(['blog', 'social', 'video', 'email', 'script', 'thread', 'carousel', 'short-form', 'long-form'], { description: 'Target format for adaptation' }),
      targetPlatform: SchemaProps.select(['linkedin', 'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'blog', 'newsletter', 'medium', 'substack'], { description: 'Target platform' }),
      targetLanguage: SchemaProps.text({ description: 'Target language for translation or localisation' }),
      targetAudience: SchemaProps.text({ description: 'Target audience' }),
      tone: SchemaProps.select(['professional', 'conversational', 'authoritative', 'friendly', 'witty', 'empathetic', 'technical', 'persuasive'], { description: 'Writing tone', default: 'professional' }),
      length: SchemaProps.select(['short', 'medium', 'long'], { description: 'Target length', default: 'medium' }),
      keywords: SchemaProps.stringArray({ description: 'Keywords to plan placement for' }),
    },
    required: ['task'],
  },
  outputSchema: CONTENT_DRAFTING_OUTPUT_SCHEMA,
  isSkill: false,
  manifest: {
    workflowStage: 'draft'
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';

      const fail = (status, message, title) => {
        return           {
          success: false,
          status: status,
          error: message,
          data: null,
          present: [{ id: 'notice', title: title, kind: 'text', body: message }],
          };
      };

      const task = String(input.task || 'draft');
      const contentType = String(input.contentType || 'blog').toLowerCase();
      const topic = String(input.topic || '').trim();
      const sourceContent = String(input.sourceContent || '').trim();
      const targetFormat = String(input.targetFormat || '').toLowerCase();
      const targetPlatform = String(input.targetPlatform || '').toLowerCase();
      const targetLanguage = String(input.targetLanguage || '').trim();
      const targetAudience = String(input.targetAudience || '').trim();
      const tone = String(input.tone || 'professional');
      const length = String(input.length || 'medium').toLowerCase();
      const rawKeywords = Array.isArray(input.keywords) ? input.keywords : (typeof input.keywords === 'string' && input.keywords ? [input.keywords] : []);
      const keywords = rawKeywords.map(function (k) { return String(k).trim(); }).filter(function (k) { return k.length > 0; });

      if (task !== 'draft' && !sourceContent) {
        return fail('error', 'sourceContent is required for the ' + task + ' task.', 'Source text required');
      }
      if (task === 'draft' && !topic) {
        return fail('error', 'topic is required for the draft task.', 'Topic required');
      }

      // ---- Text measurement (real computation over the supplied text) ------------------
      const countSyllables = (word) => {
        const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
        if (!w) return 0;
        if (w.length <= 3) return 1;
        const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').replace(/^y/, '');
        const groups = trimmed.match(/[aeiouy]{1,2}/g);
        return groups ? groups.length : 1;
      };

      const measure = (text) => {
        const plain = String(text || '');
        const words = plain.match(/[A-Za-z0-9'’-]+/g) || [];
        const sentences = plain.split(/[.!?]+(?=\s|$)/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
        const paragraphs = plain.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
        const headings = (plain.match(/^#{1,6}\s+.+$/gm) || []);
        const syllables = words.reduce(function (sum, w) { return sum + countSyllables(w); }, 0);
        const wordCount = words.length;
        const sentenceCount = sentences.length;
        const avgWordsPerSentence = sentenceCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;
        const flesch = sentenceCount > 0 && wordCount > 0
          ? Math.round((206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount)) * 10) / 10
          : 0;
        let band = 'not scored';
        if (sentenceCount > 0 && wordCount > 0) {
          if (flesch >= 60) band = 'plain (60+)';
          else if (flesch >= 50) band = 'fairly easy (50-59)';
          else if (flesch >= 30) band = 'difficult (30-49)';
          else band = 'very difficult (under 30)';
        }
        const longest = sentences.slice().sort(function (a, b) { return b.length - a.length; })[0] || '';
        return {
          wordCount: wordCount,
          sentenceCount: sentenceCount,
          paragraphCount: paragraphs.length,
          headingCount: headings.length,
          headings: headings,
          avgWordsPerSentence: avgWordsPerSentence,
          fleschReadingEase: flesch,
          readabilityBand: band,
          longestSentenceWords: longest ? (longest.match(/[A-Za-z0-9'’-]+/g) || []).length : 0,
        };
      };

      const escapeRegExp = (value) => String(value).replace(/[.*+?^$()|[\]{}]/g, '\\$&');

      const keywordReport = (text, words) => {
        const haystack = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9'\s]+/g, ' ') + ' ';
        return keywords.map(function (keyword) {
          const needle = keyword.toLowerCase();
          const matches = haystack.split(new RegExp('(?<![a-z0-9])' + escapeRegExp(needle) + '(?![a-z0-9])', 'g')).length - 1;
          const density = words > 0 ? Math.round((matches / words) * 10000) / 100 : 0;
          return { keyword: keyword, occurrences: matches, densityPercent: density, present: matches > 0 };
        });
      };

      // ---- Craft conventions -----------------------------------------------------------
      // These are editorial conventions, not measurements. They are labelled as conventions in
      // the report so the user does not read them as observed data.
      const WORD_BUDGETS = {
        blog: { short: 600, medium: 1100, long: 2000 },
        'case-study': { short: 500, medium: 1100, long: 2000 },
        newsletter: { short: 400, medium: 800, long: 1400 },
        whitepaper: { short: 1200, medium: 2500, long: 5000 },
        script: { short: 400, medium: 900, long: 1600 },
        video: { short: 250, medium: 500, long: 900 },
        email: { short: 150, medium: 300, long: 500 },
        social: { short: 90, medium: 180, long: 300 },
      };
      const budgetTable = WORD_BUDGETS[contentType] || WORD_BUDGETS.blog;
      const targetWords = budgetTable[length] || budgetTable.medium;

      const SECTION_PLANS = {
        blog: ['Hook and promise', 'Context and stakes', 'Main argument', 'Supporting evidence', 'Counterpoint or caveat', 'Conclusion and next step'],
        'case-study': ['Customer and problem', 'What was attempted', 'Outcome with numbers', 'Why it worked', 'What to copy'],
        newsletter: ['Subject line', 'Opening', 'Primary story', 'Secondary items', 'Single call to action'],
        whitepaper: ['Executive summary', 'Problem definition', 'Method', 'Findings', 'Recommendations', 'Limitations'],
        script: ['Opening beat', 'Setup', 'Escalation', 'Turning point', 'Resolution'],
        video: ['Hook (0-3s)', 'Intro (3-10s)', 'Segment 1', 'Segment 2', 'Segment 3', 'Recap', 'Call to action'],
        email: ['Subject line', 'Preheader', 'Opening', 'Value', 'Proof', 'Call to action'],
        social: ['Hook', 'Value', 'Proof', 'Call to action'],
      };
      const sectionPlan = SECTION_PLANS[contentType] || SECTION_PLANS.blog;
      const primaryKeyword = keywords.length > 0 ? keywords[0] : '';

      const budgetFor = (index, plan) => {
        const base = Math.floor(targetWords / plan.length);
        return index === plan.length - 1 ? targetWords - base * (plan.length - 1) : base;
      };

      const sourceStats = sourceContent ? measure(sourceContent) : null;
      const sourceKeywords = sourceContent ? keywordReport(sourceContent, sourceStats.wordCount) : [];
      const allStats = sourceStats;

      // ---- Report assembly -------------------------------------------------------------
      const L = [];
      const scopeNote = 'Every figure below is computed from the text you supplied. No external content, '
        + 'keyword, or competitor data service was queried, so nothing here is a market measurement.';

      const coverageLines = [
        'Source of every figure: ' + (sourceContent
          ? 'the ' + allStats.wordCount + '-word source text you supplied.'
          : 'the editorial parameters you supplied (no source text was given).'),
        'Not consulted: search volume, competitor rankings, trend data, or any external content analytics service.',
      ];

      if (sourceStats) {
        L.push('Measured source text');
        L.push('  Words              ' + sourceStats.wordCount);
        L.push('  Sentences          ' + sourceStats.sentenceCount);
        L.push('  Paragraphs         ' + sourceStats.paragraphCount);
        L.push('  Markdown headings  ' + sourceStats.headingCount);
        L.push('  Avg sentence       ' + sourceStats.avgWordsPerSentence + ' words');
        L.push('  Flesch reading ease ' + sourceStats.fleschReadingEase + '  (' + sourceStats.readabilityBand + ')');
        L.push('  Longest sentence   ' + sourceStats.longestSentenceWords + ' words');
        L.push('');
      }

      if (task === 'draft') {
        L.push('Draft brief: ' + topic);
        L.push('  Format      ' + contentType + '  -  ' + targetWords + ' words total (' + length + ')');
        if (targetPlatform) L.push('  Platform    ' + targetPlatform);
        if (targetAudience) L.push('  Audience    ' + targetAudience);
        L.push('  Tone        ' + tone);
        if (targetLanguage) L.push('  Language    ' + targetLanguage);
        L.push('');
        L.push('Section plan (word budgets sum to ' + targetWords + ', the convention for a ' + length + ' ' + contentType + ' piece):');
        sectionPlan.forEach(function (section, index) {
          L.push('  ' + (index + 1) + '. ' + section + ' - ' + budgetFor(index, sectionPlan) + ' words');
        });
        L.push('');
        if (keywords.length > 0) {
          L.push('Keyword plan (derived from the ' + keywords.length + ' keyword' + (keywords.length === 1 ? '' : 's') + ' you supplied):');
          const targetDensity = 1.0;
          const useCount = Math.max(1, Math.round((targetWords * targetDensity) / 100));
          keywords.forEach(function (keyword, index) {
            if (index === 0) {
              L.push('  Primary - "' + keyword + '": title, H1, and within the first 100 words. Repeat about '
                + useCount + ' times across ' + targetWords + ' words (roughly ' + targetDensity + '% density).');
            } else {
              L.push('  Secondary - "' + keyword + '": one H2 and one body mention. Do not use in the title.');
            }
          });
          if (!targetAudience) {
            L.push('');
            L.push('  No audience was supplied, so intent and reading level could not be tuned. Add targetAudience to sharpen this.');
          }
        } else {
          L.push('No keywords were supplied, so no keyword plan could be derived. Add keywords for a placement plan.');
        }
        L.push('');
        L.push('What this brief is not');
        L.push('  The section plan and budgets are editorial conventions, not observed data.');
        L.push('  This tool has no language model behind it, so it did not write the prose.');
        L.push('  The assistant model writes the copy from this plan.');
      } else {
        const targetType = targetFormat || contentType;
        const targetTable = WORD_BUDGETS[targetType] || WORD_BUDGETS.blog;
        const targetBudget = targetTable[length] || targetTable.medium;
        // The section plan must follow the target format, not the source format. Using the source plan
        // while describing the target printed blog sections under a heading that said "social sections".
        const targetPlan = SECTION_PLANS[targetType] || SECTION_PLANS.blog;
        const compression = sourceStats.wordCount > 0
          ? Math.round((targetBudget / sourceStats.wordCount) * 100)
          : 0;
        // Direction-aware: a target longer than the source has to be expanded, not cut.
        const direction = compression === 0
          ? 'Hold the ' + allStats.sentenceCount + ' source sentences at roughly their current length'
          : (compression < 100
            ? 'Cut the ' + allStats.sentenceCount + ' source sentences down to about ' + targetBudget + ' words'
            : 'Expand the ' + allStats.sentenceCount + ' source sentences to about ' + targetBudget
              + ' words, which is ' + compression + '% of the source');

        L.push('  Source       ' + allStats.wordCount + ' words, ' + allStats.sentenceCount + ' sentences, ' + allStats.headingCount + ' headings');
        L.push('  Target       ' + targetType + (targetPlatform ? ' on ' + targetPlatform : '') + '  -  ' + targetBudget + ' words (' + length + ' convention)');
        if (targetLanguage) L.push('  Language     ' + targetLanguage);
        if (targetAudience) L.push('  Audience     ' + targetAudience);
        L.push('  Tone         ' + tone);
        if (compression > 0) {
          L.push('  Scale factor ' + compression + '% of source length (' + targetBudget + ' of ' + allStats.wordCount + ' words)');
        }
        L.push('');
        L.push('Measured gaps to close');
        if (sourceKeywords.length > 0) {
          sourceKeywords.forEach(function (entry) {
            if (entry.present) {
              L.push('  "' + entry.keyword + '" already appears ' + entry.occurrences + ' time' + (entry.occurrences === 1 ? '' : 's')
                + ' (' + entry.densityPercent + '% density) - carry it across, adjusting count to the target length.');
            } else {
              L.push('  "' + entry.keyword + '" does not appear in the source at all - it must be added, not merely carried across.');
            }
          });
        } else {
          L.push('  No keywords supplied, so keyword coverage could not be measured against the source.');
        }
        if (allStats.fleschReadingEase < 50) {
          L.push('  Source reads at ' + allStats.fleschReadingEase + ' (' + allStats.readabilityBand
            + '). The target is ' + targetType + ', so sentences need shortening before the length change is applied.');
        } else {
          L.push('  Source reads at ' + allStats.fleschReadingEase + ' (' + allStats.readabilityBand
            + '), which is workable for ' + targetType + '. Length is the main change, not complexity.');
        }
        if (allStats.longestSentenceWords > 30) {
          L.push('  Longest sentence runs ' + allStats.longestSentenceWords + ' words; split it first, since it carries the readability load.');
        }
        L.push('');
        L.push('Transformation steps');
        const steps = [
          direction + ' for a ' + targetType + ' piece.',
          allStats.headingCount > 0
            ? 'Re-map the ' + allStats.headingCount + ' existing headings onto the ' + targetPlan.length + ' ' + targetType + ' sections: ' + targetPlan.join(', ') + '.'
            : 'The source has no headings. Add ' + targetPlan.length + ' ' + targetType + ' sections: ' + targetPlan.join(', ') + '.',
          keywords.length > 0
            ? 'Place the primary keyword "' + keywords[0] + '" in the title and first 100 words; add any keyword with zero source occurrences from scratch.'
            : 'Supply keywords to produce a placement plan.',
          targetLanguage
            ? 'Translate to ' + targetLanguage + ' after the length change, not before, so the target budget survives translation.'
            : 'No target language supplied, so no localisation step is planned.',
        ];
        steps.forEach(function (step, index) { L.push('  ' + (index + 1) + '. ' + step); });
        L.push('');
        L.push('What this brief is not');
        L.push('  The measured figures come from your source text.');
        L.push('  The target budgets and section plans are editorial conventions.');
        L.push('  The rewritten copy itself is produced by the assistant model from this plan.');
      }

      const data = {
        task: task,
        contentType: contentType,
        target: targetPlatform || null,
        targetWords: task === 'draft' ? targetWords : (WORD_BUDGETS[targetFormat || contentType] || WORD_BUDGETS.blog)[length] || targetWords,
        measured: allStats,
        keywordCoverage: sourceKeywords,
        conventions: (function () {
          const plan = task === 'draft' ? sectionPlan : (SECTION_PLANS[targetFormat || contentType] || SECTION_PLANS.blog);
          return { sectionCount: plan.length, sections: plan, budgetTable: budgetTable };
        })(),
        scope: 'locally-computed',
      };

      const hashString = (value) => {
        let h = 5381;
        for (let i = 0; i < value.length; i += 1) { h = ((h << 5) + h + value.charCodeAt(i)) >>> 0; }
        return h.toString(36);
      };
      const draftId = 'draft_' + hashString(task + '|' + topic + '|' + contentType + '|' + targetFormat + '|' + hashString(sourceContent));

      let persisted = false;
      try {
        const store = ctx.store.load('drafts', []);
        store.push({ id: draftId, task: task, contentType: contentType, topic: topic, measured: allStats, createdAt: new Date().toISOString() });
        ctx.store.save('drafts', store);
        persisted = true;
      } catch (error) {
        persisted = false;
      }
      data.id = draftId;
      data.persisted = persisted;

      const blocks = [
        { id: 'report', title: task === 'draft' ? 'Draft brief' : (task === 'adapt' ? 'Adaptation plan' : 'Repurposing plan'), kind: 'text', body: L.join(NL) },
        { id: 'scope', title: 'Data scope', kind: 'text', body: scopeNote + NL + NL + coverageLines.map(function (line) { return '- ' + line; }).join(NL) },
      ];

      return { success: true, present: blocks, data: data };
    }
  });

export { CONTENT_DRAFTING_OUTPUT_SCHEMA };
