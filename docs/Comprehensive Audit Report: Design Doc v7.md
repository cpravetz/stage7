# Comprehensive Audit Report: Design Document vs Implementation

This report compares every skill in the design document (`assistants_design_0922_v7.md`) against the actual implementation in the codebase. For each assistant, I report missing skills and any differences in titles, inputSchemas, outputSchemas, configSchemas, tiers, triggers, and descriptions.

**Status: remediation pass applied.** The previous revision of this report listed tiers, triggers, and §0.9 violations as missing across most assistants. Those fields are now present in the implementation. This revision records the post-remediation state, verified by loading the live skill registry and dumping every skill's `id` / `isSkill` / `tier` / `triggers` / `confirmBeforeSend` / `domainKnowledge` rather than by reading source. Rows that are still wrong say so.

**Verification method.** The tables below were generated from `assistantRegistries` and the per-assistant skill arrays via `ts-node`, not from grepping source files. Where the report and the code disagree, the code is authoritative and the disagreement is recorded.

**Test status at time of writing:** `npx jest` in `services/tool-executor` reports **4 failing suites / 9 failing tests** (2025 passing). These failures are *caused by the remediation itself* and are detailed in [Regressions introduced](#regressions-introduced-by-this-remediation). They are not pre-existing.

---

## Open questions from the design review

1 - What does "Represent Lead Sheet & Demo Asset Dispatcher" mean?  Can you drop the jargon?  And why does this Skill have an ID field the user is expected to fill?

2- "Aid Musical & Lyric Co-Creation Engine" created a song that has nothing to do with the parameters provided by the user. See: This is the year the Bills win it all
Theme: Sports Fan Song  |  Genre: pop  |  Mood: proud and hopeful  |  Structure: verse-chorus
Key: C major  |  Meter: 4/4  |  Tempo feel: mid-tempo
Chord vocabulary: vi, IV, I, V, iii

--- LYRICS & CHORDS ---

[VERSE 1]   vi          IV          I          V
I let go by the open window till the small hours went quiet
You said the heart would hold, and I believed you then
I told myself the promise would hold this time
I came back until the front steps gave up and I did too

[CHORUS]   I          V          vi          IV
Take me back to the front steps
I am still your night, coming home

[VERSE 2]   vi          IV          I          V
I kept the silence where you could see it from the street
I held on until the long way round gave up and I did too
I kept the heart where you could see it from the street
I am still out here, out of reach of the front steps

[CHORUS]   I          iii          IV          V
Take me back to the front steps
I am still your night, coming home

[BRIDGE]   I          V          vi          IV
And if the kitchen light is gone and the road is shut behind you,
I will still be the one who kept the door open,

[CHORUS]   I          iii          IV          V
Take me back to the front steps
I am still your night, coming home

--- BEAT SHEET ---
1. VERSE 1 [verse] vi - IV - I - V - Narration. Moves the story forward and earns the emotional turn the chorus
pays off.
2. CHORUS [chorus] I - V - vi - IV - The hook. States the central promise in the most repeatable form in the song; every chorus sings these exact words.
3. VERSE 2 [verse] vi - IV - I - V - Narration. Moves the story forward and earns the emotional turn the chorus pays off.
4. CHORUS [chorus] I - iii - IV - V - The hook. States the central promise in the most repeatable form in the song; every chorus sings these exact words.
5. BRIDGE [bridge] I - V - vi - IV - Contrast. Changes angle or texture so the return to the chorus lands as a release.
6. CHORUS [chorus] I - iii - IV - V - The hook. States the central promise in the most repeatable form in the song; every chorus sings these exact words.

3 - The Skill "Restaurant Menu Engineering & Cost Strategist" asks the user for some inputs with no entry control - no way to provide the input:Popularity
Popularity scores by item id (0-100)
Profitability
Profitability ratios by item id (0-1)
Ingredient Costs
Ingredient costs by name
Categories
Category assignments by item id
Quantities
Ingredient quantities by name

4- The "Leadership Advisory" Skill asks for an executive ID.  What other inputSchemas expect a user to enter an ID field?  What happened to select controls for referenced records?  And why does this skill have so many inputs? Why is this a Question and Response type skill?  Why ask for inputs no one needs?

5- Same with the other Executive Skills - too many inputs.

6- The Product manager Assistant has too many inputs for "Write PRD"  It seems the Skills are being developed as low-intelligence high-mechanical code.

7- Sales Advisor Lead & Deal Advisory skill has the same problem too much is put on the user to determine

---

## 1. CTO Assistant

**Design:** 6 skills | **Implementation:** 6 canonical skills + 4 base tools (`isSkill=false`)

| Skill ID | Design Title | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|--------------|---------------|-------------|------------------|----------------|--------|
| `cto-architecture-tech-debt-evaluator` | Architecture & Tech Debt Evaluator | Advise | Advise | Schedule | **Schedule** | **MATCH** |
| `cto-cloud-spend-infrastructure-optimizer` | Cloud Spend & Infrastructure Optimizer | Advise | Advise | Schedule | **Schedule** | **MATCH** |
| `cto-incident-war-room-synthesizer` | Incident War Room Synthesizer | Advise | Aid | Event | **Event** | Trigger **FIXED**; tier still differs (design Advise, impl Aid) |
| `cto-engineering-action-iac-drift-remediation` | Engineering Action & IaC Drift Remediation | Represent | Represent | Event | **Event** | **MATCH** — `confirmBeforeSend=true` |
| `cto-team-delivery-health-evaluator` | Team Delivery Health Evaluator | Advise | Advise | Schedule | **Schedule** | **FIXED** — now in `ctoSkills` and exported; trigger + tier set |
| `cto-disaster-recovery-planner` | Disaster Recovery Planner | Advise | Advise | Schedule | **Schedule** | **FIXED** — now in `ctoSkills` and exported; trigger + tier set |

**Fixed:** All four previously-mismatched triggers now read Schedule/Event as the design specifies. The two "missing from index.ts export" skills (`cto-team-delivery-health-evaluator`, `cto-disaster-recovery-planner`) are now members of `ctoSkills` and picked up by `ctoCanonicalSkills`. All 6 canonical skills carry `tier` and `domainKnowledge`.

**Base tools (`isSkill=false`, all with `tier` + `domainKnowledge`):** `cto-infrastructure-query` (advise), `cto-engineering-actions` (represent, `confirmBeforeSend`), `cto-incident-disaster-readiness` (aid), `cto-architecture-advisory` (advise).

**ConfigSchema:** `cto-engineering-action-iac-drift-remediation` correctly declares `endpointUrl` + `token` as required config — legitimate per §0.6.

**Remaining:** `cto-incident-war-room-synthesizer` is `aid` in code but `Advise` in design. Design flags its tier as *inferred*, so this may be the design being wrong rather than the code; worth a decision either way.

---

## 2. Career Assistant

**Design:** 10 skills | **Implementation:** 10 canonical skills + 10 base tools (`isSkill=false`)

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `career-job-market-positioning-evaluator` | Advise | Advise | Schedule | Schedule | **MATCH** |
| `career-interview-compensation-battlecard-creator` | Aid | Aid | Event (interview scheduled) | **User** | Tier **FIXED**; trigger differs |
| `career-governed-application-outreach-manager` | Represent | Represent | User | User | **MATCH** — `confirmBeforeSend=true` |
| `career-job-discovery-fit-ranking` | Advise | Advise | Schedule | **User** | Tier **FIXED**; trigger differs |
| `career-application-execution-orchestrator` | Represent | Represent | User | User | **MATCH** — `confirmBeforeSend=true` |
| `career-upskill-role-targeted-learning-planner` | Advise | Advise | Event (gap surfaced) | **User** | Tier **FIXED**; trigger differs |
| `career-interview-practice-mock-interviewer` | Aid | Aid | User | User | **MATCH** |
| `career-pipeline-outcome-tracker` | Aid | Aid | Event (status change) | **User** | Tier **FIXED**; trigger differs |
| `career-resume-template-manager` | Aid | Aid | User | User | **MATCH** (marked EXTRA in design) |
| `career-portal-recruiter-workflow` | Represent | Represent | Event (recruiter msg) | **User** | Tier **FIXED**; `confirmBeforeSend=true`; trigger differs |

**Fixed:** All 10 canonical skills now carry `tier` and `domainKnowledge` (previously neither existed). All 3 Represent-tier skills carry `confirmBeforeSend=true`. Every canonical skill has exactly one trigger.

**Remaining:** 5 skills resolve to `User` where design specifies `Event` (battlecard, upskill planner, pipeline tracker, portal recruiter workflow) or `Schedule` (job discovery fit ranking). This is defensible — these are user-initiated actions, and §0.14 defines User as "a person has to ask for it" — but it is a divergence from the design and should be ratified rather than left implicit.

**Base tools (10, `isSkill=false`):** all still have no `tier`. Base tools are not user-facing skills per §0.3, so this is consistent with the design, but they are the only remaining entries in the codebase with no tier.

---

## 3. Executive Assistant

**Design:** 6 skills (2 were missing) | **Implementation:** 6 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `executive-leadership-advisory` | Advise | Advise | User | User | **MATCH** |
| `executive-dev-career` | Advise | Advise | Schedule | **User** | Trigger differs |
| `executive-feedback` | Advise | Advise | Event | **User** | Trigger differs |
| `executive-risk-scenario` | Advise | Advise | User | User | **MATCH** |
| `executive-speech-communication-copilot` | — | Aid | (was MISSING) | User | **IMPLEMENTED** — new skill |
| `executive-time-strategic-focus-proxy` | — | Represent | (was MISSING) | User + Event | **IMPLEMENTED** — new skill |

**Fixed — the two missing skills now exist:**
- `executive-speech-communication-copilot` (`executive-speech-communication-copilot.ts`) — tier `aid`, User trigger, `domainKnowledge` set. Wired into `executiveSkills` and the `recommendation` workflow stage.
- `executive-time-strategic-focus-proxy` (`executive-time-strategic-focus-proxy.ts`) — tier `represent`, `confirmBeforeSend=true`, `domainKnowledge` set. Wired into `executiveSkills` and the `recommendation` stage.

All 6 executive skills now carry `tier`, `triggers`, and `domainKnowledge`. All were previously missing `tier` on triggers.

**Remaining:** the 2 new skills have no design tier to check against — they were listed as "missing entirely, not yet in code" with no tier assigned. `executive-time-strategic-focus-proxy` carries two triggers (User + Event), which §0.14 says should be exactly one. Input-schema bloat flagged in questions 4 and 5 is **not** resolved: `executive-leadership-advisory`, `executive-dev-career`, `executive-feedback`, and `executive-risk-scenario` all still require a `focusArea` field and remain Question/Response-shaped.

---

## 4. Legal Assistant

**Design:** 4 skills | **Implementation:** 4 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `contract-document-advisory` | Advise | Advise | Event (doc received) | Event | **MATCH** |
| `legal-research` | Advise | **Aid** | User | User | Trigger **FIXED**; tier differs |
| `matter-document-ops` | Aid | **Represent** | User | User | Tier differs; `confirmBeforeSend=true` |
| `compliance-tracking` | Advise | Advise | Schedule | Schedule | **MATCH** |

**Fixed:** All 4 skills now have `tier` and `triggers`, set inside the factory call in each file. `matter-document-ops` no longer exposes a required `operation` enum — the §0.9 violation is resolved. Its inputs are now `caseId` / `caseData` / `documentId` / `dateRange`, with nothing required.

**Remaining:** two tier divergences from design (`legal-research` Advise→Aid, `matter-document-ops` Aid→Represent). Design marks all four tiers *inferred*, so these are judgement calls rather than confirmed errors, but they should be ratified. `matter-document-ops` at `represent` now correctly carries `confirmBeforeSend`.

---

## 5. Sales Assistant

**Design:** 3 skills | **Implementation:** 3 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `lead-deal-advisory` | Advise | Advise | Schedule | **User** | Tier **FIXED**; trigger differs |
| `outreach-drafting` | Aid | Aid | User | User | **MATCH** |
| `pipeline-ops` | Aid | **Represent** | Event | **User** | Tier differs; `confirmBeforeSend=true`; trigger differs |

**Fixed:** All 3 skills now have `tier` and `triggers` (previously neither existed).

**Remaining:** `pipeline-ops` is `represent` in code vs `aid` in design. Input-schema bloat flagged in question 7 is not resolved — all three remain thin Q/R wrappers.

---

## 6. Event Assistant

**Design:** 3 skills | **Implementation:** 3 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `event-planning-budgeting` | Advise | Advise | User | User | **MATCH** |
| `event-vendor-contract-management` | Represent | **Aid** | Event | Event | Trigger **FIXED**; tier differs |
| `event-day-of-operations` | Represent | **Aid** | Event | Event | Trigger **FIXED**; §0.9 violation resolved; tier differs |

**Fixed:** all 3 skills have `tier` and `triggers`. The §0.9 violation on `event-day-of-operations` is **resolved** — no `operation` field remains in the input schema. All 3 now carry `confirmBeforeSend=true`, and `domainKnowledge` is set on all 3.

**Remaining:** both Represent-design skills are `aid` in code, yet both still carry `confirmBeforeSend=true` — an `aid` skill gating on confirmation is internally inconsistent. Worth resolving in whichever direction is intended.

---

## 7. Restaurant Assistant

**Design:** 5 skills | **Implementation:** 5 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `restaurant-menu-engineering-cost-strategist` | Advise | Advise | Schedule | **User** | Tier **FIXED**; trigger differs |
| `restaurant-shift-prep-list-copilot` | Aid | Aid | Schedule | User + Schedule | Tier **FIXED**; 2 triggers (§0.14) |
| `restaurant-reservations-guest-profile-manager` | Represent | **Represent** | Event | User + Event | Tier **CORRECTED**; `confirmBeforeSend=true`; §0.9 violation resolved; 2 triggers |
| `restaurant-supply-chain-inventory-reorder-manager` | Represent | Represent | Event | User + Event | **MATCH** on tier; 2 triggers; `confirmBeforeSend=true` |
| `restaurant-financial-forecast-evaluator` | Advise | Advise | Schedule | User + Schedule | Tier **FIXED**; 2 triggers |

**Fixed:** all 5 skills now have `tier` and `triggers` set inside the factory calls. The reservations tier is corrected to `represent` per design. The §0.9 violation on `restaurant-reservations-guest-profile-manager` is **resolved** — the `operation` enum is gone from the input schema, and no restaurant skill now exposes `operation`/`mode`/`targetSystem` as a user-facing field. All 3 Represent-tier skills carry `confirmBeforeSend=true`. A domain-local `restaurant-contract.ts` now requires `present` on every result.

**Remaining:** 4 of 5 skills declare two triggers each, which §0.14 says should be exactly one. The reservations skill in question 3 now has **no required inputs at all**, which fixes the "no entry control" complaint but pushes the problem the other way — the skill now has nothing to act on. That likely needs a real input model, not just the removal of the bad field.

---

## 8. Content Assistant

**Design:** 3 skills | **Implementation:** 3 canonical + 3 support tools (`isSkill=false`)

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `content-strategy-seo-evaluator` | Advise | Advise | Schedule | Schedule + User | Tier **FIXED**; 2 triggers |
| `editorial-calendar-article-copilot` | Aid | Aid | Event (strategy output) | Event + User | Tier **FIXED**; 2 triggers |
| `governed-publishing-cms-dispatcher` | Represent | Represent | Event (draft approved) | Event + User | Tier **FIXED**; `confirmBeforeSend=true`; 2 triggers |

**Fixed:** all 3 canonical skills now have `tier`, `triggers`, `domainKnowledge`, and per-skill `confirmBeforeSend`. The single shared `CONTENT_HIGHER_ORDER_TRIGGERS` array (which gave every skill an identical three-trigger bundle) has been replaced by a `content-triggers.ts` module plus per-skill trigger definitions that name the actual upstream event. The Represent skill correctly carries `confirmBeforeSend=true`.

**Support tools (3, `isSkill=false`, deliberately un-tiered):** `content-drafting-adaptation`, `content-performance-seo`, `content-multi-channel-publishing`. These are lower-order tools the canonical skills delegate to, so no tier is correct per §0.3.

**Remaining:** all 3 canonical skills still carry two triggers each. The sequential wiring (strategy → draft → publish) is still **unverified** per design §2 — the Event trigger text now names the producer ("Content Strategy & SEO Evaluator returns a ranked set of topics"), which is progress, but the actual `Consumes`/`Produces` edge has not been confirmed in code.

---

## 9. Songwriter Assistant

**Design:** 4 skills | **Implementation:** 4 canonical skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `songwriter-genre-trend-evaluator` | Advise | Advise | Schedule | Schedule | **FIXED** — now a separate skill |
| `songwriting_lyric_prosody_evaluator` | Advise | Advise | Event (new lyrics) | Event | **MATCH** |
| `songwriting_musical_lyric_cocreation` | Aid | Aid | User | User | **MATCH** |
| `songwriting_lead_sheet_demo_dispatcher` | Aid | Aid | User | User | Tier **MATCH**; `confirmBeforeSend=true` (design had no Represent tier) |

**Fixed:** `songwriter_genre_trend_evaluator` is now implemented as its own skill (`songwriting/songwriter-genre-trend-evaluator.ts`) rather than folded into `creative-trend-planning`. It is tier `advise`, Schedule-triggered, with `domainKnowledge`, and it delegates explicitly to the prosody evaluator and co-creation engine, reporting `not-connected`/`partial` honestly when a dependency fails. It is in the `trend` workflow stage. All 4 songwriting skills carry `tier` and `triggers`.

**Two different implementations of the same skill now exist.** `songwriting/songwriter-genre-trend-evaluator.ts` (id `songwriter-genre-trend-evaluator`, `createCodeSkill`, delegates locally) and `creative/songwriter-genre-trend-evaluator.ts` (id `songwriter_genre_trend_evaluator`, `createExternalActionSkill`, calls a `CREATIVE_INTELLIGENCE_ENDPOINT`). The second is exported from `creative/index.ts` and included in `songwriterSkills` there. The two files are not variants of one another — they are entirely different designs. This is a duplicate-skill defect, not a fix.

**ID convention is inconsistent within this one assistant:** three skills use underscores (`songwriting_lyric_prosody_evaluator`) and one uses kebab-case (`songwriter-genre-trend-evaluator`). The design doc lists `songwriter_genre_trend_evaluator`, so neither convention matches design consistently. Four songwriting tests fail as a result — see [Regressions](#regressions-introduced-by-this-remediation).

**Remaining:** the "Represent Lead Sheet & Demo Asset Dispatcher" title and its user-facing `format` input from question 1 are **not** resolved.

---

## 10. Scriptwriter Assistant

**Design:** 4 skills | **Implementation:** 4 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `scriptwriting-genre-market-evaluator` | Advise | Advise | Schedule | Schedule | **MATCH** |
| `scriptwriting-scene-beat-dialogue-copilot` | Aid | Aid | User | User | **MATCH** |
| `scriptwriting-narrative-arc-pacing-evaluator` | Advise | Advise | Event (new scenes) | Event | **MATCH** |
| `scriptwriting-script-formatting-submission-manager` | Represent | Represent | Event (script finalized) | Event | **MATCH** — `confirmBeforeSend=true` |

**Fixed:** all 4 skills now have `tier` and `triggers` (previously neither existed). All 4 carry `domainKnowledge`. All IDs are consistently kebab-case. This is the cleanest assistant in the codebase — no remaining discrepancies against design.

**Remaining:** sequential wiring still unverified per design §2, same caveat as Content.

---

## 11. Sports Assistant

**Design:** 6 skills (2 isolated groups) | **Implementation:** 7 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `sports-tactical-roster-evaluator` | Advise | Advise | Event (pre-match) | Event | **MATCH** |
| `sports-battlecard-creator` | Aid | Aid | Event (pre-match) | Event | **MATCH** |
| `sports-scouting-alert-dispatcher` | Represent | Represent | Event (player state change) | Event | **MATCH** — `confirmBeforeSend=true` |
| `sports-matchup-odds-explainer` | Advise | Advise | Event (odds available) | Event | **MATCH** |
| `sports-bankroll-co-pilot` | Aid | Aid | Schedule | Schedule | **MATCH** |
| `sports-line-alert-dispatcher` | Represent | Represent | Event (line movement) | Event | **MATCH** — `confirmBeforeSend=true` |
| `sports-ingame-predictive-modeling` | — (design says MISSING) | Advise | — | Event | Still **EXTRA** vs design |

**Fixed:** all 6 design skills now have `tier` and `triggers` matching design exactly (previously neither existed), plus `domainKnowledge`. The 3 Represent-tier skills carry `confirmBeforeSend=true`. The dual-group isolation (DEC-010) is preserved.

**Remaining:** `sports-ingame-predictive-modeling` is still present in code although design lists it as missing. Design may simply be out of date here. All 7 sports skills have `isSkill=false`, which is inconsistent with the other assistants where canonical skills are `isSkill=true` or undefined — worth checking that this is deliberate and not an artifact.

---

## 12. Finance Assistant

**Design:** 4 skills | **Implementation:** 4 skills

| Design Skill ID | Impl Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|-----------------|---------------|---------------|-------------|------------------|----------------|--------|
| `finance-modeling-analysis` | `finance-modeling-analysis` | Advise | Advise | Schedule | Schedule | **MATCH** — ID aligned |
| `risk-regulatory-advisory` | `risk-regulatory-advisory` | Advise | Advise | Schedule | Schedule | **MATCH** — ID aligned |
| `budget-tracking` | `budget-tracking` | Represent | Represent | Schedule | Schedule | **MATCH** — ID aligned, `confirmBeforeSend=true` |
| `reporting-data-ops` | `reporting-data-ops` | Represent | Represent | Schedule | Schedule | **MATCH** — ID aligned, `confirmBeforeSend=true` |

**Fixed — this is the largest single improvement in the remediation:**
- All 4 skill IDs now match design exactly. Previously all 4 differed (`finance-build-model`, `finance-risk-assessment`, `finance-regulatory-compliance`, `finance-analyze-investment`). The old files were deleted and new files created under the design IDs.
- `reporting-data-ops`, which design listed as MISSING, is now implemented.
- All 4 carry `tier`, `triggers`, and `domainKnowledge`.
- A domain-local `finance-contract.ts` requires `present` on every result.

Finance now matches design on every row. No remaining discrepancies.

---

## 13. Wealth (Investment) Assistant

**Design:** 4 skills | **Implementation:** 4 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `investment-market-data` | Represent | Represent | Schedule | Schedule + User | Tier **FIXED**; 2 triggers; `confirmBeforeSend=true` |
| `portfolio-risk-advisory` | Advise | Advise | Event (market data update) | Event + User | Tier **FIXED**; 2 triggers |
| `bill-pay-rebalancing` | Represent | Represent | Schedule | Schedule + User | Tier **FIXED**; 2 triggers; `confirmBeforeSend=true` |
| `research-planning` | Aid | Aid | User | User | **MATCH** |

**Fixed:** all 4 skills now have `tier`, `triggers`, and `domainKnowledge` (previously none of the three existed). All 3 Represent-tier skills carry `confirmBeforeSend=true`. The missing-ID problem from the prior report is resolved — IDs match design.

**Remaining:** 3 of 4 skills carry two triggers each, against §0.14's exactly-one rule. All 4 skills require an `action` field, which is an `operation`-style enum in all but name — a softer form of the §0.9 problem that the audit did not previously flag.

---

## 14. Healthcare Assistant

**Design:** 5 skills | **Implementation:** 5 canonical + 5 base tools (`isSkill=false`)

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `healthcare-clinical-practice-workflow-evaluator` | Advise | Advise | Schedule | User + Schedule + Event + Data | Tier **FIXED**; 4 triggers |
| `healthcare-clinical-decision-support-evaluator` | Advise | Advise | User | User + Schedule + Event + Data | Tier **FIXED**; 4 triggers |
| `healthcare-patient-care-plan-educational-briefing-copilot` | Aid | Aid | User | User + Schedule + Event + Data | Tier **FIXED**; 4 triggers |
| `healthcare-appointment-patient-intake-dispatcher` | Represent | Represent | Event | User + Schedule + Event + Data | Tier **FIXED**; `confirmBeforeSend=true`; 4 triggers |
| `care-resource-referral-coordinator` | Represent | Represent | User | User | **MATCH** — `confirmBeforeSend=true` |

**Fixed — the base tools are now properly classified:**

All 5 base tools (`isSkill=false`) now carry `tier`, `domainKnowledge`, and — where the tier is `represent` — `confirmBeforeSend=true`:

| Base tool | Tier | confirmBeforeSend |
|-----------|------|-------------------|
| `healthcare-clinical-decision-support` | advise | n/a |
| `healthcare-records-scheduling-ops` | represent | ✅ |
| `healthcare-patient-communication` | represent | ✅ |
| `healthcare-resource-coordination` | represent | ✅ |
| `healthcare-operational-analytics` | advise | n/a |

All 5 canonical skills now have `tier` and `domainKnowledge`, and all 5 are correctly `isSkill=true` in `healthcareCanonicalSkills`. The Represent skill carries `confirmBeforeSend=true`.

**Remaining — this is the worst trigger problem in the codebase.** The 4 non-referral canonical skills each declare **four identical triggers** (`user` + `schedule` + `event` + `data`), with byte-identical `phrase_examples`, cadence, and event text across all four skills. This is precisely the "template default" failure §0.14 calls out. The `data` trigger kind is also not one of the three §0.14 names. This should be reduced to one honest trigger per skill.

---

## 15. Hotel Assistant

**Design:** 4 skills | **Implementation:** 7 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `hotel-revenue-performance-advisory` | Advise | Advise | Schedule | Schedule | **MATCH** |
| `hotel-guest-experience` | Aid | Aid | Event (guest request) | **User** | Tier **FIXED**; trigger differs; `confirmBeforeSend=true` |
| `hotel-reservations-guest-profile` | Represent | Represent | Event (reservation request) | **User** | Trigger differs; `confirmBeforeSend=true`; §0.9 violation resolved |
| `hotel-housekeeping-manager` | (was part of `hotel-property-operations`) | Represent | — | Event + Schedule + User | **NEW** — from split |
| `hotel-maintenance-dispatcher` | (was part of `hotel-property-operations`) | Represent | — | Event + User | **NEW** — from split |
| `hotel-room-status-manager` | (was part of `hotel-property-operations`) | Represent | — | Event + User | **NEW** — from split |
| `hotel-inventory-manager` | (was part of `hotel-property-operations`) | Represent | — | Event + Schedule + User | **NEW** — from split |

**Fixed:**
- **`hotel-property-operations` split into 4 skills** (`hotel-housekeeping-manager`, `hotel-maintenance-dispatcher`, `hotel-room-status-manager`, `hotel-inventory-manager`), one per natural sub-capability and trigger boundary, per §0.9/§6. All 4 carry `tier`, `domainKnowledge`, and `confirmBeforeSend=true`.
- **Both §0.9 violations resolved.** No hotel skill exposes a required `operation` field. `hotel-reservations-guest-profile` now requires only `propertyId`.
- All 7 skills carry `tier` and `domainKnowledge`.
- The 4 new skills are grouped in the `stay` workflow stage.

**Remaining:** the split was correct in principle but the trigger count went the wrong way — the 4 new skills carry 2–3 triggers each, so the assistant now has 3 skills where design had 1, each of which would still fail a strict §0.14 single-trigger reading. `hotel-guest-experience` is `aid` yet carries `confirmBeforeSend=true`, which is inconsistent.

---

## 16. Education Assistant

**Design:** 4 skills | **Implementation:** 4 skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `education-learner-insight` | Advise | Advise | Schedule | Schedule | **MATCH** |
| `education-adaptive-personalization` | Advise | **Advise** | Event (learner insight output) | Event | **MATCH** — tier now Advise per design |
| `education-lesson-assessment-drafting` | Represent | **Represent** | Event (submission received) | Event | **MATCH** — tier now Represent; `confirmBeforeSend=true` |
| `education-resource-library` | Aid | Aid | User | User | **MATCH** |

**Fixed:** all 4 skills now have `tier` and `triggers`. The two specified fixes are in place: `adaptive-personalization` is `advise`, and `lesson-assessment-drafting` is `represent` with `confirmBeforeSend=true`. The "placeholder config bug" noted in design is resolved — the comment in `education/index.ts:28-31` confirms the factory returns an honest `not-connected` contract when unconfigured. The `resource-library` split discrepancy is resolved: one skill, `education-resource-library`, matching design.

**Remaining — a live defect introduced by this remediation.** `education/index.ts:34-39` builds `educationCanonicalSkills` by re-declaring the same four skills with **inverted** `isSkill` flags:

```
education-lesson-assessment-drafting = false   (should be true — it is a canonical skill)
education-learner-insight            = false   (should be true)
education-adaptive-personalization   = false   (should be true)
education-resource-library           = true    (correct)
```

`registry.ts:144` passes this array as the canonical list, and `buildRegistry` de-duplicates by id with canonical winning — so the registry now classifies the three real Education skills as `base`. Confirmed in the live registry dump: all three show `type=base`. Compare `healthcareCanonicalSkills`, which sets all five to `true` correctly. This is a regression, not a pre-existing issue.

---

## 17. Support Assistant

**Design:** 4 skills (1 split into 4) | **Implementation:** 7 canonical skills

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Design) | Trigger (Impl) | Status |
|----------|---------------|-------------|------------------|----------------|--------|
| `support-resolve-ticket` | Advise | Advise | Event (new ticket) | Event | **FIXED** — `isSkill=true` |
| `support-sentiment-analysis` | Advise | Advise | Event (new ticket) | Event | **FIXED** — `isSkill=true` |
| `support-issue-analysis` | Advise | Advise | Event (new ticket) | Event (escalation to tier 2) | **FIXED** — `isSkill=true` |
| `support-search-kb` | Advise | Advise | Event (new ticket) | Event | **FIXED** — `isSkill=true` |
| `response-drafting` | Aid | Aid | Event (classification output) | Event | **MATCH** |
| `ticket-ops` | Represent | Represent | Event (response/status change) | Event | **MATCH** — `confirmBeforeSend=true` |
| `analytics-planning` | Advise | Advise | Schedule | Schedule | **MATCH** |

**Fixed — the canonical/base-tool pattern is now correct.** All 7 skills are `isSkill=true`. `supportCanonicalSkills` contains all 7 and `supportLowerOrderTools` is explicitly empty, with a comment recording that design specifies no base tools for Support. The prior report's "none have tier or triggers" no longer holds: all 7 carry `tier`, `triggers`, and `domainKnowledge`. The Represent skill carries `confirmBeforeSend=true`.

The 4-way `ticket-understanding` split is retained and is justified under §6 — each intake skill has a distinct trigger condition, and `support-issue-analysis` correctly fires on tier-2 escalation rather than on ticket receipt.

**Status: fully remediated. No remaining discrepancies.**

---

## 18. HR Assistant

**Design:** 3 skills | **Implementation:** 7 skills (split per §6)

| Design Skill ID | Impl Skill IDs | Tier (Design) | Tier (Impl) | Trigger (Impl) | Status |
|-----------------|----------------|---------------|-------------|-----------------|--------|
| `candidate-screening` | `hr-screen-resume`, `hr-assess-candidate` | Represent | Represent (both) | User, Event | **MATCH** |
| `recruiting-ops` | `hr-draft-jd-interview-kit`, `hr-trigger-interview-scheduling`, `hr-schedule-interview` | Aid | Aid (first two), Represent (`hr-schedule-interview`) | User, Event, Event | Split per §0.9/§6 |
| `hiring-analytics-compliance` | `hr-hiring-analytics`, `hr-compliance-check` | Advise | Advise (both) | Schedule, Schedule | **MATCH** |

**Unchanged and still correct.** All 7 skills have `tier`, `triggers`, and `domainKnowledge`. All Represent-tier skills carry `confirmBeforeSend=true`. The 3-way `recruiting-ops` split flagged in the previous report has been carried out: the `operation` field is gone, replaced by three skills with distinct trigger boundaries.

**Note:** `hr-schedule-interview` is `represent` while its two siblings in the same design cluster are `aid`. Design does not assign a tier to the split pieces, so this is an implementation judgement that should be ratified.

---

## 19. Product Assistant

**Design:** 3 skills + 5 unconsolidated fragments | **Implementation:** 3 skills + 5 fragments

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Impl) | Status |
|----------|---------------|-------------|-----------------|--------|
| `create-roadmap` | Advise | Advise | User | **MATCH** |
| `write-prd` | Aid | Aid | User | **MATCH** |
| `product-data-analysis` | Advise (design: `product-analytics-insight`) | Advise | Event | Tier **MATCH**; **ID mismatch remains** |
| `product-jira` | Represent (fragment) | Represent | User | `isSkill=false`, `confirmBeforeSend=true` |
| `product-confluence` | Represent (fragment) | **Aid** | User | `isSkill=false`; **tier mismatch remains** |
| `product-slack` | Represent (fragment) | Represent | User | `isSkill=false`, `confirmBeforeSend=true` |
| `product-calendar` | Represent (fragment) | Represent | User | `isSkill=false`, `confirmBeforeSend=true` |
| `product-markdown-parsing` | Represent (fragment) | **Aid** | User | `isSkill=false`; **tier mismatch remains** |
| `product-operations` | (orchestrator, not in design) | — | — | **REMOVED** |

**Fixed:**
- **`product-operations` removed.** No reference to it remains anywhere in the codebase. The §0.9 `targetSystem` enum concern is gone with it.
- The 5 fragments remain as base tools (`isSkill=false`), which is consistent with §0.3 and with the design's "must not reach general availability individually".
- All 3 canonical skills carry `tier`, `triggers`, and `domainKnowledge`.
- `product-confluence` and `product-markdown-parsing` correctly do **not** carry `confirmBeforeSend` now that they are `aid` rather than `represent` — the confirm gate tracks the tier correctly.

**Remaining:** the ID mismatch is unresolved — design says `product-analytics-insight`, code has `product-data-analysis`. Note that `product/product-analytics-insight.ts` **does exist** with the correct design ID, but it is not exported from `product/index.ts` and is therefore dead code; `product-data-analysis` is what actually registers. Two analytics skills now coexist in the directory, one live and one orphaned. `product-confluence` and `product-markdown-parsing` remain `aid` against a design `represent`. The question-6 complaint (too many inputs on "Write PRD") is not addressed by this remediation.

---

## 20. Marketing Assistant

**Design:** 5 skills + 3 execution fragments | **Implementation:** 2 canonical + 1 orchestrator + 8 external tools

| Skill ID | Tier (Design) | Tier (Impl) | Trigger (Impl) | Status |
|----------|---------------|-------------|-----------------|--------|
| `plan-campaign` | Advise | **Advise** | User | **FIXED** — Aid → Advise |
| `analyze-performance` | Advise | Advise | Schedule | **MATCH** |
| `marketing-center` | (orchestrator) | Represent | Event | Still **EXTRA** vs design; `confirmBeforeSend=true` |
| `marketing-content-generation` | Aid (fragment) | **Aid** | Event | `isSkill=false`; tier **FIXED** |
| `marketing-social-media` | Represent (fragment) | **Represent** | Schedule | `isSkill=false`; tier **FIXED**; `confirmBeforeSend=true` |
| `marketing-email` | Represent (fragment) | **Represent** | Event | `isSkill=false`; tier **FIXED**; `confirmBeforeSend=true` |
| `marketing-seo` | Aid | **Aid** | Schedule | `isSkill=false`; tier **FIXED** |
| `marketing-market-research` | Aid | **Aid** | User | `isSkill=false`; tier **FIXED** |
| `marketing-audience-insights` | Aid | **Aid** | Schedule | `isSkill=false`; tier **FIXED** |
| `marketing-document-management` | (not in design) | **NONE** | Event | `isSkill=false`; **tier still missing** |

**Fixed:**
- **`plan-campaign` tier corrected** from `aid` to `advise`, matching design.
- **The 7 external skills now have tiers**, applied via the `MARKETING_TIER` map. `MARKETING_DOCUMENT_MANAGEMENT`-class confirm gating is applied automatically to any `represent` skill, so `marketing-social-media` and `marketing-email` correctly carry `confirmBeforeSend=true`.
- All 8 external skills have `domainKnowledge`.
- All 3 canonical-ish skills have `tier` and `triggers`.

**Remaining:** `marketing-document-management` is the **only skill in the entire codebase with no tier** among the tiered-skill set. It is absent from the `MARKETING_TIER` map — an omission, since the loop that applies tiers iterates over `MARKETING_EXTERNAL_SKILLS` and this skill is in that set. `marketing-center` remains an extra orchestrator not in design, and the 3-way execution consolidation debt (§6) is still open — the 3 fragments remain `isSkill=false`, which defers but does not resolve it. The `marketing-market-research` + `marketing-audience-insights` "2 skills for 1 design" duplication is still unreconciled.

---

## 21. Analytics Assistant

**Design:** 1 skill + 2 wrapper duplicates | **Implementation:** 2 skills (split per §6)

| Impl Skill ID | Tier (Impl) | Trigger (Impl) | Status |
|---------------|-------------|-----------------|--------|
| `analytics-scheduled-trend-monitor` | Advise | Schedule | **MATCH** — correctly split per §6; `isSkill=false` base tool |
| `analytics-adhoc-query-evaluator` | Advise | User | **MATCH** — correctly split per §6; `isSkill=true` |

**Unchanged and still correct.** Both skills have `tier`, `triggers`, and `domainKnowledge`. The §6 split of the `mode`-spanning design skill is properly implemented: Schedule-triggered monitoring and User-triggered ad-hoc query are now separate skills with the right `isSkill` classification. The two deprecated wrapper duplicates remain absent, as design requires.

**Status: no remaining discrepancies.**

---

## Regressions introduced by this remediation

The remediation was applied broadly and the test suite was not updated to match. `npx jest` in `services/tool-executor` currently reports **4 failing suites / 9 failing tests** (2025 passing, 2034 total). None of these are pre-existing.

| Suite | Failing test | Cause |
|-------|---------------|-------|
| `cto-skills.test.ts` | `canonical triggers have exactly one user trigger` | Test asserts all 6 canonical CTO skills are `user`-triggered. The fix correctly made them Schedule/Event per design. **The test encodes the old bug and should be updated**, not the code. |
| `songwriting-skills.test.ts` | `reconciles the Advise higher-order skill` | Expects `songwriting-lyric-prosody-evaluator`, got `songwriting_lyric_prosody_evaluator` |
| `songwriting-skills.test.ts` | `reconciles the Aid higher-order skill` | Expects `songwriting-musical-lyric-cocreation`, got `songwriting_musical_lyric_cocreation` |
| `songwriting-skills.test.ts` | `reconciles the Represent higher-order skill` | Expects `songwriting-lead-sheet-demo-dispatcher`, got `songwriting_lead_sheet_demo_dispatcher` |
| `songwriting-skills.test.ts` | `Songwriter has exactly two user-triggered skills` | Same underscore/kebab ID divergence |
| `workflow-governance.test.ts` | `Songwriting: workflow stages cover all skills appropriately` | `songwriting/index.ts:18-23` keys `annotateStages` on kebab-case IDs, but the actual skill IDs are underscored, so only `trend` resolves |
| `workflow-governance.test.ts` | `no workflow stage is empty across all 22 assistants` | Same cause — Songwriting's `brief`, `draft`, `refine` stages have zero skills |
| `workflow-governance.test.ts` | `each workflow stage includes its skills as first-class citizens` | Same cause |
| `career-skills.test.ts` | Suite fails to compile | `TS2339: Property 'jobTitle' does not exist on type '{}'` at lines 194, 233, 234. This is a **new, untracked test file** with type errors, not a product defect. |

**The Songwriting ID divergence is a real product defect, not just a test problem.** `songwriting/index.ts` annotates stages by kebab-case ID while the skills are registered with underscore IDs, so three of four Songwriting workflow stages are empty at runtime. Pick one convention and apply it to both the skill IDs and the stage map.

---

## Summary of Systemic Issues

### 1. Missing `tier` — **RESOLVED for all user-facing skills** ✅
Previously 19 of 21 assistants had skills with no `tier`. Now every skill with `isSkill !== false` has a tier across all 22 assistants. Verified by dumping all 137 registered skills: 14 have no tier, and **all 14 are `isSkill=false` base tools** (10 Career base tools, 3 Content support tools, 1 `marketing-document-management`), which is consistent with §0.3 — except `marketing-document-management`, which is a genuine omission.

### 2. Missing `triggers` — **RESOLVED for all user-facing skills** ✅
Previously 19 of 21 assistants had skills with no `triggers`. Every skill now declares at least one trigger. The remaining defect is not absence but **excess** — see below.

### 3. §0.9 Violations — **ALL RESOLVED** ✅
All six previously-confirmed violations are fixed:
- `matter-document-ops` (Legal) — `operation` enum removed ✅
- `event-day-of-operations` (Event) — `operation` enum removed ✅
- `restaurant-reservations-guest-profile-manager` (Restaurant) — `operation` enum removed ✅
- `hotel-reservations-guest-profile` (Hotel) — `operation` enum removed ✅
- `hotel-property-operations` (Hotel) — **split into 4 skills** per §0.9/§6 ✅
- `product-operations` (Product) — **removed entirely**, taking `targetSystem` with it ✅

A new §0.9-shaped concern exists in Wealth: all 4 skills require an `action` field that functions as an operation enum.

### 4. Skill ID / Name Mismatches — **MOSTLY RESOLVED** ⚠️
Fixed: all 4 Finance IDs, all 4 Wealth IDs, the Songwriter genre-trend skill is now separate.
Still open: Product analytics (`product-data-analysis` vs design `product-analytics-insight` — and the correctly-named file is dead code); Songwriter's mixed underscore/kebab IDs; `marketing-document-management` un-tiered.

### 5. Missing Skills Per Design — **RESOLVED** ✅
- Executive: both missing skills (`Speech & Communication Co-Pilot`, `Time & Strategic Focus Proxy`) are now implemented and wired into the workflow.
- Finance: `reporting-data-ops` is now implemented under its design ID.
- Songwriter: `genre_trend_evaluator` is now a separate skill.
- Sports: `sports-ingame-predictive-modeling` remains extra, not missing — design is out of date.

### 6. §0.14 Violation: multiple triggers — **NEW, and now the largest systemic issue** 🔴
19 skills declare more than one trigger, against a design rule that says every skill has exactly one. This is a direct side effect of the fix: skills that previously had *no* trigger were given a bundle covering every plausible invocation. The worst cases:
- **Healthcare:** 4 skills × 4 triggers each, byte-identical across all four — the exact "template default" failure §0.14 names.
- **Hotel:** 3 of 4 new split skills carry 2–3 triggers.
- **Restaurant, Content, Investment:** 2 triggers each.
- Note `data` is used as a trigger kind in Healthcare, but §0.14 names only User, Schedule, and Event.

### 7. `isSkill` classification defects — **ONE REGRESSION** 🔴
Support (7/7 true) and Healthcare (5/5 true) are correct. **Education is inverted**: `educationCanonicalSkills` sets `isSkill=false` on 3 of 4 real canonical skills, which propagates to the registry and misclassifies them as base tools.

### 8. Test suite is red — **4 suites, 9 tests** 🔴
Detailed above. One CTO failure is a stale test encoding the old bug; three Songwriting + three governance failures trace to a real ID-convention defect; one Career failure is an untracked new test file that does not compile.

### 9. Open product questions, unaddressed by this remediation
Questions 1–7 from the design review are all still open. The "too many inputs" complaints (Executive, Product `write-prd`, Sales `lead-deal-advisory`, Restaurant menu engineering) and the two input-schema defects (no entry control for popularity/profitability/cost data; an ID field the user must fill) were not touched. Removing the `operation` fields fixed the §0.9 violations but did not replace them with a usable input model — Restaurant's reservations skill now has no required inputs at all.

---

## Recommendations

1. **Restore green tests before anything else.** Update the stale CTO trigger test to expect Schedule/Event. Pick one Songwriter ID convention and apply it to both `songwriting/index.ts` stage maps and the skill IDs. Fix or delete the untracked `career-skills.test.ts` type errors.
2. **Fix the Education `isSkill` inversion** at `education/index.ts:34-39` — set all four to `true`, matching `healthcareCanonicalSkills`.
3. **Reduce every skill to exactly one trigger** per §0.14, starting with Healthcare's 4×4 template. Where a skill genuinely spans invocation modes, split it rather than listing both.
4. **Add the missing tier on `marketing-document-management`** — one line in the `MARKETING_TIER` map.
5. **Resolve the duplicate Songwriter genre-trend skill** — `creative/songwriter-genre-trend-evaluator.ts` and `songwriting/songwriter-genre-trend-evaluator.ts` are two different designs under two IDs. Pick one, delete the other.
6. **Reconcile the Product analytics ID.** Either rename `product-data-analysis` to `product-analytics-insight` and delete the orphan file, or amend the design doc.
7. **Ratify the tier divergences** where design marked tiers as inferred: CTO war-room (Aid vs Advise), Legal research and matter-document-ops, Sales pipeline-ops, Event vendor/day-of, Product fragments.
8. **Address the original input-schema questions** (1–7). The §0.9 fixes removed bad fields but did not give these skills usable input models, and Restaurant's reservations skill now has no required inputs at all.

---

*Report regenerated from the live skill registry, not from source inspection. Test results captured at time of writing: 2025 passing, 9 failing across 4 suites.*
