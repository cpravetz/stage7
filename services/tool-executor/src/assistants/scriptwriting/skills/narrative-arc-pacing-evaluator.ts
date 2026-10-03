// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const NARRATIVE_ARC_PACING_INPUT = {
  type: 'object',
  properties: {
    script: SchemaProps.textarea({ title: 'Script', description: 'Script text to evaluate for narrative structure and pacing', order: 1, hint: 'Paste the full script; scene headings, character cues and dialogue are parsed' }),
    format: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { title: 'Format', description: 'Script format', order: 2, default: 'script', hint: 'The deliverable format being evaluated' }),
    genre: SchemaProps.text({ title: 'Genre', description: 'Genre (e.g. drama, comedy, thriller, documentary)', order: 3, hint: 'Used in the header and stored with the evaluation' }),
    audience: SchemaProps.text({ title: 'Audience', description: 'Intended audience', order: 4, hint: 'Recorded on the report for review' }),
    targetDuration: SchemaProps.number({ title: 'Target Runtime', description: 'Target runtime in minutes', order: 5, minimum: 1, hint: 'Converts to a page target at 8 minutes per page' }),
    pageTarget: SchemaProps.number({ title: 'Page Target', description: 'Target page count used when no runtime is given', order: 6, minimum: 1, default: 110, hint: 'Standard feature screenplay length' }),
  },
  required: ['script'],
};

const NARRATIVE_ARC_PACING_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the evaluation completed successfully' },
    data: { type: 'object', description: 'Pacing metrics, parsed scene map, structural beat positions, flags, recommendations, and a formatted report' },
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

export const NARRATIVE_ARC_PACING_EVALUATOR = createDeclarativeCodeSkill({
  id: 'scriptwriting-narrative-arc-pacing-evaluator',
  name: 'Narrative Arc & Pacing Evaluator',
  description: 'Parses a script into scenes with page positions, character presence, and dialogue ratios, places the five structural beats (opening, inciting incident, midpoint, climax, resolution) with a stated detection basis, flags pacing and formatting problems, and returns a formatted report with scored recommendations.',
  persistenceEnvVar: 'SCRIPTWRITING_HOME',
  inputSchema: NARRATIVE_ARC_PACING_INPUT,
  outputSchema: NARRATIVE_ARC_PACING_OUTPUT,
  triggers: [
    // User, not Event: the drafted script is the input, and the Skill refuses to
    // run without it, so nothing else can invoke it.
    { kind: 'user', phrase_examples: ['Evaluate the pacing of this script', 'Is this act two too slow', 'Recommend structural rewrites'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Narrative structure, pacing analysis, story theory, genre conventions',
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      const script = String(input.script || '');
      const format = String(input.format || 'script');
      const genre = String(input.genre || 'drama');
      const audience = String(input.audience || 'general');
      const targetDuration = Number(input.targetDuration || 0);
      const pageTarget = String(input.pageTarget || '110');

      if (!script.trim()) {

      }

      const WORDS_PER_PAGE = 180;
      const MINUTES_PER_PAGE = 8;

      // ---- Screenplay element parsing -------------------------------------------------
      const isSlug = function (t) { return /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i.test(t); };
      const isTransition = function (t) { return /(TO:|CUT TO:|BACK TO:)$/.test(t) || /^(FADE (IN|OUT|TO)|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO|WIPE TO|JUMP CUT TO)$/i.test(t); };
      const isAllCaps = function (t) { return t === t.toUpperCase() && /[A-Z]/.test(t); };
      const isParenthetical = function (t) { return /^\(.*\)$/.test(t) && t.length <= 70; };
      const isCharacterCue = function (t) {
        if (t.length > 45) return false;
        if (isTransition(t)) return false;
        if (isAllCaps(t) && /[A-Z]{2,}/.test(t) && !/[.!?]/.test(t)) return true;
        return false;
      };

      const lines = script.split(/\r?\n/);

      function parseScreenplay(text) {
        const raw = text.split(/\r?\n/);
        const scenes = [];
        let current = null;

        function openScene(slug) {
          current = { slug: slug, action: [], dialogue: [], transitions: [], characters: {} };
          scenes.push(current);
          return current;
        }
        function nextNonEmpty(from) {
          for (let k = from; k < raw.length; k++) { if (raw[k].trim()) return { text: raw[k].trim(), index: k }; }
          return null;
        }

        let i = 0;
        while (i < raw.length) {
          const trimmed = raw[i].trim();
          if (!trimmed) { i++; continue; }

          if (isSlug(trimmed)) {
            openScene(trimmed.toUpperCase());
            i++;
            continue;
          }
          if (isTransition(trimmed)) {
            if (!current) openScene('(no scene heading)');
            current.transitions.push(trimmed);
            i++;
            continue;
          }

          const lookAhead = nextNonEmpty(i + 1);
          if (isCharacterCue(trimmed) && lookAhead && !isAllCaps(lookAhead.text) && !isSlug(lookAhead.text) && !isTransition(lookAhead.text)) {
            if (!current) openScene('(no scene heading)');
            const speaker = trimmed.replace(/\((?:V\.?O\.?|O\.?S\.?|C\.?O\.?)\)/gi, '').trim();
            let parenthetical = null;
            let cursor = i + 1;
            if (isParenthetical(raw[cursor] ? raw[cursor].trim() : '')) {
              parenthetical = raw[cursor].trim();
              cursor++;
            }
            const spoken = [];
            while (cursor < raw.length && raw[cursor].trim()) {
              const line = raw[cursor].trim();
              if (isSlug(line) || isTransition(line) || isParenthetical(line)) break;
              spoken.push(line);
              cursor++;
            }
            current.dialogue.push({ character: speaker, parenthetical: parenthetical, lines: spoken, words: spoken.join(' ').split(/\s+/).filter(Boolean).length });
            current.characters[speaker] = (current.characters[speaker] || 0) + spoken.join(' ').split(/\s+/).filter(Boolean).length;
            i = cursor;
            continue;
          }

          if (!current) openScene('(no scene heading)');
          const actionRun = [];
          while (i < raw.length && raw[i].trim()) {
            const line = raw[i].trim();
            if (isSlug(line) || isTransition(line)) break;
            if (isCharacterCue(line) && isParenthetical(raw[i + 1] ? raw[i + 1].trim() : '')) break;
            actionRun.push(line);
            i++;
          }
          current.action.push(actionRun.join(' '));
        }

        if (!scenes.length) openScene('(empty script)');
        return scenes;
      }

      const parsed = parseScreenplay(script);

      let runningPages = 0;
      const scenes = parsed.map(function (scene, index) {
        const actionWords = scene.action.join(' ').split(/\s+/).filter(Boolean).length;
        const dialogueWords = scene.dialogue.reduce(function (sum, d) { return sum + d.words; }, 0);
        const totalWords = actionWords + dialogueWords;
        const pages = Math.max(0.1, Math.round((totalWords / WORDS_PER_PAGE) * 100) / 100);
        const startPage = runningPages;
        runningPages += pages;
        const characterNames = Object.keys(scene.characters);
        return {
          number: index + 1,
          slug: scene.slug,
          timeOfDay: (scene.slug.match(/\b(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER)\b/i) || [])[0] || 'unspecified',
          interiorExterior: (scene.slug.match(/^(INT|EXT|EST|INT\.?\/EXT)/i) || [])[0] || 'unspecified',
          startPage: Math.round(startPage * 100) / 100,
          endPage: Math.round(runningPages * 100) / 100,
          pages: pages,
          minutes: Math.round(pages * MINUTES_PER_PAGE * 10) / 10,
          actionWords: actionWords,
          dialogueWords: dialogueWords,
          dialogueRatio: totalWords > 0 ? Math.round((dialogueWords / totalWords) * 1000) / 1000 : 0,
          exchangeCount: scene.dialogue.length,
          characters: characterNames,
          characterCount: characterNames.length,
          transitions: scene.transitions,
          openingLine: (scene.action[0] || (scene.dialogue[0] ? scene.dialogue[0].character + ': ' + (scene.dialogue[0].lines[0] || '') : '')).slice(0, 120),
        };
      });

      const totalWords = scenes.reduce(function (sum, s) { return sum + s.actionWords + s.dialogueWords; }, 0);
      const totalDialogueWords = scenes.reduce(function (sum, s) { return sum + s.dialogueWords; }, 0);
      const totalPages = Math.round(scenes.reduce(function (sum, s) { return sum + s.pages; }, 0) * 100) / 100;
      const estimatedRuntime = Math.round(totalPages * MINUTES_PER_PAGE * 10) / 10;

      function sceneAtPageFraction(fraction) {
        const target = totalPages * fraction;
        let best = scenes[0];
        let bestDelta = Infinity;
        scenes.forEach(function (s) {
          const delta = Math.abs(s.startPage - target);
          if (delta < bestDelta) { bestDelta = delta; best = s; }
        });
        return best;
      }

      const INCITING_MARKERS = /\b(deadline|arrives|arrived|knock|calls?|found|missing|gone|signed|letter|package|signed for|last chance|final|urgent|emergency|now|hurry|before it|it is over|we have to|you can't|you must)\b/i;
      const DECISIVE_MARKERS = /\b(do it|go through|final|decide|now|end of it|ends here|last chance|cut|stop|fire|kill|shoot|confess|tell her|tell him)\b/i;

      function detectBeat(markers) {
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const haystack = scene.openingLine + ' ' + scene.slug;
          if (markers.test(haystack)) {
            return { scene: scene, basis: 'detected' };
          }
        }
        return null;
      }

      const explicitActMarker = script.split(/\r?\n/).some(function (l) { return /^\s*(ACT|ACT ONE|ACT TWO|ACT THREE|ACT I|ACT II|ACT III)\b/i.test(l.trim()); });

      const detectedInciting = detectBeat(INCITING_MARKERS);
      const incitingScene = detectedInciting ? detectedInciting.scene : scenes[0];
      const midpointScene = sceneAtPageFraction(0.5);
      const climaxDetected = (function () {
        for (let i = scenes.length - 1; i >= 0; i--) {
          const scene = scenes[i];
          if (DECISIVE_MARKERS.test(scene.openingLine + ' ' + scene.slug)) return scene;
        }
        return null;
      })();
      const climaxScene = climaxDetected || scenes[scenes.length - 1];
      const resolutionScene = scenes[scenes.length - 1];

      function beatRef(scene, basis, label) {
        return {
          label: label,
          sceneNumber: scene.number,
          sceneSlug: scene.slug,
          page: scene.startPage,
          basis: basis,
          evidence: scene.openingLine,
        };
      }

      const arc = {
        openingImage: beatRef(scenes[0], 'positional', 'Opening image'),
        incitingIncident: beatRef(incitingScene, detectedInciting ? 'detected' : 'positional', 'Inciting incident'),
        midpoint: beatRef(midpointScene, 'positional', 'Midpoint'),
        climax: beatRef(climaxScene, climaxDetected ? 'detected' : 'positional', 'Climax'),
        resolution: beatRef(resolutionScene, 'positional', 'Resolution'),
        actBreakBasis: explicitActMarker ? 'explicit-act-headings' : 'page-proportion-25-75',
        actBreakNote: explicitActMarker
          ? 'Act breaks were read from explicit ACT headings in the script.'
          : 'No explicit ACT headings were found, so act breaks are inferred from page position (25% and 75% of the running page count).',
      };

      const pageTargetNumber = Number(pageTarget) || 110;
      const targetPages = targetDuration > 0 ? Math.round((targetDuration / MINUTES_PER_PAGE) * 100) / 100 : pageTargetNumber;

      function actFor(scene) {
        if (explicitActMarker) return null;
        const f = totalPages > 0 ? scene.startPage / totalPages : 0;
        if (f < 0.25) return 1;
        if (f < 0.75) return 2;
        return 3;
      }

      const actBreakdown = [1, 2, 3].map(function (act) {
        const inAct = explicitActMarker ? [] : scenes.filter(function (s) { return actFor(s) === act; });
        const pages = Math.round(inAct.reduce(function (sum, s) { return sum + s.pages; }, 0) * 100) / 100;
        return {
          act: act,
          sceneNumbers: inAct.map(function (s) { return s.number; }),
          sceneCount: inAct.length,
          pages: pages,
          pageShare: totalPages > 0 ? Math.round((pages / totalPages) * 100) : 0,
        };
      }).filter(function (a) { return a.sceneCount > 0; });

      const characterTotals = {};
      scenes.forEach(function (s) {
        s.characters.forEach(function (name) {
          if (!characterTotals[name]) characterTotals[name] = { character: name, words: 0, scenes: 0 };
        });
      });
      parsed.forEach(function (scene, index) {
        Object.keys(scene.characters).forEach(function (name) {
          characterTotals[name].words += scene.characters[name];
          characterTotals[name].scenes += 1;
        });
      });
      const characterPresence = Object.keys(characterTotals).map(function (name) {
        const entry = characterTotals[name];
        return {
          character: name,
          words: entry.words,
          scenes: entry.scenes,
          shareOfDialogue: totalDialogueWords > 0 ? Math.round((entry.words / totalDialogueWords) * 1000) / 1000 : 0,
        };
      }).sort(function (a, b) { return b.words - a.words; });

      const pacingFlags = [];
      function flag(severity, code, message, sceneRef) {
        pacingFlags.push({ severity: severity, code: code, message: message, sceneNumber: sceneRef || null });
      }

      scenes.forEach(function (s) {
        if (s.pages > 3) {
          flag('warn', 'long-scene', 'Scene ' + s.number + ' (' + s.slug + ') runs ' + s.pages + ' pages. Scenes past three pages usually lose momentum; consider splitting at a location or time change.', s.number);
        }
        if (s.pages < 0.4 && s.number !== scenes.length) {
          flag('info', 'short-scene', 'Scene ' + s.number + ' (' + s.slug + ') is only ' + s.pages + ' pages. Very short scenes read as beats rather than scenes; make sure it is not a fragment of the neighbouring scene.', s.number);
        }
        if (s.characterCount === 0) {
          flag('warn', 'no-dialogue', 'Scene ' + s.number + ' (' + s.slug + ') has no dialogue. Confirm this is deliberate exposition or atmosphere.', s.number);
        }
        if (s.characterCount === 1 && s.pages > 1.5) {
          flag('info', 'monologue', 'Scene ' + s.number + ' is a single-speaker scene of ' + s.pages + ' pages. Long monologues are hard to sustain on screen.', s.number);
        }
        if (s.interiorExterior === 'unspecified') {
          flag('warn', 'unclear-slug', 'Scene ' + s.number + ' has no INT./EXT. heading, so it will not read as a scene boundary in standard format.', s.number);
        }
      });

      const dialogueRatio = totalWords > 0 ? Math.round((totalDialogueWords / totalWords) * 1000) / 1000 : 0;
      if (dialogueRatio < 0.25) {
        flag('warn', 'exposition-heavy', 'Only ' + Math.round(dialogueRatio * 100) + '% of the words are spoken. Very low dialogue ratios read as narration or treatment rather than script.');
      }
      if (dialogueRatio > 0.85) {
        flag('info', 'dialogue-heavy', 'Only ' + Math.round((1 - dialogueRatio) * 100) + '% of the words are action. The staging is doing almost no work.');
      }
      if (scenes.length < 3) {
        flag('warn', 'too-few-scenes', 'The script resolves into ' + scenes.length + ' scene(s). A three-act structure needs at least three to place act breaks.');
      }
      if (targetPages > 0) {
        const delta = Math.round((totalPages - targetPages) * 10) / 10;
        if (Math.abs(delta) > 2) {
          flag(delta > 0 ? 'warn' : 'info', delta > 0 ? 'over-length' : 'under-length',
            'Script is ' + totalPages + ' pages against a ' + targetPages + '-page target (' + (delta > 0 ? 'over by ' : 'under by ') + Math.abs(delta) + ' pages).');
        }
      }
      if (climaxScene.number === scenes[0].number) {
        flag('warn', 'single-scene-structure', 'Climax and inciting incident both resolve to scene 1; there is no act structure to evaluate.');
      }
      if (midpointScene.number === climaxScene.number) {
        flag('info', 'no-midpoint', 'Midpoint and climax resolve to the same scene (' + midpointScene.number + '); the second half has no turning point of its own.');
      }

      const recommendations = [];
      if (pacingFlags.length === 0) {
        recommendations.push('No structural or pacing problems were detected in this pass: scene boundaries parse cleanly, act positions follow page proportion, and scene lengths sit inside the 0.4-3 page band.');
      }
      pacingFlags.filter(function (f) { return f.severity === 'warn'; }).forEach(function (f) {
        recommendations.push(f.message);
      });
      pacingFlags.filter(function (f) { return f.severity === 'info'; }).slice(0, 4).forEach(function (f) {
        recommendations.push(f.message);
      });
      if (!explicitActMarker) {
        recommendations.push('Beat positions are page-proportion estimates because the script carries no ACT headings. Add ACT ONE/TWO/THREE breaks to make the structure explicit.');
      }
      if (arc.midpoint.basis === 'positional') {
        recommendations.push('The midpoint was placed at 50% of page count rather than detected. Verify it coincides with a reversal in the story.');
      }

      const structureScore = (function () {
        let score = 0;
        const checks = [
          scenes.length >= 3,
          !scenes.some(function (s) { return s.interiorExterior === 'unspecified'; }),
          pacingFlags.filter(function (f) { return f.code === 'long-scene'; }).length === 0,
          pacingFlags.filter(function (f) { return f.code === 'no-dialogue'; }).length <= Math.floor(scenes.length / 3),
          Math.abs(totalPages - targetPages) <= 2,
        ];
        checks.forEach(function (ok) { if (ok) score += 1; });
        return { score: score, max: checks.length, rating: score >= 4 ? 'strong' : score >= 3 ? 'workable' : 'needs-revision' };
      })();

      const pacing = {
        totalScenes: scenes.length,
        totalPages: totalPages,
        targetPages: targetPages,
        estimatedRuntimeMinutes: estimatedRuntime,
        targetDurationMinutes: targetDuration || null,
        wordsPerMinuteOfRuntime: estimatedRuntime > 0 ? Math.round(totalWords / estimatedRuntime) : 0,
        scenesPerTenMinutes: estimatedRuntime > 0 ? Math.round((scenes.length / estimatedRuntime) * 100) / 100 : 0,
        longestScene: scenes.reduce(function (a, b) { return b.pages > a.pages ? b : a; }, scenes[0]),
        shortestScene: scenes.reduce(function (a, b) { return b.pages < a.pages ? b : a; }, scenes[0]),
        dialogueRatio: dialogueRatio,
        actBreakdown: actBreakdown,
      };

      function fmt(n) { return String(n); }

      const reportLines = [];
      reportLines.push('Format: ' + format + '   Genre: ' + genre + '   Audience: ' + audience);
      reportLines.push('');
      reportLines.push('LENGTH');
      reportLines.push('  Scenes: ' + pacing.totalScenes + '   Pages: ' + totalPages + '   Target: ' + targetPages);
      reportLines.push('  Estimated runtime: ' + estimatedRuntime + ' min at ' + MINUTES_PER_PAGE + ' min/page');
      reportLines.push('  Dialogue share: ' + Math.round(dialogueRatio * 100) + '%   Words: ' + totalWords);
      reportLines.push('');
      reportLines.push('STRUCTURE  (' + arc.actBreakBasis + ')');
      reportLines.push('  Opening image     scene ' + arc.openingImage.sceneNumber + '  p.' + arc.openingImage.page + '  ' + arc.openingImage.sceneSlug);
      reportLines.push('  Inciting incident scene ' + arc.incitingIncident.sceneNumber + '  p.' + arc.incitingIncident.page + '  [' + arc.incitingIncident.basis + ']');
      reportLines.push('  Midpoint          scene ' + arc.midpoint.sceneNumber + '  p.' + arc.midpoint.page + '  [' + arc.midpoint.basis + ']');
      reportLines.push('  Climax            scene ' + arc.climax.sceneNumber + '  p.' + arc.climax.page + '  [' + arc.climax.basis + ']');
      reportLines.push('  Resolution        scene ' + arc.resolution.sceneNumber + '  p.' + arc.resolution.page);
      if (actBreakdown.length) {
        reportLines.push('');
        reportLines.push('ACTS');
        actBreakdown.forEach(function (a) {
          reportLines.push('  Act ' + a.act + ': ' + a.sceneCount + ' scene(s), ' + a.pages + ' pages (' + a.pageShare + '% of script), scenes ' + a.sceneNumbers.join(', '));
        });
      }
      reportLines.push('');
      reportLines.push('CHARACTER PRESENCE');
      if (characterPresence.length) {
        characterPresence.forEach(function (c) {
          reportLines.push('  ' + c.character + ': ' + c.words + ' spoken words across ' + c.scenes + ' scene(s), ' + Math.round(c.shareOfDialogue * 100) + '% of all dialogue');
        });
      } else {
        reportLines.push('  No dialogue detected in the script.');
      }
      reportLines.push('');
      reportLines.push('SCENE MAP');
      scenes.forEach(function (s) {
        reportLines.push('  ' + s.number + '. p.' + s.startPage + '-' + s.endPage + '  ' + s.pages + 'pp  ' + s.slug);
        reportLines.push('      ' + s.exchangeCount + ' exchange(s), ' + s.characterCount + ' character(s), ' + s.dialogueWords + ' dialogue words');
      });
      reportLines.push('');
      reportLines.push('FLAGS (' + pacingFlags.length + ')');
      if (pacingFlags.length === 0) {
        reportLines.push('  None.');
      } else {
        pacingFlags.forEach(function (f) {
          reportLines.push('  [' + f.severity.toUpperCase() + '] ' + f.message);
        });
      }
      reportLines.push('');
      reportLines.push('STRUCTURE SCORE: ' + structureScore.score + '/' + structureScore.max + ' (' + structureScore.rating + ')');
      reportLines.push('');
      reportLines.push('RECOMMENDATIONS');
      recommendations.forEach(function (r, i) { reportLines.push('  ' + (i + 1) + '. ' + r); });

      const evaluation = {
        id: 'nap_' + Date.now(),
        format: format,
        genre: genre,
        audience: audience,
        targetDuration: targetDuration || null,
        parseAssumptions: {
          wordsPerPage: WORDS_PER_PAGE,
          minutesPerPage: MINUTES_PER_PAGE,
          actBreaks: arc.actBreakBasis,
          note: arc.actBreakNote,
        },
        pacing: pacing,
        arc: arc,
        scenes: scenes,
        characterPresence: characterPresence,
        pacingFlags: pacingFlags,
        recommendations: recommendations,
        structureScore: structureScore,
        score: structureScore.rating,
        generatedAt: new Date().toISOString(),
      };

      const store = ctx.store.load('narrative-arc-pacing', []);
      store.push(evaluation);
      ctx.store.save('narrative-arc-pacing', store);

      // The skill owns its report layout; 'present' is the generic block contract.
    }
  });
