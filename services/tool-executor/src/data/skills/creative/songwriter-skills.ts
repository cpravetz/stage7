// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const SONGWRITER_DISPATCH_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    endpointUrl: SchemaProps.url({ title: 'Endpoint URL', description: 'Lead-sheet, demo-asset, or registration endpoint URL', order: 1, hint: 'Provider endpoint for live dispatch of lead sheets, demo metadata, or registration records' }),
    provider: SchemaProps.select(['custom', 'daw', 'registration-portal'], { title: 'Provider', description: 'Configured asset or registration provider', order: 3, default: 'custom', hint: 'Select the service that will receive dispatched assets' }),
    defaultFormat: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Default Format', description: 'Default dispatch artifact format', order: 4, default: 'lead-sheet', hint: 'Default artifact type when none is specified at dispatch time' }),
    confirmBeforeSend: SchemaProps.boolean({ title: 'Confirm Before Send', description: 'Require explicit confirmation before a live asset dispatch', order: 5, default: true, hint: 'When enabled, live dispatch requires explicit confirmation input' }),
  },
};

function withConfirmation(skill: Tool): Tool {
  return {
    ...skill,
    confirmBeforeSend: true,
    manifest: { ...skill.manifest, confirmBeforeSend: true },
  };
}

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
      const genre = String(input.genre || 'pop').toLowerCase();
      const mood = String(input.mood || 'hopeful').toLowerCase();
      const structure = String(input.structure || 'verse-chorus');
      const topic = String(input.topic || theme || 'Untitled song');
      const seed = Math.abs(parseInt(input.seed, 10) || 0);

      if (!theme) {
        return {
          success: false,
          error: 'A theme is required before a draft can be generated.',
          present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'A theme is required before a draft can be generated.' }],
        };
      }

      // ---- Theme material --------------------------------------------------------------
      // Each theme carries real rhyme families, so generated couplets actually rhyme instead of
      // merely repeating one sentence shape.
      const THEMES = {
        love: {
          nouns: ['the heart', 'the promise', 'the silence', 'the window', 'the kitchen light'],
          verbs: ['waited', 'held on', 'let go', 'came back'],
          places: ['the front steps', 'the kitchen light', 'the long way round', 'the open window'],
          times: ['the morning', 'the evening', 'the winter', 'the summer', 'the small hours'],
          rhyme: [
            ['home', 'alone', 'gone', 'known', 'own'],
            ['night', 'light', 'sight', 'bright', 'right'],
            ['heart', 'apart', 'start', 'dark', 'chart'],
            ['hold', 'gold', 'cold', 'told', 'sold'],
            ['street', 'meet', 'feet', 'complete', 'heat'],
          ],
        },
        loss: {
          nouns: ['the ashes', 'the silence', 'the last winter', 'the empty chair', 'the old photograph'],
          verbs: ['let go', 'kept waiting', 'folded up', 'moved on'],
          places: ['the empty room', 'the train platform', 'the old address', 'the harbour road'],
          times: ['the autumn', 'the last winter', 'the slow morning', 'the late hour'],
          rhyme: [
            ['gone', 'alone', 'known', 'own', 'stone'],
            ['rain', 'again', 'pain', 'chain', 'gain'],
            ['cold', 'old', 'gold', 'hold', 'told'],
            ['night', 'light', 'right', 'sight', 'white'],
            ['away', 'day', 'stay', 'grey', 'say'],
          ],
        },
        triumph: {
          nouns: ['the summit', 'the starting line', 'the red ribbon', 'the open road', 'the morning'],
          verbs: ['climbed', 'earned', 'refused', 'held on', 'kept going'],
          places: ['the top of the hill', 'the starting line', 'the open road', 'the last mile'],
          times: ['the first light', 'the late summer', 'day one', 'this morning'],
          rhyme: [
            ['fire', 'higher', 'wire', 'desire', 'inspire'],
            ['rise', 'prize', 'eyes', 'surprise', 'wise'],
            ['gold', 'bold', 'hold', 'told', 'cold'],
            ['run', 'sun', 'done', 'won', 'one'],
            ['road', 'load', 'code', 'owed', 'showed'],
          ],
        },
        journey: {
          nouns: ['the highway', 'the ticket', 'the border', 'the compass', 'the first mile'],
          verbs: ['drove', 'left', 'counted', 'kept walking', 'turned back'],
          places: ['the county line', 'the old highway', 'the train car', 'the first mile'],
          times: ['the daylight', 'day one', 'the late autumn', 'some morning'],
          rhyme: [
            ['away', 'day', 'way', 'stay', 'grey'],
            ['road', 'load', 'home', 'alone', 'known'],
            ['open', 'broken', 'spoken', 'chosen', 'olden'],
            ['horizon', 'rising', 'surprise', 'realise', 'promised'],
            ['free', 'sea', 'three', 'key', 'me'],
          ],
        },
        rebellion: {
          nouns: ['the quiet', 'the red paint', 'the locked gate', 'the paperwork', 'the old rules'],
          verbs: ['refused', 'signed', 'spoke up', 'broke', 'answered'],
          places: ['the city hall', 'the front steps', 'the kitchen table', 'the locked gate'],
          times: ['day one', 'the last night', 'the monday morning', 'this week'],
          rhyme: [
            ['fire', 'higher', 'wire', 'desire', 'choir'],
            ['fall', 'all', 'wall', 'call', 'tall'],
            ['free', 'me', 'see', 'three', 'be'],
            ['out', 'shout', 'about', 'doubt', 'mouth'],
            ['break', 'wake', 'take', 'make', 'shake'],
          ],
        },
        nostalgia: {
          nouns: ['the summer', 'the kitchen', 'the old radio', 'the photograph', 'the back seat'],
          verbs: ['remembered', 'kept', 'drove past', 'played again', 'left'],
          places: ['the old house', 'the back steps', 'the drive-in', 'the kitchen window'],
          times: ['the summer', 'the august', 'that september', 'the last sunday'],
          rhyme: [
            ['summer', 'under', 'thunder', 'wonder', 'number'],
            ['gold', 'old', 'told', 'hold', 'cold'],
            ['again', 'then', 'when', 'rain', 'home'],
            ['blue', 'true', 'you', 'through', 'new'],
            ['highway', 'yesterday', 'always', 'someday', 'friday'],
          ],
        },
      };
      const bank = THEMES[theme.toLowerCase()] || THEMES.love;

      // ---- Musical material -----------------------------------------------------------
      const GENRE_MUSIC = {
        pop:     { key: 'C major', meter: '4/4', tempo: 'mid-tempo', progressions: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['I', 'iii', 'IV', 'V']], linesPerSection: 4 },
        rock:    { key: 'E minor', meter: '4/4', tempo: 'driving', progressions: [['i', 'VII', 'VI', 'VII'], ['i', 'III', 'VII', 'i']], linesPerSection: 4 },
        country: { key: 'G major', meter: '4/4', tempo: 'steady', progressions: [['I', 'IV', 'V', 'I'], ['I', 'V', 'vi', 'IV']], linesPerSection: 4 },
        folk:    { key: 'D major', meter: '4/4', tempo: 'unhurried', progressions: [['I', 'V', 'vi', 'IV'], ['I', 'iii', 'vi', 'IV']], linesPerSection: 4 },
        edm:     { key: 'A minor', meter: '4/4', tempo: 'build', progressions: [['i', 'VI', 'III', 'VII'], ['i', 'VII', 'VI', 'VII']], linesPerSection: 4 },
        rnb:     { key: 'F major', meter: '4/4', tempo: 'slow', progressions: [['ii', 'V', 'Imaj7', 'vi'], ['Imaj7', 'vi', 'ii', 'V']], linesPerSection: 4 },
        hiphop:  { key: 'B minor', meter: '4/4', tempo: 'steady 90', progressions: [['i', 'VII', 'VI', 'VII'], ['i', 'VI', 'III', 'VII']], linesPerSection: 4 },
      };
      const music = GENRE_MUSIC[genre] || GENRE_MUSIC.pop;

      // ---- Structure ------------------------------------------------------------------
      const STRUCTURES = {
        standard: ['verse 1', 'chorus', 'verse 2', 'chorus', 'bridge', 'chorus'],
        'verse-chorus': ['verse 1', 'chorus', 'verse 2', 'chorus', 'bridge', 'chorus'],
        aaba: ['verse 1', 'verse 2', 'bridge', 'verse 3'],
        simple: ['verse 1', 'chorus', 'verse 2', 'chorus'],
        rap: ['intro', 'verse 1', 'chorus', 'verse 2', 'chorus', 'verse 3', 'outro'],
      };
      const templateNames = (STRUCTURES[structure] || STRUCTURES.standard).slice();
      const sectionCount = Math.max(2, Math.min(12, Number(input.sectionCount || 0) || templateNames.length));
      let sectionNames = templateNames.slice(0, sectionCount);
      while (sectionNames.length < sectionCount) {
        const verseNumber = sectionNames.filter(function (s) { return s.indexOf('verse') === 0; }).length + 1;
        sectionNames.splice(Math.max(1, sectionNames.length - 1), 0, 'verse ' + verseNumber);
      }

      function roleOf(name) {
        const n = name.toLowerCase();
        if (n.indexOf('chorus') === 0) return 'chorus';
        if (n.indexOf('verse') === 0) return 'verse';
        if (n.indexOf('bridge') === 0) return 'bridge';
        if (n.indexOf('intro') === 0) return 'intro';
        if (n.indexOf('outro') === 0) return 'outro';
        return 'verse';
      }

      const ROLE_PURPOSE = {
        chorus: 'The hook. States the central promise in the most repeatable form in the song; every chorus sings these exact words.',
        verse: 'Narration. Moves the story forward and earns the emotional turn the chorus pays off.',
        bridge: 'Contrast. Changes angle or texture so the return to the chorus lands as a release.',
        intro: 'Establishes the key, tempo and mood before the first line lands.',
        outro: 'Lets the last chord ring out and closes the loop opened by the intro.',
      };

      // ---- Lyric construction ---------------------------------------------------------
      let cursor = seed;
      function pick(list) {
        const value = list[cursor % list.length];
        cursor += 1;
        return value;
      }
      function rhymeWord(index) {
        const family = bank.rhyme[index % bank.rhyme.length];
        return family[cursor % family.length];
      }

      // Slots are filled from the theme bank so lines read as English. {{r}} resolves to the rhyming
      // word for the current couplet, so the end words actually rhyme.
      // Nouns, places and times carry their own determiner so a template never has to guess whether it
      // needs one. That is what stops generated lines reading as "the an open window".
      const VERSE_A = [
        'I {{v}} by {{p}} till {{t}} went quiet',
        'I told myself {{n}} would hold this time',
        'I kept {{n}} where you could see it from the street',
        'I let {{t}} do the talking, which is worse than lying',
        'I counted the hours like they were mine to spend',
        'I said I was fine, which is a kind of lie',
      ];
      const VERSE_B = [
        'You said {{n}} would hold, and I believed you then',
        'I {{v}} until {{p}} gave up and I did too',
        'I am still out here, out of reach of {{p}}',
        '{{n}} is still here, and {{t}} is the proof',
        'Nothing in the world was ever going to be enough',
        'Every road out of {{p}} was a reason to {{r}}',
      ];
      const CHORUS_SETS = [
        ['Take me back to {{p}}', 'I am still your {{r}}, coming home'],
        ['Hold {{n}} a little longer', 'I am not done, I am not done'],
        ['If I had one more night', 'I would spend every one of them on you'],
        ['Do not let {{t}} decide', 'Follow me to {{p}}, I will get you through'],
      ];
      const BRIDGE_LINES = [
        'And if {{n}} is gone and the road is shut behind you,',
        'I will still be the one who kept the door open,',
        'So tell me honestly what it is you want',
        'Because I am not doing this halfway',
      ];
      const INTRO_LINES = ['One more before the day starts', 'Say it now, before the lights come up'];
      const OUTRO_LINES = ['And that is how {{n}} ended up on the shelf', 'Same as before, same as now, nothing left but myself'];

      function syllables(text) {
        const words = String(text).toLowerCase().replace(/[^a-z']/g, ' ').split(/\s+/).filter(Boolean);
        return words.reduce(function (sum, w) {
          const groups = w.match(/[aeiouy]+/g);
          let c = groups ? groups.length : 1;
          if (w.endsWith('e') && !w.endsWith('le') && c > 1) c -= 1;
          return sum + Math.max(1, c);
        }, 0);
      }

      function fill(template, rhyme) {
        return template.replace(/\{\{(\w+)\}\}/g, function (_, slot) {
          if (slot === 'r') return rhyme;
          if (slot === 'n') return pick(bank.nouns);
          if (slot === 'v') return pick(bank.verbs);
          if (slot === 'p') return pick(bank.places);
          if (slot === 't') return pick(bank.times);
          return slot;
        });
      }

      function endWord(line) {
        const words = String(line).split(/\s+/).filter(Boolean);
        return words.length ? words[words.length - 1].toLowerCase() : '';
      }

      function rhymeKey(word) {
        const clean = String(word).toLowerCase().replace(/[^a-z]/g, '');
        return clean.length >= 2 ? clean.slice(-2) : clean;
      }

      function schemeFor(lines) {
        const map = {};
        const letters = 'ABCDEFGH';
        return lines.map(function (line) {
          const key = rhymeKey(endWord(line));
          if (key.length < 2) return '-';
          if (map[key] === undefined) {
            map[key] = letters[Object.keys(map).length % letters.length];
          }
          return map[key];
        }).join(' ');
      }

      // The chorus is written once and repeated verbatim, which is what a hook is.
      const chorusSetIndex = seed % CHORUS_SETS.length;
      const chorusRhymes = [rhymeWord(0), rhymeWord(1)];
      const chorusLines = [
        fill(CHORUS_SETS[chorusSetIndex][0], chorusRhymes[0]),
        fill(CHORUS_SETS[chorusSetIndex][1], chorusRhymes[1]),
      ];

      const verseCounter = { verse: 0, bridge: 0 };

      // A verse line that has already been used is never reused, so verses do not echo each other.
      const usedLines = {};
      function uniqueLine(make) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const line = make(attempt);
          if (!usedLines[line]) {
            usedLines[line] = true;
            return line;
          }
        }
        const fallback = make(12) + ' ' + (Object.keys(usedLines).length % 2 === 0 ? 'again' : 'still');
        usedLines[fallback] = true;
        return fallback;
      }

      function buildVerse() {
        verseCounter.verse += 1;
        const r = rhymeWord(verseCounter.verse);
        const lines = [
          uniqueLine(function (a) { return fill(VERSE_A[(verseCounter.verse - 1 + a) % VERSE_A.length], r); }),
          uniqueLine(function (a) { return fill(VERSE_B[(verseCounter.verse - 1 + a) % VERSE_B.length], r); }),
        ];
        if (music.linesPerSection >= 4) {
          const r2 = rhymeWord(verseCounter.verse + 2);
          lines.push(uniqueLine(function (a) { return fill(VERSE_A[(verseCounter.verse + a) % VERSE_A.length], r2); }));
          lines.push(uniqueLine(function (a) { return fill(VERSE_B[(verseCounter.verse + a) % VERSE_B.length], r2); }));
        }
        return lines;
      }

      const sections = sectionNames.map(function (name, index) {
        const role = roleOf(name);
        const progression = pick(music.progressions);
        let lines;
        if (role === 'chorus') {
          lines = chorusLines.slice();
        } else if (role === 'bridge') {
          verseCounter.bridge += 1;
          const r = rhymeWord(verseCounter.bridge + 3);
          lines = [
            fill(BRIDGE_LINES[(verseCounter.bridge - 1) % BRIDGE_LINES.length], r),
            fill(BRIDGE_LINES[((verseCounter.bridge - 1) + 1) % BRIDGE_LINES.length], r),
          ];
        } else if (role === 'intro') {
          lines = [fill(INTRO_LINES[0], ''), fill(INTRO_LINES[1], '')];
        } else if (role === 'outro') {
          lines = [fill(OUTRO_LINES[0], ''), fill(OUTRO_LINES[1], '')];
        } else {
          lines = buildVerse();
        }

        return {
          order: index + 1,
          section: name,
          role: role,
          purpose: ROLE_PURPOSE[role],
          chordProgression: progression,
          lines: lines,
          rhymeScheme: schemeFor(lines),
          endWords: lines.map(endWord),
          averageSyllablesPerLine: Math.round((lines.reduce(function (s, l) { return s + syllables(l); }, 0) / lines.length) * 10) / 10,
          transition: index === 0
            ? 'Open cold on the first downbeat, no count-in.'
            : role === 'chorus'
              ? 'Lift the final bar and cut straight into the next section.'
              : 'Two-bar lift into the next section.',
        };
      });

      const fullText = sections.map(function (section) {
        const chordLine = section.chordProgression.map(function (c, i) { return (i === 0 ? '' : '        ') + c; }).join('  ');
        return '[' + section.section.toUpperCase() + ']   ' + chordLine + '\n' + section.lines.join('\n');
      }).join('\n\n');

      const beatSheet = sections.map(function (s) {
        return {
          order: s.order,
          section: s.section,
          role: s.role,
          musicalFocus: s.purpose,
          chordProgression: s.chordProgression.join(' - '),
          lineCount: s.lines.length,
          rhymeScheme: s.rhymeScheme,
        };
      });

      const chordVocabulary = [];
      sections.forEach(function (s) {
        s.chordProgression.forEach(function (c) { if (chordVocabulary.indexOf(c) === -1) chordVocabulary.push(c); });
      });

      const verseSections = sections.filter(function (s) { return s.role === 'verse'; });
      const distinctVerseLines = {};
      verseSections.forEach(function (s) { s.lines.forEach(function (l) { distinctVerseLines[l] = true; }); });
      const totalVerseLines = verseSections.reduce(function (sum, s) { return sum + s.lines.length; }, 0);

      const header = [
        'Theme: ' + theme + '  |  Genre: ' + genre + '  |  Mood: ' + mood + '  |  Structure: ' + structure,
        'Key: ' + music.key + '  |  Meter: ' + music.meter + '  |  Tempo feel: ' + music.tempo,
        'Chord vocabulary: ' + chordVocabulary.join(', '),
      ].join('\n');

      const formattedSong = header + '\n\n--- LYRICS & CHORDS ---\n\n' + fullText + '\n\n--- BEAT SHEET ---\n'
        + beatSheet.map(function (b) { return b.order + '. ' + b.section.toUpperCase() + ' [' + b.role + '] ' + b.chordProgression + ' - ' + b.musicalFocus; }).join('\n');

      const syllableProfile = [];
      sections.forEach(function (s) {
        s.lines.forEach(function (l, i) {
          syllableProfile.push({ section: s.section, line: i + 1, text: l, syllables: syllables(l) });
        });
      });

      const draft = {
        id: 'song_' + Date.now(),
        format: 'song',
        title: topic,
        theme: theme,
        genre: genre,
        mood: mood,
        topic: topic,
        structure: structure,
        key: music.key,
        meter: music.meter,
        tempoFeel: music.tempo,
        sections: sections,
        sectionCount: sections.length,
        verseCount: verseSections.length,
        chorusCount: sections.filter(function (s) { return s.role === 'chorus'; }).length,
        totalVerseLines: totalVerseLines,
        distinctVerseLines: Object.keys(distinctVerseLines).length,
        verseLinesAreDistinct: Object.keys(distinctVerseLines).length >= totalVerseLines,
        lyrics: { sections: sections, fullText: fullText },
        beatSheet: beatSheet,
        chordVocabulary: chordVocabulary,
        syllableProfile: syllableProfile,
        revision: input.existingContent
          ? { basedOn: 'existingContent', changes: ['Kept the supplied direction as the topic and theme', 'Regenerated section-level chord progressions and rhyme-matched lyric lines'] }
          : null,
        source: 'local',
        createdAt: new Date().toISOString(),
      };

      const result = { success: true, data: { draft: draft }, present: [{ id: 'song', title: topic, kind: 'text', body: formattedSong }] };
      if (input.save !== false) {
        const store = ctx.store.load('drafts', []);
        store.push(draft);
        ctx.store.save('drafts', store);
        result.data.storePath = ctx.store.getFilePath('drafts');
      }

      return result;
    }
  });

export const leadSheetDemoDispatcher = withConfirmation(createDeclarativeCodeSkill({
  id: 'songwriting_lead_sheet_demo_dispatcher',
  name: 'Represent Lead Sheet & Demo Asset Dispatcher',
  description: 'Parses final lyrics into sections, aligns the supplied chord symbols to the line they belong on, renders a column-aligned lead sheet, builds demo metadata (key, tempo, duration, section and line counts) or a copyright registration record, stages the artifact locally, and only dispatches to a configured provider after explicit confirmation.',
  persistenceEnvVar: 'SONGWRITING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: SchemaProps.text({ title: 'Draft ID', description: 'Optional source draft identifier', order: 1, hint: 'Links the staged artifact to its source draft' }),
      title: SchemaProps.text({ title: 'Title', description: 'Song title for the lead sheet or registration record', order: 2, default: 'Untitled song', hint: 'Display title for the formatted artifact' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Final lyric text to format', order: 3, hint: 'Complete lyric text. Section labels like [Chorus] are used to lay out the lead sheet' }),
      chords: SchemaProps.stringArray({ title: 'Chords', description: 'Chord symbols applied in order across the lyric lines', order: 4, hint: 'e.g. I, V, vi, IV. Each symbol is aligned to the next lyric line' }),
      format: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Format', description: 'Artifact format to produce', order: 5, default: 'lead-sheet', hint: 'lead-sheet renders chords over lyrics; demo-metadata adds key, tempo and duration; registration requires writers' }),
      key: SchemaProps.text({ title: 'Key', description: 'Song key, used in the lead sheet and demo metadata', order: 6, hint: 'e.g. C major' }),
      tempo: SchemaProps.number({ title: 'Tempo', description: 'Tempo in beats per minute', order: 7, minimum: 20, maximum: 300, hint: 'Recorded on the lead sheet header and demo metadata' }),
      durationSeconds: SchemaProps.number({ title: 'Duration', description: 'Track duration in seconds', order: 8, minimum: 1, hint: 'Rendered as m:ss on the demo metadata' }),
      registration: SchemaProps.object({
        writers: SchemaProps.stringArray({ title: 'Writers', description: 'Songwriter names for registration metadata', order: 1, hint: 'Required when format is registration' }),
        publishers: SchemaProps.stringArray({ title: 'Publishers', description: 'Publisher names for registration metadata', order: 2, hint: 'List of publisher names for registration' }),
        rightsNote: SchemaProps.text({ title: 'Rights Note', description: 'Rights or ownership note for the staged record', order: 3, hint: 'Any rights or ownership clarification for the record' }),
      }, { title: 'Registration', description: 'Copyright or registration metadata', order: 9, hint: 'Include writer/publisher metadata when staging a registration record' }),
      dryRun: SchemaProps.boolean({ title: 'Dry Run', description: 'Stage the artifact without sending it; defaults to true', order: 11, default: true, hint: 'When true, no request leaves the system even if an endpoint is configured' }),
      confirmation: SchemaProps.boolean({ title: 'Confirmation', description: 'Explicit approval for a live dispatch', order: 12, default: false, hint: 'Set to true only when authorizing a live dispatch to the configured endpoint' }),
    },
    required: ['format'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether staging or dispatch completed successfully' },
      status: { type: 'string', description: 'Artifact status: dry-run, staged, live, or error' },
      connected: { type: 'boolean', description: 'Whether a configured endpoint was actually used for dispatch' },
      artifact: { type: 'object', description: 'Formatted lead sheet, demo metadata, or registration artifact' },
      response: { type: ['object', 'null'], description: 'Provider response when a live dispatch is attempted' },
      storePath: { type: 'string', description: 'Category-specific local staging path in SONGWRITING_HOME' },
      message: { type: 'string', description: 'Human-readable staging or dispatch status' },
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
      error: { type: ['string', 'null'], description: 'Dispatch error message when status is error' },
    },
    required: ['success', 'status', 'connected', 'artifact', 'storePath', 'message', 'present'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Format this song as a lead sheet', 'Prepare demo metadata'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Songwriting lead sheet formatting, demo metadata preparation, and asset dispatch',
  isSkill: true,
  manifest: {
    // Declared as a credential, not a plain config field, so the key can come from
    // the vault via `vault:<id>` and is never echoed back into emitted output.
    credentialSource: {
      apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
    },
    configSchema: SONGWRITER_DISPATCH_CONFIG_SCHEMA,
    endpointConfigKey: 'endpointUrl',
    confirmBeforeSend: true
  },
  handler: async function handler(input, ctx) {
      const title = String(input.title || 'Untitled song');
      const lyrics = String(input.lyrics || '');
      const chords = Array.isArray(input.chords) ? input.chords : [];
      const artifactFormat = String(input.format || 'lead-sheet');
      const registration = input.registration || null;
      const tempo = Number(input.tempo || 0);
      const key = String(input.key || '');
      const durationSeconds = Number(input.durationSeconds || 0);

      const SECTION_LABEL = /^\s*[\[(]?\s*(intro|verse|pre|chorus|refrain|hook|bridge|breakdown|drop|outro|interlude|instrumental|tag|coda|post)\b[^\])\n]*[\])]?\s*:?\s*$/i;

      // Split the lyric into sections and attach the supplied chord symbols so a lead sheet shows
      // chords against the line they belong to instead of a bare chord list.
      const sections = [];
      {
      let current = { label: 'Verse 1', lines: [] };
      lyrics.split(/\r?\n/).forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (SECTION_LABEL.test(trimmed)) {
          if (current.lines.length) sections.push(current);
          current = { label: trimmed.replace(/^[\[(]|[:\])]?\s*$/g, '').trim() || trimmed, lines: [] };
          return;
        }
        current.lines.push(trimmed);
      });
      if (current.lines.length) sections.push(current);
      }
      if (!sections.length && lyrics.trim()) {
      sections.push({ label: 'Verse 1', lines: lyrics.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) { return l.trim(); }) });
      }

      let chordCursor = 0;
      const sectionedLyrics = sections.map(function (section) {
      const lines = section.lines.map(function (text) {
        const chord = chords[chordCursor];
        if (chord) chordCursor += 1;
        return { chord: chord || null, text: text };
      });
      return { label: section.label, lines: lines };
      });

      function padColumns(rows) {
      return rows.map(function (row) {
        const width = row.reduce(function (max, cell) { return Math.max(max, cell.length); }, 0);
        return row.map(function (cell) { return cell + ' '.repeat(width - cell.length); }).join('  ');
      });
      }

      function renderLeadSheet() {
      // The renderer prints the block title, so the body starts with the musical detail.
      const out = ['Key: ' + (key || 'not set') + '   Tempo: ' + (tempo ? tempo + ' BPM' : 'not set'), ''];
      sectionedLyrics.forEach(function (section) {
        out.push('[' + section.label.toUpperCase() + ']');
        out.push(padColumns(section.lines.map(function (line) { return [line.chord || '', line.text]; })).join('\n'));
        out.push('');
      });
      return out.join('\n');
      }

      function formatDuration(seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return m + ':' + (s < 10 ? '0' + s : String(s));
      }

      if (artifactFormat === 'registration' && (!registration || !Array.isArray(registration.writers) || !registration.writers.length)) {
        return {
          success: false,
          error: 'A registration record needs at least one songwriter name.',
          present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'A registration record needs at least one songwriter name.' }],
        };
      }

      const leadSheet = renderLeadSheet();
      const wordCount = sectionedLyrics.reduce(function (sum, s) {
      return sum + s.lines.reduce(function (inner, l) { return inner + l.text.split(/\s+/).filter(Boolean).length; }, 0);
      }, 0);

      const artifact = {
      id: 'song_asset_' + Date.now(),
      title: title,
      format: artifactFormat,
      key: key || null,
      tempoBpm: tempo || null,
      duration: durationSeconds ? formatDuration(durationSeconds) : null,
      durationSeconds: durationSeconds || null,
      sectionCount: sectionedLyrics.length,
      lineCount: sectionedLyrics.reduce(function (sum, s) { return sum + s.lines.length; }, 0),
      wordCount: wordCount,
      chords: chords,
      sectionedLyrics: sectionedLyrics,
      lyrics: lyrics,
      leadSheet: artifactFormat === 'lead-sheet' ? leadSheet : null,
      registration: artifactFormat === 'registration' ? registration : null,
      createdAt: new Date().toISOString(),
      };

      const store = ctx.store.load('lead-sheets', []);
      store.push({ ...artifact, status: 'staged' });
      ctx.store.save('lead-sheets', store);

      const endpoint = String(input.endpointUrl || String(ctx.config?.endpointUrl || ''));
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '');
      const dryRun = input.dryRun !== false;
      const confirmed = input.confirmation === true || input.confirmed === true;

      const result = {
      success: true,
      status: dryRun ? 'dry-run' : 'staged',
      connected: false,
      artifact: artifact,
      storePath: ctx.store.getFilePath('lead-sheets'),
      response: null,
      message: '',
      };

      if (shouldDispatch(endpoint, dryRun, confirmed)) {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(artifact) });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { text: text }; }
        result.status = 'live';
        result.connected = true;
        result.response = { status: response.status, data: data };
        result.message = response.ok
          ? 'Artifact dispatched to ' + endpoint + ' after confirmation.'
          : 'Endpoint ' + endpoint + ' returned HTTP ' + response.status + '. The staged artifact remains available locally.';
      } catch (error) {
        result.success = false;
        result.status = 'error';
        result.message = 'Dispatch to ' + endpoint + ' failed. The staged artifact remains available locally.';
        result.error = error && error.message ? error.message : String(error);
      }
      } else if (dryRun) {
      result.message = endpoint
        ? 'Artifact staged and formatted. Set dryRun to false and pass confirmation true to dispatch to ' + endpoint + '.'
        : 'Artifact staged and formatted locally. No asset endpoint is configured, so nothing was sent.';
      } else if (!endpoint) {
      result.message = 'Not connected: no asset endpoint is configured, so nothing was dispatched. The formatted artifact is staged locally.';
      } else {
      result.message = 'Dispatch to ' + endpoint + ' requires explicit confirmation. Re-run with confirmation true to send.';
      }

      // The skill renders its own artifact layout. 'present' is the generic block contract a renderer
      // understands, so no core code needs to know that this skill produces a lead sheet.
      const present = [];
      if (artifactFormat === 'lead-sheet' && leadSheet) {
      present.push({ id: 'lead-sheet', title: 'Lead Sheet - ' + title, kind: 'text', body: leadSheet });
      }
      present.push({ id: 'status', title: 'Dispatch Status', kind: 'text', body: 'Status: ' + result.status + '\nEndpoint: ' + (endpoint || 'not configured') + '\nStored at: ' + ctx.store.getFilePath('lead-sheets') + '\n' + result.message });

      function shouldDispatch(ep, isDryRun, isConfirmed) {
      return Boolean(ep) && !isDryRun && isConfirmed;
      }

      return result;
    }
  }));
