# Scriptwriter Assistant Documentation (Version 9)

**Assistant ID:** `scriptwriter`
**Assistant Name:** Screenwriting & Narrative Development Assistant
**Specification Version:** Version 9 (ADK Architecture Standard)

---

## 1. Overview & Purpose

The Screenwriting & Narrative Development Assistant supports screenwriters, playwrights, and narrative designers. It evaluates screenplay genre trends, crafts scene beats and subtext dialogue, analyzes narrative arc pacing, and formats Fountain/Final Draft screenplays.

---

## 2. Domain Knowledge

The Scriptwriter Assistant loads static domain knowledge from its `knowledge/` directory:

1. **`knowledge/fountain-format-spec.md`**: Fountain syntax specification, scene headings, character cues, parentheticals, transitions, dual dialogue syntax, and page-count formulas.
2. **`knowledge/narrative-arc-frameworks.md`**: Three-act structure, Hero's Journey, Save the Cat beat sheets, incident triggers, midpoint shifts, and climax pacing.
3. **`knowledge/dialogue-subtext-rules.md`**: Subtext vs. exposition guidelines, character voice distinctiveness, dialogue economy, and conflict dynamics.

---

## 3. Higher-Order Skills (`isSkill: true`)

### 3.1 `scriptwriting-genre-market-evaluator-user`
* **Purpose:** Evaluates screenplay market readiness, commercial genre fit, and target audience positioning upon user request.
* **Tier:** `advise`
* **Trigger:** **User** — Market fit review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "genre": { "type": "string" },
      "scriptText": { "type": "string" },
      "targetFormat": { "type": "string", "enum": ["feature", "tv_pilot", "short"] }
    },
    "required": ["genre", "scriptText"]
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "endpointUrl": { "type": "string" },
      "apiKey": { "type": "string", "description": "Secret film intel feed key" }
    }
  }
  ```
* **Consumes:** External film intel APIs
* **Produces:** Commercial genre readiness score, audience appeal analysis, and market comparison.

### 3.2 `scriptwriting-market-report-scheduled`
* **Purpose:** Generates periodic genre market demand reports across target script categories.
* **Tier:** `advise`
* **Trigger:** **Schedule** — Monthly report
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "runReason": { "type": "string" }
    }
  }
  ```
* **Config Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "genres": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["genres"]
  }
  ```
* **Consumes:** Local project store
* **Produces:** Industry market demand trends and script category analysis.

### 3.3 `scriptwriting-scene-beat-dialogue-copilot`
* **Purpose:** Outlines scene beats, crafts character subtext dialogue, and writes Fountain-formatted script pages.
* **Tier:** `aid`
* **Trigger:** **User** — Scene drafting
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "sceneData": { "type": "object", "description": "Location, time, goal, obstacle, outcome" },
      "characters": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["sceneData", "characters"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Screenwriting knowledge base
* **Produces:** Scene beat outline and Fountain-formatted script dialogue draft.

### 3.4 `scriptwriting-narrative-arc-pacing-evaluator`
* **Purpose:** Analyzes narrative pacing, scene tension curves, and structural act proportions across script drafts.
* **Tier:** `advise`
* **Trigger:** **User** — Pacing review
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "scriptText": { "type": "string" },
      "structure": { "type": "string", "description": "Target framework e.g. Three-Act, 8-Sequence" }
    },
    "required": ["scriptText"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Narrative rules
* **Produces:** Act pacing scorecard, tension graph points, and structural rewrite advice.

### 3.5 `scriptwriting-script-formatting-submission-manager`
* **Purpose:** Validates Fountain syntax and exports/dispatches industry-standard Final Draft (FDX) or PDF submission packages.
* **Tier:** `represent` (Requires mandatory `confirmBeforeSend` gate)
* **Trigger:** **Event** — Script finalized
* **Inputs Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "content": { "type": "string", "description": "Fountain script text" },
      "submissionTarget": { "type": "string" }
    },
    "required": ["content"]
  }
  ```
* **Config Schema:** `{}`
* **Consumes:** Script formatting tools
* **Produces:** Formatted script file package and submission dispatch record.

---

## 4. Assistant Scoped Tools (`isSkill: false`)

*(Note: Scriptwriter Assistant relies on higher-order skills using embedded Fountain parser and narrative rules.)*

---

## 5. Major Data Types & Contracts

### 5.1 Screenplay Scene Schema
```typescript
interface ScreenplayScene {
  sceneNumber: number;
  slugline: { location: string; timeOfDay: 'DAY' | 'NIGHT' | 'DUSK' | 'DAWN'; setting: 'INT' | 'EXT' };
  actionLines: string[];
  dialogueBlocks: Array<{
    character: string;
    parenthetical?: string;
    text: string;
  }>;
  pageLengthEstimate: number;
}
```

---

## 6. Design & Implementation Observations

1. **Issues Identified:**
   - Script parsing relies on regex-based Fountain parsing; complex dual dialogue and nested parentheticals require AST-based Fountain parsers.
   - Page count estimation is hardcoded to line counts rather than standard 55-line screenplay PDF layout math.

2. **Enhancement Opportunities:**
   - Integrate `fountain-js` AST parser for exact syntax validation and FDX file generation.
