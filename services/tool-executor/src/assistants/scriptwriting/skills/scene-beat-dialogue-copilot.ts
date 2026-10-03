// @ts-nocheck

import { SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const SCENE_BEAT_DIALOGUE_INPUT = {
  type: 'object',
  properties: {
    topic: SchemaProps.text({ title: 'Topic', description: 'Scene topic or premise', order: 1, hint: 'The premise the scenes must dramatize' }),
    logline: SchemaProps.text({ title: 'Logline', description: 'One-sentence story summary used to steer every scene', order: 2, hint: 'Optional but sharpens the through-line across all scenes' }),
    characters: SchemaProps.stringArray({ title: 'Characters', description: 'Character names that appear in the generated scenes', order: 3, hint: 'e.g. SARAH, MARCUS. Names drive the dialogue cues' }),
    setting: SchemaProps.text({ title: 'Setting', description: 'Primary location used in the scene headings', order: 4, hint: 'e.g. the loading dock, the archive basement' }),
    sceneCount: SchemaProps.number({ title: 'Scene Count', description: 'Number of scenes to outline, from 1 to 20', order: 5, minimum: 1, maximum: 20, hint: 'Defaults to a proportion of the target runtime' }),
    format: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { title: 'Format', description: 'Deliverable format', order: 6, default: 'script', hint: 'Drives the screenplay slug convention' }),
    genre: SchemaProps.text({ title: 'Genre', description: 'Genre (e.g. drama, comedy, thriller, documentary)', order: 7, hint: 'Genre shapes pacing and cast defaults' }),
    audience: SchemaProps.text({ title: 'Audience', description: 'Intended audience', order: 8, hint: 'Recorded on the outline for submission review' }),
    targetDuration: SchemaProps.number({ title: 'Target Runtime', description: 'Target runtime in minutes', order: 9, minimum: 1, default: 5, hint: 'Used to derive scene count and page budget when sceneCount is not set' }),
    save: SchemaProps.boolean({ title: 'Save', description: 'Persist the generated scene outline', order: 10, default: true, hint: 'Writes to SCRIPTWRITING_HOME/scene-beat-dialogue.json when true' }),
  },
  required: ['topic'],
};

const SCENE_BEAT_DIALOGUE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the scene outline was generated' },
    data: { type: 'object', description: 'Scene outline payload' },
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

export const SCENE_BEAT_DIALOGUE_COPILOT = createDeclarativeCodeSkill({
  id: 'scriptwriting-scene-beat-dialogue-copilot',
  name: 'Scene, Beat & Dialogue Copilot',
  description: 'Generates a distinct scene-by-scene outline with story-function beats, screenplay slug lines, action and character dialogue, plus a formatted screenplay and act/page breakdown. Each scene advances a different story beat rather than repeating one template.',
  persistenceEnvVar: 'SCRIPTWRITING_HOME',
  inputSchema: SCENE_BEAT_DIALOGUE_INPUT,
  outputSchema: SCENE_BEAT_DIALOGUE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Generate a scene', 'Write dialogue for', 'Outline beats for'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Screenwriting craft, scene structure, dialogue writing, beat sheets',
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      const topic = String(input.topic || 'Untitled scene').trim();
      const format = String(input.format || 'script');
      const genre = String(input.genre || 'drama').toLowerCase();
      const audience = String(input.audience || 'general');
      const targetDuration = Number(input.targetDuration || 5);
      const logline = String(input.logline || '').trim();
      const setting = String(input.setting || '').trim();
      const save = input.save !== false;

      const requestedScenes = Number(input.sceneCount || 0);
      const sceneCount = requestedScenes > 0
        ? Math.max(1, Math.min(20, Math.floor(requestedScenes)))
        : Math.max(3, Math.min(8, Math.round(targetDuration)));

      const STOPWORDS = ['a','an','the','and','or','but','of','to','in','on','at','for','with','from','by','is','are','was','were','be','been','that','this','it','its','his','her','their','as','about','into','over','after','before','up','down','out','who','what','when','where','how','she','he','they','we','you','i'];
      function keywords(text) {
        const words = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        const kept = words.filter(function (w) { return w.length > 2 && STOPWORDS.indexOf(w) === -1; });
        const seen = {};
        const out = [];
        kept.forEach(function (w) { if (!seen[w]) { seen[w] = true; out.push(w); } });
        return out.length ? out : ['the situation'];
      }
      const subjectWords = keywords(topic);
      const subject = subjectWords[0];
      const object = subjectWords[1] || subject;
      const place = setting.trim() || (subject.charAt(0).toUpperCase() + subject.slice(1) + ' District');

      let cast = Array.isArray(input.characters) ? input.characters.filter(Boolean).map(function (c) { return String(c).trim().toUpperCase(); }) : [];
      if (!cast.length) {
        cast = genre === 'comedy' ? ['PROTAGONIST', 'SIDEKICK'] : ['PROTAGONIST', 'ANTAGONIST', 'ALLY'];
      }
      const lead = cast[0];
      const second = cast[1] || cast[0];
      const third = cast[2] || cast[1] || cast[0];

      const INTERIOR = ['INT.', 'EXT.'];
      const TIMES_OF_DAY = ['DAY', 'NIGHT', 'DAWN', 'DUSK'];

      const STAGE_PLAN = [
        { key: 'opening', act: 1, purpose: 'Establish the world and the protagonist before anything is demanded of them.' },
        { key: 'inciting', act: 1, purpose: 'Force the central problem into the open so the story cannot return to normal.' },
        { key: 'first-turn', act: 1, purpose: 'Commit the protagonist to a course of action with no easy exit.' },
        { key: 'rising', act: 2, purpose: 'Raise the stakes and let the opposition apply genuine pressure.' },
        { key: 'midpoint', act: 2, purpose: 'Reveal the truth that reframes everything the protagonist believed.' },
        { key: 'complication', act: 2, purpose: 'Complicate the plan so the obvious solution stops working.' },
        { key: 'crisis', act: 2, purpose: 'Strip away the last option the protagonist still trusted.' },
        { key: 'climax', act: 3, purpose: 'Force the decisive choice under maximum pressure.' },
        { key: 'resolution', act: 3, purpose: 'Show the new normal and close the question the opening raised.' }
      ];

      const SEQUENCE_BY_COUNT = {
        1: ['inciting'],
        2: ['inciting', 'climax'],
        3: ['opening', 'midpoint', 'resolution'],
        4: ['opening', 'inciting', 'midpoint', 'resolution'],
        5: ['opening', 'inciting', 'rising', 'climax', 'resolution'],
        6: ['opening', 'inciting', 'rising', 'midpoint', 'climax', 'resolution'],
        7: ['opening', 'inciting', 'first-turn', 'rising', 'midpoint', 'climax', 'resolution'],
        8: ['opening', 'inciting', 'first-turn', 'rising', 'midpoint', 'complication', 'climax', 'resolution'],
        9: ['opening', 'inciting', 'first-turn', 'rising', 'midpoint', 'complication', 'crisis', 'climax', 'resolution']
      };

      function stageSequence(count) {
        if (SEQUENCE_BY_COUNT[count]) return SEQUENCE_BY_COUNT[count].slice();
        const full = STAGE_PLAN.map(function (s) { return s.key; });
        if (count > 9) {
          const extra = [];
          while (extra.length + 9 < count) extra.push('rising');
          return full.concat(extra).slice(0, count);
        }
        return full.slice(0, count);
      }

      const BEATS = {
        'opening': [
          'Show ' + lead + ' in the middle of an ordinary ' + place + ' routine, before the problem arrives.',
          'Plant the want: name the one thing ' + lead + ' is still trying to hold on to.',
          'Plant the fear: show what ' + lead + ' cannot afford to lose.'
        ],
        'inciting': [
          'Deliver the disruption that makes the problem impossible to ignore.',
          'Give ' + lead + ' a concrete goal that can be stated in a single sentence.',
          'Close the scene with a decision that cannot be quietly taken back.'
        ],
        'first-turn': [
          'Have ' + lead + ' commit out loud, converting a want into a plan.',
          'Introduce ' + third + ' as the person who supplies the method and the cost.',
          'End on the first sign that the plan depends on something ' + lead + ' cannot verify.'
        ],
        'rising': [
          'Let ' + second + ' apply pressure from a position of real advantage.',
          'Escalate the cost of failure with a concrete deadline or threat.',
          'Award a partial win so the momentum still builds toward the turn.'
        ],
        'midpoint': [
          'Reveal the fact that reframes the ' + subject + ' and everything built on top of it.',
          'Reverse who holds the advantage: ' + lead + ' gains the truth and loses the safety.',
          'Let the new information force a change of plan, not just a change of mood.'
        ],
        'complication': [
          'Break the assumption ' + lead + ' has been operating on since the midpoint.',
          'Force a sacrifice: something wanted must be surrendered to move forward.',
          'Remove the ally as a source of help so the next move lands alone.'
        ],
        'crisis': [
          'Collapse the remaining option and leave ' + lead + ' with the choice or nothing.',
          'Make the cost of the wrong choice personal and immediate.',
          'Hold silence long enough for ' + lead + ' to choose without reassurance.'
        ],
        'climax': [
          'Force the decisive choice with no time left to deliberate.',
          'Put ' + lead + ' and ' + second + ' in direct opposition over the ' + object + '.',
          'Resolve the question the opening scene asked, in the way it costs most.'
        ],
        'resolution': [
          'Show the aftermath in the same ' + place + ', changed by what happened.',
          'Let ' + third + ' mark the new normal in one clean exchange.',
          'Echo the opening want with a different answer.'
        ]
      };

      const ACTION = {
        'opening': lead + ' moves through ' + place + ' on autopilot, running the same motions as always. Nothing about the room is wrong. Nothing about it is right either. ' + third + ' passes without stopping. ' + lead + ' does not look up.',
        'inciting': 'It arrives at ' + place + ' without warning: a ' + subject + ' that should not be here, attached to something that should never have been found. ' + lead + ' reads it twice, then a third time, as if the words might rearrange themselves.',
        'first-turn': lead + ' lays the pieces out on the table and stops pretending this is a problem to be observed. ' + third + ' watches for a long moment, then finally agrees. The agreement costs more than it should.',
        'rising': second + ' is already ahead. Every move ' + lead + ' makes is answered before it is completed, and the ' + object + ' ' + lead + ' needs is quietly counted down by someone else.',
        'midpoint': 'The truth arrives sideways, in a sentence ' + lead + ' was not meant to hear. ' + third + ' knew. ' + third + ' said nothing. Everything ' + lead + ' built on the old version of the ' + subject + ' has to be taken down and rebuilt tonight.',
        'complication': 'The assumption ' + lead + ' has been leaning on turns out to be the load-bearing wall. Remove it and the whole plan goes with it. There is no second plan waiting underneath.',
        'crisis': 'There is one door and it is not an option any more. ' + lead + ' stands in the open with nothing left to spend, and the cost of the next thirty seconds is already counted.',
        'climax': 'No time left to be careful. ' + lead + ' moves on ' + object + ' and forces the decision, and ' + second + ' has no move left that does not cost exactly as much as it saves.',
        'resolution': place + ' again, later. The same room, the same light, a different answer to the same question. ' + third + ' does not congratulate ' + lead + '. They just nod, once, and let it be true.'
      };

      const DIALOGUE = {
        'opening': [
          { who: lead, parenthetical: null, line: 'Same time tomorrow, then.' },
          { who: third, parenthetical: null, line: 'If you are here at all.' },
          { who: lead, parenthetical: '(to nobody in particular)', line: 'I know.' }
        ],
        'inciting': [
          { who: lead, parenthetical: '(reading)', line: 'This is addressed to me.' },
          { who: second, parenthetical: null, line: 'Then it is not addressed to you. It is bait.' },
          { who: lead, parenthetical: null, line: 'It is a ' + subject + '. It has my name on it.' },
          { who: second, parenthetical: '(flatly)', line: 'And you will do what it tells you.' },
          { who: lead, parenthetical: null, line: 'Yes. Without it I have nothing left to do.' }
        ],
        'first-turn': [
          { who: lead, parenthetical: null, line: 'I am going after the ' + object + '.' },
          { who: third, parenthetical: null, line: 'You have no route and no time.' },
          { who: lead, parenthetical: null, line: 'I have one of those two.' },
          { who: third, parenthetical: '(after a beat)', line: 'Then take me with you. You will need someone who can read it.' }
        ],
        'rising': [
          { who: second, parenthetical: null, line: 'You are two days behind and you think that is a plan.' },
          { who: lead, parenthetical: null, line: 'It bought us two days.' },
          { who: second, parenthetical: '(leaning in)', line: 'It bought me two days. You bought a rumour.' },
          { who: lead, parenthetical: null, line: 'The rumour has a name on it.' }
        ],
        'midpoint': [
          { who: third, parenthetical: '(quietly)', line: 'I knew what the ' + subject + ' really was.' },
          { who: lead, parenthetical: null, line: 'You knew. And you let me build on it.' },
          { who: third, parenthetical: null, line: 'I let you need it to be something else.' },
          { who: lead, parenthetical: '(barely)', line: 'So what is it, then. Say it plainly.' },
          { who: third, parenthetical: null, line: 'It is a receipt. And your name is on the line.' }
        ],
        'complication': [
          { who: lead, parenthetical: null, line: 'The route runs through ' + place + '. I do not know anyone there.' },
          { who: third, parenthetical: null, line: 'You do. You just do not know that you do.' },
          { who: lead, parenthetical: null, line: 'That is not the same as help.' },
          { who: third, parenthetical: null, line: 'It is the only kind left.' }
        ],
        'crisis': [
          { who: lead, parenthetical: '(very still)', line: 'There is no version of tonight where both of us walk out.' },
          { who: second, parenthetical: null, line: 'No. But there is one where only you stop trying.' },
          { who: lead, parenthetical: null, line: 'That is not a choice. That is a threat.' },
          { who: second, parenthetical: '(almost kindly)', line: 'It is the last one I am going to give you.' }
        ],
        'climax': [
          { who: lead, parenthetical: null, line: 'It ends here, with me, or it does not end.' },
          { who: second, parenthetical: null, line: 'You do not get to make that call.' },
          { who: lead, parenthetical: '(overlapping)', line: 'Somebody already did. Your ' + object + ' decided it.' },
          { who: second, parenthetical: null, line: 'Then stop talking and finish it.' }
        ],
        'resolution': [
          { who: third, parenthetical: null, line: 'Is it done?' },
          { who: lead, parenthetical: null, line: 'It is done.' },
          { who: third, parenthetical: null, line: 'And are you?' },
          { who: lead, parenthetical: '(after a long pause)', line: 'Ask me again in a year.' }
        ]
      };

      function beatLinesFor(stage) {
        const beats = BEATS[stage.key] || BEATS.opening;
        return beats.slice();
      }

      function dialogueFor(stage) {
        const bank = DIALOGUE[stage.key] || DIALOGUE.opening;
        return bank.map(function (line) {
          return {
            character: String(line.who).toUpperCase(),
            parenthetical: line.parenthetical,
            line: line.line,
          };
        });
      }

      function slugFor(stage, index) {
        const interior = index % 2 === 0;
        const prefix = INTERIOR[index % INTERIOR.length];
        const tod = TIMES_OF_DAY[(index * 3 + stage.act) % TIMES_OF_DAY.length];
        const qualifier = stage.key === 'climax' || stage.key === 'crisis' ? ' - ' + (index % 2 === 0 ? 'CONTINUOUS' : 'LATER') : '';
        return prefix + ' ' + place.toUpperCase() + ' - ' + tod + qualifier;
      }

      function pacingFor(stage) {
        if (stage.key === 'crisis' || stage.key === 'climax') return 'climactic';
        if (genre === 'thriller' || genre === 'horror') return stage.key === 'midpoint' ? 'accelerating' : 'tense';
        if (genre === 'comedy') return stage.key === 'opening' ? 'loose' : 'quick';
        if (genre === 'documentary') return 'observational';
        if (stage.act === 2) return 'building';
        return 'measured';
      }

      const sequence = stageSequence(sceneCount);
      const scenes = sequence.map(function (key, index) {
        const stage = STAGE_PLAN.filter(function (s) { return s.key === key; })[0] || STAGE_PLAN[0];
        const dialogue = dialogueFor(stage);
        const wordCount = ACTION[stage.key].split(/\s+/).length
          + dialogue.reduce(function (sum, d) { return sum + d.line.split(/\s+/).length; }, 0);
        return {
          number: index + 1,
          act: stage.act,
          storyBeat: stage.key,
          purpose: stage.purpose,
          slug: slugFor(stage, index),
          beats: beatLinesFor(stage),
          action: ACTION[stage.key],
          dialogue: dialogue,
          pacing: pacingFor(stage),
          transition: index === sequence.length - 1
            ? 'Cut to black on the final line.'
            : 'Cut on movement to the next scene.',
          wordCount: wordCount,
          estimatedPages: Math.round((wordCount / 180) * 100) / 100,
        };
      });

      function renderScreenplay(list) {
        return list.map(function (scene) {
          const parts = [scene.slug, '', scene.action, ''];
          scene.dialogue.forEach(function (d) {
            if (d.parenthetical) {
              parts.push(d.parenthetical);
              parts.push(d.line);
            } else {
              parts.push(d.character);
              parts.push(d.line);
            }
            parts.push('');
          });
          if (scene.transition) {
            parts.push(scene.transition);
            parts.push('');
          }
          return parts.join('\n');
        }).join('\n');
      }

      const formattedScreenplay = renderScreenplay(scenes);

      function outlineText(list) {
        // The renderer prints the block title, so the body opens with the outline's own details.
        const lines = [];
        lines.push('Topic: ' + topic);
        if (logline) lines.push('Logline: ' + logline);
        lines.push('Setting: ' + place + '   Cast: ' + cast.join(', '));
        lines.push('Scenes: ' + list.length + '   Estimated pages: ' + Math.round((list.reduce(function (s, x) { return s + x.estimatedPages; }, 0)) * 100) / 100);
        lines.push('');
        list.forEach(function (scene) {
          lines.push('SCENE ' + scene.number + ' - Act ' + scene.act + ' - ' + scene.storyBeat.toUpperCase() + ' - ' + scene.pacing);
          lines.push('  ' + scene.slug);
          lines.push('  Purpose: ' + scene.purpose);
          lines.push('  Beats:');
          scene.beats.forEach(function (b, i) { lines.push('    ' + (i + 1) + '. ' + b); });
          lines.push('  Dialogue:');
          scene.dialogue.forEach(function (d) {
            lines.push('    ' + d.character + (d.parenthetical ? ' ' + d.parenthetical : ''));
            lines.push('      ' + d.line);
          });
          lines.push('  ' + scene.transition);
          lines.push('');
        });
        return lines.join('\n');
      }
      const totalWords = scenes.reduce(function (sum, s) { return sum + s.wordCount; }, 0);
      const estimatedPages = Math.round((totalWords / 180) * 100) / 100;
      const estimatedRuntime = Math.round(estimatedPages * 8 * 10) / 10;

      const actBreakdown = [1, 2, 3].map(function (act) {
        const inAct = scenes.filter(function (s) { return s.act === act; });
        return {
          act: act,
          sceneNumbers: inAct.map(function (s) { return s.number; }),
          sceneCount: inAct.length,
          pageShare: estimatedPages > 0
            ? Math.round((inAct.reduce(function (sum, s) { return sum + s.estimatedPages; }, 0) / estimatedPages) * 100)
            : 0,
        };
      }).filter(function (a) { return a.sceneCount > 0; });

      const notes = [];
      if (!logline) {
        notes.push('No logline supplied; scenes were generated from the topic alone. Provide a logline for a tighter ' + place + ' through-line.');
      }
      notes.push('Scene count ' + sceneCount + ' covers the nine-beat skeleton; raise sceneCount above 9 for a longer outline.');

      const result = {
        id: 'sbd_' + Date.now(),
        topic: topic,
        logline: logline,
        format: format,
        genre: genre,
        audience: audience,
        targetDuration: targetDuration,
        setting: place,
        cast: cast,
        sceneCount: scenes.length,
        totalWords: totalWords,
        estimatedPages: estimatedPages,
        estimatedRuntimeMinutes: estimatedRuntime,
        actBreakdown: actBreakdown,
        scenes: scenes,
        notes: notes,
        generatedAt: new Date().toISOString(),
      };

      if (save) {
        const store = ctx.store.load('scene-beat-dialogue', []);
        store.push(result);
        ctx.store.save('scene-beat-dialogue', store);
        result.storePath = ctx.store.getFilePath('scene-beat-dialogue');
      }

      // The skill renders its own screenplay. 'present' is the generic block contract consumed by any
      // renderer, so no core code needs to know that this skill produces a screenplay.
    }
  });
