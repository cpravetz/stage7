import { Tool } from '../../../types';

const now = () => new Date();

// Copied from career-lower-order-tools.ts so the model's reasoning trace never reaches the user.
const DELIVERABLE_ONLY_SYSTEM_PROMPT = [
  'You are an expert career coach.',
  'Reply with the finished deliverable only.',
  'Never include your reasoning, chain of thought, planning notes, scratch work, or self-critique in the reply.',
  'Do not narrate what you are about to do or how you decided to do it.',
  'Write directly to the candidate in plain prose, with no meta-commentary about the response itself.',
].join(' ');

export const SONGWRITING_LYRIC_CO_CREATION: Tool = {
  id: 'songwriting-lyric-co-creation',
  domainKnowledge:
    'Songwriting co-creation: theme-driven lyric drafting, genre-aware chord progressions, song structure, rhyme and meter, and formatted lead-sheet-style drafts.',
  tier: 'aid',
  schemaVersion: 1,
  name: 'Songwriting Lyric Co-Creation',
  description:
    'Generatively compose a structured song draft with lyrics, chords, beat sheet, and syllable profile from a songwriting brief.',
  type: 'reasoning',
  manifest: {},
  reasoningConfig: {
    systemPrompt: DELIVERABLE_ONLY_SYSTEM_PROMPT,
    promptTemplate: `You are an expert songwriter and lyricist. Create a complete, original song draft for this request:
{{input}}

Return a single JSON object (no markdown fences, no commentary) with exactly this shape:
{
  "title": "string",
  "theme": "string",
  "genre": "string",
  "mood": "string",
  "structure": "string",
  "key": "string",
  "meter": "string",
  "tempoFeel": "string",
  "sections": [
    {
      "order": 1,
      "section": "string",
      "role": "verse|chorus|bridge|intro|outro|pre-chorus|other",
      "purpose": "string",
      "chordProgression": ["string"],
      "lines": ["string"],
      "rhymeScheme": "string",
      "endWords": ["string"],
      "averageSyllablesPerLine": 0,
      "transition": "string"
    }
  ],
  "beatSheet": [
    {
      "order": 1,
      "section": "string",
      "role": "string",
      "musicalFocus": "string",
      "chordProgression": "string",
      "lineCount": 0,
      "rhymeScheme": "string"
    }
  ],
  "chordVocabulary": ["string"],
  "syllableProfile": [
    {
      "section": "string",
      "line": 1,
      "text": "string",
      "syllables": 0
    }
  ],
  "lyrics": {
    "fullText": "string"
  }
}

Requirements:
- Honor the requested theme, genre, mood, structure, sectionCount, topic, and any existingContent/revision direction.
- Produce musically coherent chords per section and consistent rhyme/meter.
- Repeat the chorus lyrics verbatim when the structure repeats choruses.
- Compute rhymeScheme and endWords from the actual lines. Compute averageSyllablesPerLine and syllableProfile accurately.
- lyrics.fullText must contain the full formatted lyrics with section headers (e.g. [VERSE 1]) and chord cues.
- Output ONLY the JSON object.`,
    maxTokens: 4096,
    temperature: 0.7,
    optimizeFor: 'creativity',
    outputFormat: 'json',
  },
  inputSchema: {
    type: 'object',
    properties: {
      theme: { type: 'string' },
      topic: { type: 'string' },
      genre: { type: 'string' },
      mood: { type: 'string' },
      structure: { type: 'string' },
      sectionCount: { type: 'number' },
      seed: { type: 'integer' },
      existingContent: { type: 'string', multiline: true },
    },
  },
  outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
  createdAt: now(),
  updatedAt: now(),
  isSkill: false,
};
