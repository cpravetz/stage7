// @ts-nocheck

import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

export const lyricProsodyEvaluator = createDeclarativeCodeSkill({
  id: 'songwriting_lyric_prosody_evaluator',
  name: 'Advise Lyric & Structural Prosody Evaluator',
  description: 'Analyzes song lyrics for meter consistency, syllable deviation from a target, rhyme pairs, refrain detection, and recurring thematic vocabulary, separating section labels from sung lines, then returns concrete structural revision recommendations and a formatted report.',
  persistenceEnvVar: 'SONGWRITING_HOME',
  tier: 'advise',
  domainKnowledge: 'Lyric prosody metrics, syllable and stress patterning, rhyme evaluation, and structural songwriting craft',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: SchemaProps.text({ title: 'Draft ID', description: 'Optional song draft identifier to attach to the evaluation', order: 1, hint: 'Links this evaluation to a specific draft in your lyric sketchbook' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Complete lyric text to evaluate', order: 2, hint: 'Paste the full lyric. Section labels like [Chorus] are detected and excluded from the metrics' }),
      genre: SchemaProps.text({ title: 'Genre', description: 'Musical genre used as context for structural expectations', order: 3, default: 'general', hint: 'e.g. pop, rock, hiphop, country, folk, edm, rnb' }),
      structure: SchemaProps.select(['verse-chorus', 'standard', 'aaba', 'simple', 'rap'], { title: 'Structure', description: 'Expected song structure', order: 4, default: 'verse-chorus', hint: 'The structural template the lyric is expected to follow' }),
      targetMeter: SchemaProps.number({ title: 'Target Meter', description: 'Target syllables per line for meter analysis', order: 5, minimum: 1, maximum: 20, default: 8, hint: 'Desired syllables per line; deviations are reported as meter consistency and standard deviation' }),
      referenceLyrics: SchemaProps.textarea({ title: 'Reference Lyrics', description: 'Optional reference lyric or style sample for comparison', order: 6, hint: 'Paste a reference lyric or style sample to compare against' }),
    },
    required: ['lyrics'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the evaluation completed successfully' },
      data: { type: 'object', description: 'Prosody metrics, rhyme pairs, refrain lines, per-line metrics, theme signals, recommendations, and a formatted report' },
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
  },
  triggers: [
    // User, not Event: the lyrics are the input and the Skill blocks without them.
    { kind: 'user', phrase_examples: ['Check the prosody of these lyrics', 'Do these lines scan in iambic meter', 'Fix the stress pattern in this verse'] },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      const lyrics = String(input.lyrics || '').trim();
      const genre = String(input.genre || 'general').toLowerCase();
      const structure = String(input.structure || 'verse-chorus');
      const targetMeter = Number(input.targetMeter || 8);

      if (!lyrics) {
        return {
          success: false,
          error: 'Paste lyrics to evaluate them.',
          present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'Paste lyrics to evaluate them.' }],
        };
      }

      // Section labels like "[Chorus]", "Chorus:", "Verse 1" are structure, not lyric. Counting them as
      // lyric lines pulled the syllable average around and polluted the rhyme scheme.
      const SECTION_LABEL = /^\s*[\[(]?\s*(intro|verse|pre|chorus|refrain|hook|bridge|breakdown|drop|outro|interlude|instrumental|tag|coda|post)\b[^\])\n]*[\])]?\s*:?\s*$/i;

      function estimateSyllables(value) {
        const word = String(value).toLowerCase().replace(/[^a-z']/g, '');
        if (!word) return 0;
        const groups = word.match(/[aeiouy]+/g);
        let count = groups ? groups.length : 1;
        if (word.endsWith('e') && !word.endsWith('le') && count > 1) count -= 1;
        return Math.max(1, count);
      }

      const rawLines = lyrics.split(/\r?\n/);
      const sectionMarkers = [];
      const lyricLines = [];
      rawLines.forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (SECTION_LABEL.test(trimmed)) {
          sectionMarkers.push({ label: trimmed.replace(/^[\[(]|[:\])]?\s*$/g, '').trim() || trimmed, beforeLine: lyricLines.length + 1 });
          return;
        }
        lyricLines.push(trimmed);
      });

      if (!lyricLines.length) {
        return {
          success: false,
          error: 'Every line was a section label, so there is no lyric to evaluate.',
          present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'Every line was a section label, so there is no lyric to evaluate.' }],
        };
      }

      const SECTION_BOUNDARY = /\b(chorus|refrain|hook|bridge|tag|outro|intro)\b/i;

      function endSyllables(line) {
        const words = line.split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const tail = words.slice(-2);
        return tail.map(estimateSyllables);
      }

      function rhymeKey(line) {
        const words = line.split(/\s+/).filter(Boolean);
        if (!words.length) return '';
        const word = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
        return word.length >= 3 ? word.slice(-3) : word;
      }

      const lineMetrics = lyricLines.map(function (line, index) {
        const words = line.split(/\s+/).filter(Boolean);
        const syllables = words.reduce(function (sum, word) { return sum + estimateSyllables(word); }, 0);
        return {
          line: index + 1,
          text: line,
          words: words.length,
          syllables: syllables,
          deltaFromTarget: syllables - targetMeter,
          rhymeKey: rhymeKey(line),
          endSyllables: endSyllables(line),
        };
      });

      const rhymePairs = [];
      for (let i = 0; i < lineMetrics.length; i += 1) {
        for (let j = i + 1; j < lineMetrics.length; j += 1) {
          const a = lineMetrics[i];
          const b = lineMetrics[j];
          if (a.rhymeKey.length < 3 || a.rhymeKey !== b.rhymeKey) continue;
          // Refrains are meant to repeat verbatim; do not score the hook against itself.
          if (SECTION_BOUNDARY.test(a.text) || a.text.toLowerCase() === b.text.toLowerCase()) continue;
          rhymePairs.push({ lines: [a.line, b.line], rhyme: a.rhymeKey, type: 'full' });
        }
      }

      const syllableCounts = lineMetrics.map(function (m) { return m.syllables; });
      const averageSyllables = syllableCounts.reduce(function (s, v) { return s + v; }, 0) / syllableCounts.length;
      const meterVariance = syllableCounts.reduce(function (s, v) { return s + Math.pow(v - targetMeter, 2); }, 0) / syllableCounts.length;
      const meterDeviation = Math.sqrt(meterVariance);
      const withinTarget = syllableCounts.filter(function (v) { return Math.abs(v - targetMeter) <= 2; }).length;
      const meterConsistency = Math.round((withinTarget / syllableCounts.length) * 1000) / 1000;

      const repeatedWords = {};
      lyricLines.forEach(function (line) {
        line.toLowerCase().replace(/[^a-z']/g, ' ').split(/\s+/).forEach(function (word) {
          if (word.length > 3) repeatedWords[word] = (repeatedWords[word] || 0) + 1;
        });
      });
      const themeWords = Object.keys(repeatedWords)
        .filter(function (w) { return repeatedWords[w] > 1; })
        .sort(function (a, b) { return repeatedWords[b] - repeatedWords[a]; })
        .slice(0, 8);

      const refrainLines = [];
      lyricLines.forEach(function (line) {
        if (SECTION_BOUNDARY.test(line) && refrainLines.indexOf(line) === -1) refrainLines.push(line);
      });

      const recommendations = [];
      if (meterConsistency < 0.5) {
        recommendations.push('Only ' + Math.round(meterConsistency * 100) + '% of lines sit within two syllables of the ' + targetMeter + '-syllable target. Vary line length deliberately or set a targetMeter that matches how you intend to sing it.');
      }
      if (rhymePairs.length === 0) {
        recommendations.push('No end rhymes were detected across ' + lyricLines.length + ' lyric lines. Add a deliberate rhyme scheme or use slant rhyme intentionally.');
      }
      if (themeWords.length === 0) {
        recommendations.push('No word repeats across the lyric, so there is no recurring vocabulary to hook into. Reinforce the central image.');
      }
      if (lyricLines.length < 4) {
        recommendations.push('Only ' + lyricLines.length + ' lyric line(s) supplied; at least four are needed before meter and rhyme say anything about the song.');
      }
      const longest = lineMetrics.reduce(function (a, b) { return b.syllables > a.syllables ? b : a; }, lineMetrics[0]);
      const shortest = lineMetrics.reduce(function (a, b) { return b.syllables < a.syllables ? b : a; }, lineMetrics[0]);
      if (longest.syllables - shortest.syllables > targetMeter) {
        recommendations.push('Line lengths range from ' + shortest.syllables + ' to ' + longest.syllables + ' syllables (line ' + longest.line + ' is the outlier). Even that spread is singable; more than a target-meter gap usually is not.');
      }
      if (recommendations.length === 0) {
        recommendations.push('Meter, rhyme signal and thematic vocabulary are all present and consistent enough to carry into a melodic pass.');
      }

      const evaluation = {
        id: 'song_eval_' + Date.now(),
        draftId: input.draftId || null,
        genre: genre,
        structure: structure,
        targetMeter: targetMeter,
        lineCount: lyricLines.length,
        sectionCount: sectionMarkers.length,
        sections: sectionMarkers,
        averageSyllablesPerLine: Math.round(averageSyllables * 10) / 10,
        meterDeviation: Math.round(meterDeviation * 100) / 100,
        meterVariance: Math.round(meterVariance * 100) / 100,
        meterConsistency: meterConsistency,
        rhymePairs: rhymePairs,
        rhymePairCount: rhymePairs.length,
        refrainLines: refrainLines,
        lineMetrics: lineMetrics,
        themeWords: themeWords,
        recommendations: recommendations,
        source: 'local',
        createdAt: new Date().toISOString(),
      };

      const reportLines = [];
      reportLines.push('Genre: ' + genre + '   Structure: ' + structure + '   Target meter: ' + targetMeter + ' syllables/line');
      reportLines.push('Lyric lines: ' + lyricLines.length + '   Section labels: ' + sectionMarkers.length);
      reportLines.push('Average syllables per line: ' + evaluation.averageSyllablesPerLine + '   Std deviation: ' + evaluation.meterDeviation);
      reportLines.push('Lines within 2 syllables of target: ' + Math.round(meterConsistency * 100) + '%');
      reportLines.push('');
      reportLines.push('LINE METRICS');
      lineMetrics.forEach(function (m) {
        reportLines.push('  ' + String(m.line).padStart(3) + '. ' + String(m.syllables).padStart(2) + ' syl  ' + m.text);
      });
      reportLines.push('');
      reportLines.push('RHYME (' + rhymePairs.length + ' pair(s))');
      if (rhymePairs.length === 0) {
        reportLines.push('  None detected.');
      } else {
        rhymePairs.forEach(function (p) { reportLines.push('  lines ' + p.lines[0] + ' & ' + p.lines[1] + ' -> -' + p.rhyme); });
      }
      if (refrainLines.length) {
        reportLines.push('');
        reportLines.push('HOOK / REFRAIN LINES');
        refrainLines.forEach(function (l) { reportLines.push('  ' + l); });
      }
      reportLines.push('');
      reportLines.push('RECURRING VOCABULARY');
      reportLines.push(themeWords.length ? '  ' + themeWords.join(', ') : '  None - no word repeats.');
      reportLines.push('');
      reportLines.push('RECOMMENDATIONS');
      recommendations.forEach(function (r, i) { reportLines.push('  ' + (i + 1) + '. ' + r); });

      const reportBody = reportLines.join('\n');

      const store = ctx.store.load('lyric-evaluations', []);
      store.push(evaluation);
      ctx.store.save('lyric-evaluations', store);
      // The skill owns its user-facing layout. 'present' blocks are the generic contract the
      // renderer understands; the core never needs to know what a prosody report looks like.
      return {
        success: true,
        data: { evaluation: evaluation, storePath: ctx.store.getFilePath('lyric-evaluations') },
        present: [{ id: 'report', title: 'Lyric & Prosody Report', kind: 'text', body: reportBody }],
      };
    },
  });

export const musicalCoCreation = createDeclarativeCodeSkill({
  id: 'songwriting_musical_lyric_cocreation',
  name: 'Aid Musical & Lyric Co-Creation Engine',
  description: 'Generates a structured song draft with a key, meter, tempo feel and a real chord progression per section, rhyme-matched lyric lines drawn from theme vocabulary, a verbatim-repeating chorus hook, computed per-section rhyme schemes, a beat sheet, and a formatted plain-text song with chords over the lyrics.',
  persistenceEnvVar: 'SONGWRITING_HOME',
  tier: 'aid',
  domainKnowledge: 'Song craft co-creation, genre-aware chord progression, lyric section structure, hook design',
  inputSchema: {
    type: 'object',
    properties: {
      theme: SchemaProps.text({ title: 'Theme', description: 'Central emotional theme or subject of the song', order: 1, hint: 'e.g. love, loss, triumph, journey, rebellion, nostalgia' }),
      topic: SchemaProps.text({ title: 'Topic', description: 'Optional title or concrete subject used in the hook', order: 2, hint: 'Becomes the song title and grounds the verse detail' }),
      genre: SchemaProps.text({ title: 'Genre', description: 'Musical genre or style direction', order: 3, default: 'pop', hint: 'e.g. pop, rock, hiphop, country, folk, edm, rnb' }),
      mood: SchemaProps.text({ title: 'Mood', description: 'Emotional tone for the composition', order: 4, default: 'hopeful', hint: 'e.g. hopeful, melancholic, energetic, introspective' }),
      structure: SchemaProps.select(['verse-chorus', 'standard', 'aaba', 'simple', 'rap'], { title: 'Structure', description: 'Requested song structure', order: 5, default: 'verse-chorus', hint: 'Section ordering template for the generated draft' }),
      sectionCount: SchemaProps.number({ title: 'Section Count', description: 'Number of sections to generate, from 2 to 12', order: 6, minimum: 2, maximum: 12, hint: 'Controls how many sections the engine produces from the template' }),
      seed: SchemaProps.integer({ title: 'Seed', description: 'Optional deterministic seed for repeatable variations', order: 7, minimum: 0, hint: 'Enter a number for reproducible drafts across runs' }),
      existingContent: SchemaProps.textarea({ title: 'Existing Content', description: 'Optional existing lyric or brief to preserve while generating a revision', order: 8, hint: 'Paste existing material to build upon or revise' }),
      save: SchemaProps.boolean({ title: 'Save', description: 'Persist the generated draft in the songwriter workspace', order: 9, default: true, hint: 'Writes the draft to SONGWRITING_HOME/drafts.json when true' }),
    },
    required: ['theme'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the song draft was generated successfully' },
      data: { type: 'object', description: 'Generated song draft with key, chords, sections, beat sheet, syllable profile, and formatted plain-text song' },
      error: { type: 'string', description: 'Validation or execution error message' },
    },
    required: ['success', 'present'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Write a song about this theme', 'Generate chords and lyrics for this brief', 'Create a verse-chorus draft'] },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
    const theme = String(input.theme || '').trim();
    const topic = String(input.topic || theme || 'Untitled song');
    if (!theme) {
      return {
        success: false,
        error: 'A theme is required before a draft can be generated.',
        present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'A theme is required before a draft can be generated.' }],
      };
    }

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
      let body = String(text);
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
            systemPrompt: 'Reply with the finished deliverable only. Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
            prompt: prompt,
            options: { temperature: 0.7, maxTokens: 4096 },
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content || data.summary || null;
      } catch (e) {
        return null;
      }
    }

    function extractJsonObject(text) {
      if (!text || typeof text !== 'string') return null;
      const trimmed = text.trim();
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        // try to extract fenced or embedded object
      }
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced && fenced[1]) {
        try { return JSON.parse(fenced[1].trim()); } catch (e) {}
      }
      const first = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try { return JSON.parse(trimmed.slice(first, last + 1)); } catch (e) {}
      }
      return null;
    }

    function toSongModel(parsed) {
      const model = parsed && typeof parsed === 'object' ? parsed : {};
      const sections = Array.isArray(model.sections) ? model.sections : [];
      const normalizedSections = sections.map(function (s, idx) {
        const sec = s && typeof s === 'object' ? s : {};
        const lines = Array.isArray(sec.lines) ? sec.lines.map(function (l) { return String(l); }) : [];
        const chords = Array.isArray(sec.chordProgression) ? sec.chordProgression.map(function (c) { return String(c); }) : [];
        return {
          order: Number(sec.order || idx + 1),
          section: String(sec.section || ('Section ' + (idx + 1))),
          role: String(sec.role || 'verse'),
          purpose: String(sec.purpose || ''),
          chordProgression: chords,
          lines: lines,
          rhymeScheme: String(sec.rhymeScheme || ''),
          endWords: Array.isArray(sec.endWords) ? sec.endWords.map(function (w) { return String(w); }) : [],
          averageSyllablesPerLine: Number(sec.averageSyllablesPerLine || 0),
          transition: String(sec.transition || ''),
        };
      });
      const beatSheet = Array.isArray(model.beatSheet) ? model.beatSheet : normalizedSections.map(function (s) {
        return {
          order: s.order,
          section: s.section,
          role: s.role,
          musicalFocus: s.purpose,
          chordProgression: (s.chordProgression || []).join(' - '),
          lineCount: (s.lines || []).length,
          rhymeScheme: s.rhymeScheme,
        };
      });
      const chordVocabulary = Array.isArray(model.chordVocabulary) ? model.chordVocabulary.map(String) : [];
      const syllableProfile = Array.isArray(model.syllableProfile) ? model.syllableProfile : [];
      const fullText = model.lyrics && typeof model.lyrics.fullText === 'string'
        ? model.lyrics.fullText
        : normalizedSections.map(function (s) {
            return '[' + String(s.section).toUpperCase() + ']  ' + (s.chordProgression || []).join(' - ') + '\n' + (s.lines || []).join('\n');
          }).join('\n\n');

      return {
        title: String(model.title || topic),
        theme: String(model.theme || theme),
        genre: String(model.genre || input.genre || 'pop'),
        mood: String(model.mood || input.mood || 'hopeful'),
        structure: String(model.structure || input.structure || 'verse-chorus'),
        key: String(model.key || ''),
        meter: String(model.meter || ''),
        tempoFeel: String(model.tempoFeel || ''),
        sections: normalizedSections,
        beatSheet: beatSheet,
        chordVocabulary: chordVocabulary,
        syllableProfile: syllableProfile,
        lyrics: { fullText: fullText },
      };
    }

    const toolInput = {
      theme: theme,
      topic: topic,
      genre: String(input.genre || 'pop'),
      mood: String(input.mood || 'hopeful'),
      structure: String(input.structure || 'verse-chorus'),
      sectionCount: input.sectionCount,
      seed: input.seed,
      existingContent: input.existingContent,
    };

    let song = null;
    let delegatedRaw = null;
    try {
      delegatedRaw = await ctx.delegate('songwriting-lyric-co-creation', toolInput);
    } catch (e) {
      delegatedRaw = null;
    }
    const delegatedPayload = unwrapDelegated(delegatedRaw);
    let text = delegatedText(delegatedPayload);
    // ReasoningExecutor may put parsed JSON on the payload itself when outputFormat is json.
    if (!song && delegatedPayload && typeof delegatedPayload === 'object' && (Array.isArray(delegatedPayload.sections) || (delegatedPayload.lyrics && typeof delegatedPayload.lyrics === 'object'))) {
      song = toSongModel(delegatedPayload);
    }
    if (!song) {
      song = extractJsonObject(text) ? toSongModel(extractJsonObject(text)) : null;
    }
    if (!song) {
      const prompt = 'Create a complete, original song draft as JSON (no markdown fences) for this request: ' + JSON.stringify(toolInput) + '. Return shape: { title, theme, genre, mood, structure, key, meter, tempoFeel, sections: [{ order, section, role, purpose, chordProgression: string[], lines: string[], rhymeScheme, endWords, averageSyllablesPerLine, transition }], beatSheet, chordVocabulary, syllableProfile, lyrics: { fullText } }.';
      const direct = await callBrain(prompt);
      const cleaned = cleanDelegatedText(direct);
      song = extractJsonObject(cleaned || direct) ? toSongModel(extractJsonObject(cleaned || direct)) : null;
    }

    if (!song) {
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: 'Song generation is unavailable; ensure the assistant model (brain) is reachable.',
        present: [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Song generation requires a configured assistant model. Contact your administrator to verify Brain/model availability.' }],
      };
    }

    const headerLines = [];
    headerLines.push('Theme: ' + song.theme + '  |  Genre: ' + song.genre + '  |  Mood: ' + song.mood + '  |  Structure: ' + song.structure);
    headerLines.push('Key: ' + (song.key || 'n/a') + '  |  Meter: ' + (song.meter || 'n/a') + '  |  Tempo feel: ' + (song.tempoFeel || 'n/a'));
    headerLines.push('Chord vocabulary: ' + ((song.chordVocabulary && song.chordVocabulary.length) ? song.chordVocabulary.join(', ') : 'n/a'));

    const sectionBlocks = (song.sections || []).map(function (s) {
      const chordLine = (s.chordProgression && s.chordProgression.length) ? s.chordProgression.join('  |  ') : '';
      const body = chordLine ? (chordLine + '\n' + (s.lines || []).join('\n')) : (s.lines || []).join('\n');
      return '[' + String(s.section || '').toUpperCase() + ']' + (s.role ? ' (' + s.role + ')' : '') + '\n' + body;
    }).join('\n\n');

    const beatSheetLines = (song.beatSheet || []).map(function (b) {
      const order = b.order != null ? b.order : '';
      const sec = b.section || '';
      const role = b.role ? ' [' + b.role + ']' : '';
      const chords = b.chordProgression || '';
      const focus = b.musicalFocus || '';
      return String(order) + '. ' + String(sec).toUpperCase() + role + (chords ? '  ' + chords : '') + (focus ? ' - ' + focus : '');
    });

    const formattedSong = headerLines.join('\n')
      + '\n\n--- LYRICS & CHORDS ---\n\n'
      + (sectionBlocks || song.lyrics.fullText || '')
      + '\n\n--- BEAT SHEET ---\n'
      + (beatSheetLines.length ? beatSheetLines.join('\n') : '(none)');

    const syllableLines = (song.syllableProfile || []).map(function (p) {
      return String(p.section || '') + ' / line ' + String(p.line || '') + ': ' + String(p.syllables || 0) + ' syl  -  ' + String(p.text || '');
    });
    const syllableBody = syllableLines.length ? syllableLines.join('\n') : 'No syllable profile returned.';

    const draft = {
      id: 'song_' + Date.now(),
      format: 'song',
      title: song.title || topic,
      theme: song.theme,
      genre: song.genre,
      mood: song.mood,
      topic: topic,
      structure: song.structure,
      key: song.key,
      meter: song.meter,
      tempoFeel: song.tempoFeel,
      sections: song.sections,
      sectionCount: (song.sections || []).length,
      verseCount: (song.sections || []).filter(function (s) { return s.role === 'verse'; }).length,
      chorusCount: (song.sections || []).filter(function (s) { return s.role === 'chorus'; }).length,
      lyrics: song.lyrics,
      beatSheet: song.beatSheet,
      chordVocabulary: song.chordVocabulary,
      syllableProfile: song.syllableProfile,
      revision: input.existingContent
        ? { basedOn: 'existingContent', changes: ['Preserved supplied direction and regenerated draft via songwriting-lyric-co-creation'] }
        : null,
      source: 'llm',
      createdAt: new Date().toISOString(),
    };

    const result = {
      success: true,
      data: { draft: draft },
      present: [
        { id: 'song', title: draft.title || topic, kind: 'text', body: formattedSong },
        { id: 'syllable-profile', title: 'Syllable Profile', kind: 'text', body: syllableBody },
      ],
    };

    if (input.save !== false) {
      const store = ctx.store.load('drafts', []);
      store.push(draft);
      ctx.store.save('drafts', store);
      result.data.storePath = ctx.store.getFilePath('drafts');
    }

    return result;
  }
});
