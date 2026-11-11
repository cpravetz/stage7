import { Tool } from '../../../types';

const now = () => new Date();

// Both reasoning Tools below feed their `summary` straight into a user-facing
// presentation card, so the model must return only the finished deliverable.
// Without this the raw reasoning trace leaked into the card: a mock-interview
// session opened with the model's "Thinking Process", and its closing lines were
// self-checks about hallucination rather than advice for the candidate.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const SCRIPTWRITING_SCENE_BEAT_GENERATOR: Tool = {
  id: 'scriptwriting-scene-beat-generator',
  domainKnowledge: 'Screenwriting craft: scene structure, story beats, slug lines, action, dialogue, pacing and transitions.',
  tier: 'aid',
  schemaVersion: 1,
  name: 'Scriptwriting Scene & Beat Generator',
  description: 'Generate a scene-by-scene screenplay outline with story-function beats, slug lines, action, character dialogue, pacing and transitions as JSON.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    outputFormat: 'json',
    maxTokens: 4096,
    temperature: 0.7,
    optimizeFor: 'creativity',
    promptTemplate:
      'You are an expert screenwriter. Write a scene-by-scene outline for this request: {{input}}.\n\n'
      + 'Return ONLY a JSON object with this exact shape: { scenes: [ { number, act, storyBeat, purpose, slug, beats: string[], action: string, dialogue: [ { character: string, parenthetical?: string, line: string } ], pacing: string, transition: string } ] }.\n\n'
      + 'Each scene must advance a different story beat; never repeat one template. storyBeat must be one of: opening, inciting, first-turn, rising, midpoint, complication, crisis, climax, resolution. Scenes run in dramatic order (Act 1 -> Act 2 -> Act 3). Include slug lines (INT./EXT. LOCATION - DAY/NIGHT), action description, and dialogue with character cues and optional parentheticals.\n\n'
      + 'Output only that JSON: no preamble, no analysis of the request, no markdown fences, and no closing remarks about your own answer.',
  },
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Scene topic or premise the scenes must dramatize' },
      logline: { type: 'string', description: 'One-sentence story summary used to steer every scene' },
      characters: { type: 'array', items: { type: 'string' }, description: 'Character names that appear in the generated scenes' },
      setting: { type: 'string', description: 'Primary location used in the scene headings' },
      sceneCount: { type: 'number', description: 'Number of scenes to outline, from 1 to 20', minimum: 1, maximum: 20 },
      format: { type: 'string', description: 'Deliverable format (script, film, video, podcast, presentation)' },
      genre: { type: 'string', description: 'Genre (e.g. drama, comedy, thriller, documentary)' },
      audience: { type: 'string', description: 'Intended audience' },
      targetDuration: { type: 'number', description: 'Target runtime in minutes' },
    },
    required: ['topic'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            act: { type: 'number' },
            storyBeat: { type: 'string' },
            purpose: { type: 'string' },
            slug: { type: 'string' },
            beats: { type: 'array', items: { type: 'string' } },
            action: { type: 'string' },
            dialogue: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  character: { type: 'string' },
                  parenthetical: { type: 'string' },
                  line: { type: 'string' },
                },
                required: ['character', 'line'],
              },
            },
            pacing: { type: 'string' },
            transition: { type: 'string' },
          },
          required: ['number', 'act', 'storyBeat', 'purpose', 'slug', 'beats', 'action', 'dialogue', 'pacing', 'transition'],
        },
      },
    },
    required: ['scenes'],
  },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
