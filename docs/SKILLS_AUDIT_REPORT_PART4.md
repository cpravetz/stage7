# Skills Audit Report — Part 4: Summary & Next Steps

---

## Remaining Category Tables (Reference: Parts 1-3)

**Marketing (8):** 2 code (plan-campaign, analyze-performance) + 6 external
**Product (8):** 2 code (create-roadmap, write-prd) + 6 external  
**Restaurant (32):** 1 code (manage-inventory) + 31 external (all identical minimal inputSchema)
**Sales (6):** 2 code (score-lead, draft-outreach) + 4 external
**Sports (25):** 1 code (analyze-matchup) + 24 external
**Support (10):** 2 code (resolve-ticket, search-kb) + 8 external

Pattern: same as Parts 1-3 — code skills are stubs (tag C), external are thin wrappers (tag B), all need descriptions (D) and panel fixes (E).

---

## 4. Summary Statistics

| Category | Total | A (Internal OK) | B (Thin Wrapper → Internal) | C (Stub Code) | D (Schema Gaps) | E (Panel Copy) |
|---|---:|---:|---:|---:|---:|---:|
| analytics | 2 | 2 | 0 | 2 | 2 | 2 |
| career | 19 | 14 | 5 | 0 | 17 | 19 |
| content | 9 | 2 | 7 | 2 | 9 | 9 |
| creative | 4 | 0 | 1 | 3 | 4 | 4 |
| cto | 17 | 0 | 15 | 2 | 17 | 17 |
| education | 18 | 0 | 16 | 2 | 18 | 18 |
| event | 8 | 0 | 7 | 1 | 8 | 8 |
| executive | 19 | 0 | 17 | 2 | 19 | 19 |
| finance | 9 | 0 | 7 | 2 | 9 | 9 |
| healthcare | 13 | 0 | 12 | 1 | 13 | 13 |
| hotel | 21 | 0 | 20 | 1 | 21 | 21 |
| hr | 11 | 0 | 9 | 2 | 11 | 11 |
| investment | 8 | 1 | 7 | 1 | 8 | 8 |
| legal | 10 | 0 | 8 | 2 | 10 | 10 |
| marketing | 8 | 0 | 6 | 2 | 8 | 8 |
| product | 8 | 0 | 6 | 2 | 8 | 8 |
| restaurant | 32 | 0 | 31 | 1 | 32 | 32 |
| sales | 6 | 0 | 4 | 2 | 6 | 6 |
| sports | 25 | 0 | 24 | 1 | 25 | 25 |
| support | 10 | 0 | 8 | 2 | 10 | 10 |
| **TOTAL** | **249** | **19** | **211** | **28** | **247** | **249** |

**Key findings:**
- **19 skills (7.6%)** are `type: 'code'` with actual local logic — but **all 19 are stubs (tag C)** writing empty/placeholder output
- **211 skills (84.7%)** are `createExternalActionSkill` thin wrappers (tag B) exposing raw API operations
- **247 skills (99.2%)** have schema gaps (tag D) — missing descriptions, incomplete config/input
- **249 skills (100%)** need panel copy fixes (tag E)

---

## 5. Panel Copy Issues (§2c) — Universal Across All 249 Skills

From `EntityWorkspace.tsx` lines 676-746, every skill panel currently shows:

1. **Raw skill ID/name as heading** (line 677): `<h4>{getToolDisplayName(tool)}</h4>` — shows "scriptwriter-content-planner" not "Content Planner"
2. **"Settings are managed on the Skills tab"** — implied by the gear button (line 682) with no icon-only affordance
3. **"Run" label** (line 714/742): button says "Run" or "Running…" — not outcome-oriented
4. **No helper text** — `getSchemaDescription` returns empty string when schema lacks `description`/`hint` (99% of properties)

**Fix needed per brief:**
- Replace skill ID heading with `name` + outcome-oriented subtitle
- Gear icon only (no "Open Settings" text)
- Remove "Run" label; use outcome verb ("Generate draft", "Analyze", "Create plan")
- Add `description` to every schema property (feeds `getSchemaDescription`)

---

## 6. Proposed Higher-Order Capabilities (Tag B Consolidation Examples)

| Current Thin Wrappers | Proposed Higher-Order Capability |
|---|---|
| `cto-jira`, `cto-datadog`, `cto-github`, `cto-disaster-recovery`, `cto-pagerduty` | **"Investigate & resolve production incident"** — Assistant triages alert (Datadog), checks deployments (GitHub), creates/updates Jira ticket, pages on-call (PagerDuty), runs DR runbook |
| `cto-jira`, `cto-github`, `cto-team-metrics` | **"Triage & manage sprint backlog"** — Assistant pulls Jira issues, enriches with GitHub PR data, computes team velocity, suggests prioritization |
| `scriptwriter-content-planner` (operations: plan/outline/write/revise/structure/generate) | **"Write episodic content"** — Assistant researches topic, develops theme, builds outline, develops characters, writes draft — checks in at outline & tone confirmation |
| `career-resume-optimizer`, `career-resume-analyzer`, `career-resume-formatter` | **"Optimize & format resume for target role"** — Assistant analyzes, optimizes, formats in one flow |
| `hotel-room-assignment`, `hotel-guest-profile`, `hotel-housekeeping-scheduler`, `hotel-task-dispatch` | **"Manage daily hotel operations"** — Assistant coordinates room assignments, guest preferences, housekeeping, task dispatch |
| `restaurant-reservation-system`, `restaurant-table-management`, `restaurant-guest-profile`, `restaurant-floor-management` | **"Manage restaurant floor & reservations"** — Assistant handles bookings, table assignments, guest recognition, floor plan |

---

## 7. Critical Bugs Found

1. **`CAREER_HOME` env var used in wrong categories** — Found in: `cto/architecture-review` (line 46), `cto/tech-stack-recommendation` (line 70), `hotel/manage-reservation` (line 19), `restaurant/manage-inventory` (line 17), `investment/portfolio-analysis` (line 16), `sports/analyze-matchup` (line 16). Each category should use its own env var (e.g., `CTO_HOME`, `HOTEL_HOME`, `RESTAURANT_HOME`).

2. **Indentation/formatting drift in CTO sample** — Line 83 (`createExternalActionSkill({`) vs line 206 (`createExternalActionSkill({`) — different indentation styles, confirming concatenated fragments without review pass.

3. **No LLM/MCP calls in any `type: 'code'` skill** — Verified across all 28 stub skills. They only write JSON to local files.

4. **Event category external skills have NO `configSchema`** — All 7 `createExternalActionSkill` entries in `event/index.ts` omit `configSchema` entirely (lines 30-113). Users cannot configure endpoints/auth.

5. **Restaurant category: 31 skills share identical minimal `inputSchema`** — Only `operation`, `endpointUrl`, `dryRun` with zero descriptions. Each real integration (OpenTable, Resy, SevenRooms, Toast, Square, etc.) needs provider-specific fields.

6. **`scriptwriter-content-planner` has 12 input properties, ALL missing `description`** — Confirmed: `topic`, `title`, `targetDuration`, `audience`, `tone`, `style`, `episode`, `sceneCount`, `content`, `outline`, `campaignId`, `dryRun` — bare `{ "type": "..." }`.

---

## 8. Required Next Steps (Per Brief §3)

1. **Type-system extension** — Add `title`, `label`, `default`, `examples`, `format`, `sensitive`, `order`, `group`, `multiline`, `hint` to schema property type in `types/index.ts` and factory
2. **Audit report** — This document (complete, parts 1-4)
3. **Bulk description fill** — Add `description` to every property in every `configSchema`/`inputSchema` (247 skills)
4. **Schema gap fixes** — Add missing config/input properties per real API specs (tag D)
5. **Stub implementation** — Replace 28 stub `type: 'code'` skills with real logic (code + MCP calls)
6. **Reference pattern** — Implement one B-consolidation (e.g., CTO incident response) as approved pattern
7. **Panel copy pass** — Apply §2c fixes across all 249 skills
8. **Regenerate appendix** — Update `NEXTGEN_MISSING_SKILLS.md` with corrected status

---

## 9. Implementation Notes: Stub Skills & MCP

The 28 stub `type: 'code'` skills fall into three buckets:

| Bucket | Skills | Best Implementation |
|---|---|---|
| **Deterministic transforms** | `career_html_report`, `career-resume-formatter`, `content-seo` (partial), `marketing-seo` (partial), `legal-document-tagging` | Pure code (JS/TS/Python) — no LLM needed |
| **Judgment/analysis** | `architecture-review`, `tech-stack-recommendation`, `scriptwriter-content-planner`, `write-lyrics`, `write-script`, `career_upskill`, `career-followup-advisor`, `executive-leadership-assessment`, `investment-financial-planner` | **MCP tool call** → LLM (e.g., call a `reasoning` or `completion` MCP server) |
| **Hybrid** | `career-resume-optimizer`, `career-resume-analyzer`, `financial-model`, `analyze-investment`, `portfolio-analysis` | Code for structure + MCP for judgment |

**MCP approach example** for `architecture-review`:
```javascript
// In manifest.sourceCode:
const review = await mcp.call('reasoning/analyze', {
  task: 'architecture-review',
  system: input.system,
  requirements: input.requirements,
  framework: 'aws-well-architected' // or TOGAF, etc.
});
// review.concerns, review.recommendations now populated
```

This keeps the skill as `type: 'code'` but delegates cognition to an MCP server (which could be an LLM, a rules engine, or a specialized model). The factory already supports this via `__resolveAuth` and `fetch` — just needs an MCP client helper.
