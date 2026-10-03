# Songwriter Assistant Documentation (Version 9)

**Assistant ID:** `songwriter`
**Assistant Name:** Songwriting & Musical Composition Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Songwriting & Musical Composition Assistant supports lyricists, composers, and music producers. It analyzes music genre trends, co-creates lyric stanzas and chord progressions, evaluates poetic prosody meter and stress, and generates formatted lead sheets.

---

## 2. Domain Knowledge

The Songwriter Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/music-theory-rules.md`**: Chord voicings, modal scales, functional harmony progressions (Roman numerals), voice leading, and cadence structures.
2. **`knowledge/prosody-stress-metrics.md`**: Meter classifications (iambic, trochaic, anapestic, dactylic), syllable stress scoring, line syncopation, and rhyme schemes (AABB, ABAB, slant rhyme).
3. **`knowledge/song-structure-guides.md`**: Song form templates (Verse-Chorus-Bridge, AABA, Pop/R&B arrangement structures, hook placement rules).

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `songwriter_genre_trend_evaluator`
* **Purpose:** Monitors external music industry trends, chord frequency statistics, and production styles across genres.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Weekly trend scan
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "genre": { "type": "string" },
      "market": { "type": "string" }
    },
    "required": ["genre"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "apiKey": { "type": "string", "description": "Secret music intel feed key" }
    }
  }
  ```
* **Consumes:** External music intel feeds
* **Produces:** Genre trend report, popular chord progression stats, and production soundscapes.

### 3.2 `songwriting_lead_sheet_demo_dispatcher`
* **Purpose:** Generates formatted lead sheets, chord charts, and MusicXML / PDF score sheets for song compositions.
* **Tier:** `aid`
* **Trigger:** **User** — Chart request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "format": { "type": "string", "enum": ["pdf", "musicxml", "chordpro"] },
      "genre": { "type": "string" },
      "mood": { "type": "string" }
    },
    "required": ["format"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Music notation rendering engine
* **Produces:** Formatted lead sheet document and downloadable score file.

### 3.3 `songwriting_musical_lyric_cocreation`
* **Purpose:** Co-creates lyric stanzas, melodic rhythms, and harmonic progressions based on theme and song structure.
* **Tier:** `aid`
* **Trigger:** **User** — Co-creation request
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "theme": { "type": "string" },
      "structure": { "type": "string", "description": "e.g., Verse-Chorus-Verse-Chorus-Bridge-Chorus" },
      "topic": { "type": "string" }
    },
    "required": ["theme"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Music theory knowledge base
* **Produces:** Lyric stanzas, Roman numeral chord progressions, and beat guides.

### 3.4 `songwriting_lyric_prosody_evaluator`
* **Purpose:** Evaluates syllable stress patterns, meter rhythm alignment, and rhyme scheme consistency in lyrics.
* **Tier:** `advise`
* **Trigger:** **User** — Prosody review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "lyrics": { "type": "string" },
      "meter": { "type": "string", "description": "Target meter e.g. iambic tetrameter" },
      "rhyme": { "type": "string", "description": "Target scheme e.g. ABAB" }
    },
    "required": ["lyrics"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Prosody rules
* **Produces:** Meter stress analysis scorecard, syncopation warnings, and lyric re-phrasing suggestions.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Songwriter Assistant relies on higher-order skills with embedded music notation and prosody evaluation rules.)*

---

## 5. Major Data Types & Contracts

### 5.1 Song Sheet Composition Object
```typescript
interface SongSheetComposition {
  title: string;
  composer: string;
  keySignature: string;
  timeSignature: string; // e.g. "4/4"
  tempoBpm: number;
  sections: Array<{
    type: 'intro' | 'verse' | 'pre_chorus' | 'chorus' | 'bridge' | 'outro';
    chords: string[];
    lyrics: Array<{ line: string; stressPattern?: string }>;
  }>;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Absence of native WebAudio / MIDI synthesis limits real-time audio playback within skill outputs.
   - MusicXML parsing relies on external CLI binaries (e.g. LilyPond) rather than pure JavaScript/TypeScript music libraries.

2. **Enhancement Opportunities:**
   - Integrate `tonal` and `tone.js` for client-side MIDI generation and audio preview in the UI.
