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
    save: SchemaProps.boolean({ title: 'Save', description: 'Persist the generated scene outline', order: 10, default: true, hint: 'Writes to ASSISTANT_HOME/scene-beat-dialogue.json when true' }),
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
  persistenceEnvVar: 'ASSISTANT_HOME',
  inputSchema: SCENE_BEAT_DIALOGUE_INPUT,
  outputSchema: SCENE_BEAT_DIALOGUE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Generate a scene', 'Write dialogue for', 'Outline beats for'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Screenwriting craft, scene structure, dialogue writing, beat sheets',
  isSkill: true,
  manifest: {
    lowerOrderTools: ['scriptwriting-scene-beat-generator'],
    actionLabel: 'Generate scene & beat outline',
  },
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

    let cast = Array.isArray(input.characters) ? input.characters.filter(Boolean).map(function (c) { return String(c).trim().toUpperCase(); }) : [];
    if (!cast.length) {
      cast = genre === 'comedy' ? ['PROTAGONIST', 'SIDEKICK'] : ['PROTAGONIST', 'ANTAGONIST', 'ALLY'];
    }
    const place = setting.trim() || 'Interior';

    const NL = '\n';

    function payload(success, status, data, error, present) {
      return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
    }

    function emitAndExit(success, status, data, error, present) {
      const out = JSON.stringify(payload(success, status, data, error, present));
      process.stdout.write(out + '\n', function () { process.exit(0); });
    }

    const NOT_CONNECTED_BODY = [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Scene and beat generation requires a configured assistant model. Contact your administrator to set brainEndpoint in this Skill\'s configuration and verify model availability.' }];
    const NOT_CONNECTED_ERROR = 'Scene and beat guidance are unavailable; set brainEndpoint in this Skill configuration and ensure the assistant model is reachable';

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

    function delegatedText(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') return cleanDelegatedText(payload);
      if (typeof payload !== 'object') return null;
      if (typeof payload.summary === 'string' && payload.summary.trim()) return cleanDelegatedText(payload.summary);
      if (typeof payload._raw === 'string' && payload._raw.trim()) return cleanDelegatedText(payload._raw);
      return null;
    }

    function cleanDelegatedText(text) {
      if (!text) return null;
      let body = text;
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

    function withDeadline(promise, ms) {
      return new Promise(function (resolve) {
        let done = false;
        const timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
        Promise.resolve(promise).then(
          function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
          function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
        );
      });
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
            systemPrompt: 'You are an expert screenwriter. Return only the finished deliverable.',
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

    function scenesFromPayload(payload) {
      if (!payload || typeof payload !== 'object') return null;
      if (Array.isArray(payload.scenes) && payload.scenes.length > 0) return payload.scenes;
      const text = delegatedText(payload);
      if (!text) return null;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed.scenes) && parsed.scenes.length > 0 ? parsed.scenes : null;
      } catch {
        return null;
      }
    }

    const SKILL_BUDGET_MS = Number(ctx.config?.skillBudgetMs) > 0
      ? Number(ctx.config?.skillBudgetMs)
      : 930000;
    const DELEGATED_TIMEOUT_MS = Number(ctx.config?.delegatedTimeoutMs) > 0
      ? Number(ctx.config?.delegatedTimeoutMs)
      : 24000;

    const work = (async function () {
      const delegatedTo = [];
      const missing = [];
      const brainBacked = [];

      const toolInput = {
        topic: topic,
        logline: logline,
        characters: cast,
        setting: place,
        sceneCount: sceneCount,
        format: format,
        genre: genre,
        audience: audience,
        targetDuration: targetDuration,
      };

      const brainPrompt =
        'Generate a scene-by-scene screenplay outline for: ' + topic
        + (logline ? '. Logline: ' + logline : '')
        + '. Setting: ' + place + '. Cast: ' + cast.join(', ')
        + '. Genre: ' + genre + '. Audience: ' + audience + '. Target runtime: ' + targetDuration + ' minutes. Approximate scene count: ' + sceneCount + '.\n\n'
        + 'Return ONLY a JSON object with this exact shape: { scenes: [ { number, act, storyBeat, purpose, slug, beats: string[], action: string, dialogue: [ { character: string, parenthetical?: string, line: string } ], pacing: string, transition: string } ] }.\n\n'
        + 'Each scene must advance a different story beat; never repeat one template. storyBeat must be one of: opening, inciting, first-turn, rising, midpoint, complication, crisis, climax, resolution. Scenes run in dramatic order (Act 1 -> Act 2 -> Act 3). Include slug lines (INT./EXT. LOCATION - DAY/NIGHT), action description, and dialogue with character cues and optional parentheticals.\n\n'
        + 'Output only that JSON: no preamble, no analysis of the request, no markdown fences, and no closing remarks about your own answer.';

      let scenes = null;
      try {
        const raw = await withDeadline(ctx.delegate('scriptwriting-scene-beat-generator', toolInput), DELEGATED_TIMEOUT_MS);
        const payload = unwrapDelegated(raw);
        scenes = scenesFromPayload(payload);
        if (scenes) delegatedTo.push('scriptwriting-scene-beat-generator');
      } catch (e) {
        scenes = null;
      }

      if (!scenes || !scenes.length) {
        const direct = await callBrain(brainPrompt);
        scenes = scenesFromPayload({ summary: direct });
        if (scenes) brainBacked.push('scene-beat-generator');
      }

      if (!scenes || !scenes.length) {
        return { success: false, status: 'not-connected', data: null, error: NOT_CONNECTED_ERROR, present: NOT_CONNECTED_BODY };
      }

      if (brainBacked.length) {
        missing.push('Generated via direct brain call (' + brainBacked.join(', ') + ').');
      }

      function renderScreenplay(list) {
        return list.map(function (scene) {
          const parts = [scene.slug || '', '', scene.action || '', ''];
          (scene.dialogue || []).forEach(function (d) {
            if (d.parenthetical) {
              parts.push(d.parenthetical);
              parts.push(d.line);
            } else {
              parts.push(d.character || '');
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
        const lines = [];
        lines.push('Topic: ' + topic);
        if (logline) lines.push('Logline: ' + logline);
        lines.push('Setting: ' + place + '   Cast: ' + cast.join(', '));
        lines.push('Scenes: ' + list.length);
        lines.push('');
        list.forEach(function (scene) {
          lines.push('SCENE ' + scene.number + ' - Act ' + scene.act + ' - ' + String(scene.storyBeat || '').toUpperCase() + ' - ' + (scene.pacing || ''));
          lines.push('  ' + (scene.slug || ''));
          lines.push('  Purpose: ' + (scene.purpose || ''));
          lines.push('  Beats:');
          (scene.beats || []).forEach(function (b, i) { lines.push('    ' + (i + 1) + '. ' + b); });
          lines.push('  Dialogue:');
          (scene.dialogue || []).forEach(function (d) {
            lines.push('    ' + (d.character || '') + (d.parenthetical ? ' ' + d.parenthetical : ''));
            lines.push('      ' + d.line);
          });
          lines.push('  ' + (scene.transition || ''));
          lines.push('');
        });
        return lines.join('\n');
      }
      const outlineBody = outlineText(scenes);

      const totalWords = scenes.reduce(function (sum, s) {
        const words = (s.action || '').split(/\s+/).filter(Boolean).length
          + (s.dialogue || []).reduce(function (s2, d) { return s2 + (d.line || '').split(/\s+/).filter(Boolean).length; }, 0);
        return sum + words;
      }, 0);
      const estimatedPages = Math.round((totalWords / 180) * 100) / 100;
      const estimatedRuntime = Math.round(estimatedPages * 8 * 10) / 10;

      const actBreakdown = [1, 2, 3].map(function (act) {
        const inAct = scenes.filter(function (s) { return s.act === act; });
        return {
          act: act,
          sceneNumbers: inAct.map(function (s) { return s.number; }),
          sceneCount: inAct.length,
          pageShare: estimatedPages > 0
            ? Math.round((inAct.reduce(function (sum, s) { return sum + ((s.action || '').length / 180); }, 0) / estimatedPages) * 100)
            : 0,
        };
      }).filter(function (a) { return a.sceneCount > 0; });

      function actBreakdownText(acts) {
        const lines = [];
        lines.push('Act breakdown across ' + scenes.length + ' scenes (~' + estimatedPages + ' pages, ~' + estimatedRuntime + ' min runtime):');
        lines.push('');
        acts.forEach(function (a) {
          lines.push('Act ' + a.act + ': scenes ' + a.sceneNumbers.join(', ') + ' (' + a.sceneCount + ' scenes, ' + a.pageShare + '% of pages)');
        });
        return lines.join('\n');
      }

      const notes = [];
      if (!logline) {
        notes.push('No logline supplied; scenes were generated from the topic alone. Provide a logline for a tighter ' + place + ' through-line.');
      }
      notes.push('Scene count ' + scenes.length + ' covers the nine-beat skeleton; raise sceneCount above 9 for a longer outline.');

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
        delegatedTo: delegatedTo,
        missing: missing,
        generatedAt: new Date().toISOString(),
      };

      if (save) {
        const store = ctx.store.load('scene-beat-dialogue', []);
        store.push(result);
        ctx.store.save('scene-beat-dialogue', store);
        result.storePath = ctx.store.getFilePath('scene-beat-dialogue');
      }

      const present = [];
      present.push({ id: 'screenplay', title: 'Formatted Screenplay', kind: 'text', body: formattedScreenplay || '(No screenplay available.)' });
      present.push({ id: 'scene-outline', title: 'Scene & Beat Outline', kind: 'text', body: outlineBody || '(No outline available.)' });
      present.push({ id: 'act-breakdown', title: 'Act Breakdown', kind: 'text', body: actBreakdownText(actBreakdown) || '(No act breakdown available.)' });

      return { success: true, status: 'ok', data: result, error: null, present: present };
    })();

    let budgetTimer = null;
    const budget = new Promise(function (resolve) {
      budgetTimer = setTimeout(function () { resolve('budget-exhausted'); }, SKILL_BUDGET_MS);
    });

    const outcome = await Promise.race([work, budget]);
    clearTimeout(budgetTimer);

    if (outcome === 'budget-exhausted') {
      emitAndExit(false, 'not-connected', null, 'Scene and beat generation did not complete within the ' + Math.round(SKILL_BUDGET_MS / 1000) + 's deadline of this skill. The assistant model (brain) may still be processing the request; retry, and check the Brain activity log for the matching entries', NOT_CONNECTED_BODY);
    }
    return outcome;
  }
});
SCENE_BEAT_DIALOGUE_COPILOT.configSchema = {};
export { SCENE_BEAT_DIALOGUE_COPILOT };
