# OD-8 Research: Model Catalog eligibility panel & Brain Runtime settings removal

Work order: **art_Mt7gOQGl** — "Fix/remove Model Catalog eligibility panel and remove Brain Runtime settings" (`cpravetz/stage7`).
Scope of this document: read-only research. All paths below are relative to the repo root. All line references were read from the working tree at branch `task/research-stage7-model-catalog-and-brain-hhIysch3` (cut from `main` at `de7e508`).

Two upstream commits introduced the surfaces in question — they are the exact boundary between "logic added to implement these settings" (remove) and "pre-existing Brain logic" (keep):

- **`bb9b883` / PR #137** — "feat: Tier-1 Brain knobs via brain/settings/llm-config settings doc" — added `shared-nextgen/src/config/brainSettings.ts` and wired it through brain, agent-runtime, temporal, and the frontend Settings page.
- **`61acadb` / PR #141** — "feat: settings Tier 2 — mission approval settings and model allow-list UI" — added the Model Catalog card (with the misleading copy), the generic `settingsDocSource.ts` plumbing, mission approval settings, and `POST /api/brain/models` validation.

---

## 1. Codebase map

### 1.1 The Model Catalog panel (change #1)

| What | Where |
|---|---|
| The panel itself | `frontend-nextgen/src/components/ModelCatalogCard.tsx` (whole file, 209 lines; heading `<h3>Model Catalog</h3>` at line 125) |
| Where it is rendered | `frontend-nextgen/src/pages/Settings.tsx` — imported at line 2, rendered last inside the `<div className="grid one-col">` of the Settings page |
| Read API | `GET /api/brain/models` — `services/brain/src/routes/brain.ts` line 147 → `BrainService.listAvailableModels()` → `ModelRouter.listModels()` |
| Write API | `POST /api/brain/models` — `services/brain/src/routes/brain.ts` line 152 → Zod `modelRegistrationSchema` → `BrainService.registerModel()` → `ModelRouter.registerModel()`; in-memory only, returns 201 |
| Tests | `frontend-nextgen/src/components/ModelCatalogCard.test.tsx` (Vitest, 94 lines — pure helpers `parseCapabilities`/`buildModelPayload` + three render tests); `services/brain/__tests__/brain-route.test.ts` (Jest — route validation) |

**The exact misleading copy** (`ModelCatalogCard.tsx`, lines 126–129):

> "Registered models are the routing allow-list: only models here can be selected for completions.
> Registrations live in memory and are re-derived from provider catalogs when the Brain restarts."

**Why it is wrong — how the catalog actually relates to what the Brain can call:**

1. **Provider catalogs are registered automatically at Brain boot.** `BrainService` constructor (`services/brain/src/services/BrainService.ts`, constructor at ~line 204) runs `registerProviderModels(provider)` for every provider built by `buildProviderRegistry()` (`services/brain/src/providers/registry.ts`). Each provider's `listModels()` result — the full provider catalog, not a curated list — is pushed into the router via `this.router.registerModels(defs)`. The panel's list is therefore a *view* of what providers already registered, not a gate.
2. **A manual registration adds one entry to the same map** (`registerModel()` → `router.registerModel()`); it neither restricts nor expands eligibility beyond that single model definition.
3. **Actual eligibility is computed per call by `ModelRouter.getCandidates()`** (`services/brain/src/services/ModelRouter.ts`, lines 193–256). A model is eligible when it:
   - fits the required context window (`fitsContext`, with a graceful fallback when no model fits);
   - satisfies the per-call budget filter, when a `budget` is supplied: `if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;` (line 206);
   - satisfies `freeOnly` when the `llm-config` `freeModelsOnly` preference is set (line 208) — that is the **Preferences** card, a separate, older setting;
   - is not excluded by the routing session or a cooldown;
   - supports the requested input/output formats;
   - matches required capabilities (inferred from the task), with layered fallbacks down to plain `chat`.
   Nothing in `getCandidates` consults the manual-entry panel as an allow-list.
4. So the truth is the opposite of the copy: **any model from any configured provider that meets the Brain's call criteria is eligible**, whether or not anyone typed it into this form. The second sentence of the copy ("re-derived from provider catalogs when the Brain restarts") is accurate and worth keeping in whatever replaces the first sentence.

### 1.2 The Brain Runtime settings panel (change #2)

**Frontend — `frontend-nextgen/src/pages/Settings.tsx`:**

| What | Where in the file |
|---|---|
| `<h3>Brain Runtime</h3>` card | line 244, with the copy "Timeouts and circuit-breaker settings for model calls. Values here override the environment variables at runtime; leave a field blank to keep the environment value." |
| Settings document id | `BRAIN_DOC_ID = 'brain/settings/llm-config'` (line 30) |
| The five knobs (`BRAIN_KNOBS`, lines 33–39) | `providerTimeoutMs` (Provider Fetch Timeout, env `BRAIN_PROVIDER_TIMEOUT_MS`, default 300000, max 600000) · `providerAttemptTimeoutMs` (Provider Attempt Ceiling, env `BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS`, default 310000, max 1800000) · `completionDeadlineMs` (Completion Deadline, env `BRAIN_COMPLETION_DEADLINE_MS`, max 7200000) · `circuitThreshold` (Circuit Breaker Threshold, env `BRAIN_CIRCUIT_THRESHOLD`, default 8, max 1000) · `circuitCooldownMs` (Circuit Breaker Cooldown, env `BRAIN_CIRCUIT_COOLDOWN_MS`, default 60000, max 3600000) |
| State/handlers | `SettingsState.brain` type (lines 11–17), `parseBrainKnob` (line 50), doc parsing in `loadSettings` (lines 86–90), `brainDraft`/`updateBrain`, `handleSaveBrain` → `saveKnobDocument` (note: `saveKnobDocument` is **shared with the Mission Approvals card** — it must survive removal) |
| Persistence call | `POST /api/artifacts/documents` with `{ id: 'brain/settings/llm-config', tenantId: 'system', collection: 'settings', data }` — document **replace** semantics; blank inputs mean "remove the override" |

**Shared plumbing — `shared-nextgen/src/config/brainSettings.ts`** (269 lines at `bb9b883`, refactored onto the generic source by `61acadb`; ~225 lines today):

- `DEFAULT_BRAIN_SETTINGS_DOC_ID`, `BRAIN_SETTINGS_DOC_TYPE`, `MAX_BRAIN_*` bounds, `DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS` / `DEFAULT_BRAIN_COMPLETION_DEADLINE_MS`;
- `BrainSettingsOverrides` / `BrainSettings` types, `parseBrainSettingsDoc` (field-level validation, one bad field never discards good ones), `resolveBrainSettings` (doc → env → built-in default precedence; completion deadline derives from the attempt ceiling when unset);
- `createBrainSettingsSource()` / `brainSettings` singleton (TTL-cached, pollable), and `publishResolvedBrainSettings()` / `latestResolvedBrainSettings()` for synchronous hot paths;
- exported from `shared-nextgen/src/index.ts` line 22 (`export * from './config/brainSettings'`).
- The generic source it rides on, `shared-nextgen/src/config/settingsDocSource.ts`, is **shared with `missionSettings.ts`** and must survive.

**Every consumer of the settings (all added or rewired by `bb9b883` unless noted):**

| Consumer | File | Use |
|---|---|---|
| Brain: per-completion resolution | `services/brain/src/services/BrainService.ts` | field `settingsSource = createBrainSettingsSource()`; in `complete()` (~line 396): `await this.settingsSource.refresh(); const resolved = resolveBrainSettings(...); publishResolvedBrainSettings(resolved); this.applyCircuitSettings(resolved);` — then `attemptTimeout = resolved.providerAttemptTimeoutMs`, `attemptCostMs = Math.min(attemptTimeout, resolved.providerTimeoutMs)`, `completionDeadline = startTime + resolved.completionDeadlineMs`; constructor + `applyCircuitSettings()` (~line 216) apply `circuitThreshold`/`circuitCooldownMs` to all breakers |
| Brain: provider fetch timeout | `services/brain/src/utils/providerFetch.ts` | `providerTimeoutMs()` reads `latestResolvedBrainSettings()?.providerTimeoutMs`, falling back to `resolveBrainSettings(undefined, process.env)`; consumed by `fetchProvider()` used by all providers |
| Brain: breaker reconfiguration | `services/brain/src/utils/circuitBreaker.ts` | `configure(threshold, cooldownMs)` method added by `bb9b883` (constructor params made non-`readonly` to support it) |
| agent-runtime: request deadline | `services/agent-runtime/src/services/agent-executor/BrainClient.ts` | `brainRequestTimeout()` = `resolveBrainSettings(brainSettings.current().overrides, process.env).completionDeadlineMs + BRAIN_RESPONSE_GRACE_MS`, clamped to `MAX_BRAIN_REQUEST_TIMEOUT_MS`; replaced the pre-existing `brainRequestTimeoutFromEnvironment()` |
| agent-runtime: constant re-exports | `services/agent-runtime/src/services/agent-executor/constants.ts` | re-exports `DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS` / `DEFAULT_BRAIN_COMPLETION_DEADLINE_MS` from shared (lines 36–39) |
| agent-runtime: executor wiring | `services/agent-runtime/src/services/AgentExecutor.ts` | per-request `timeoutMs: brainRequestTimeoutMs ?? brainRequestTimeout()` when no explicit timeout is set |
| agent-runtime: polling | `services/agent-runtime/src/index.ts` | `brainSettings.startPolling()` at boot |
| temporal: activity timeouts | `services/temporal/src/agent/AgentRuntimeConfig.ts` | `resolveBrainSettings(brainSettings.current().overrides, process.env).completionDeadlineMs + 60_000` for Temporal activity timeouts |
| temporal: polling | `services/temporal/src/index.ts` | `brainSettings.startPolling()` at boot |
| env docs | `.env.example` | 5-line comment block added by `bb9b883` ("These values are FALLBACKS: the `brain/settings/llm-config` settings document … overrides them at runtime") above the pre-existing `BRAIN_*` variables (lines ~96–127) |

**What predates the settings commits and must be kept (verified via `git show bb9b883` removed lines):**

- `withProviderTimeout()` — the per-attempt ceiling race (previously read `process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS`, default 310000);
- the completion-deadline mechanism — previously `startTime + (BRAIN_COMPLETION_DEADLINE_MS env or max(attemptTimeout, min(attemptTimeout*3, 900000)))`;
- the deadline-budgeting fix `attemptCostMs = Math.min(attemptTimeout, providerTimeoutMs())` and both in-loop deadline checks ("deadline expired before the next eligible model could be attempted" / "did not leave enough time for the next eligible model attempt");
- env-based circuit-breaker defaults (`BRAIN_CIRCUIT_THRESHOLD` → 8, `BRAIN_CIRCUIT_COOLDOWN_MS` → 60000);
- the attempt loop itself: `routingSessions` (`getRoutingSession`, `recordRoutingSessionAttempts`, TTL 1 h, cap 1000), model cooldowns with exponential backoff (`nextModelCooldown`, `normalizeCooldownError`, `MODEL_COOLDOWN_MAX_MS`), error classification (model-specific / provider-fatal / rate-limit / timeout / transient), and the `BRAIN_MODEL_SELECTION_RETRY` vs `BRAIN_MODEL_SELECTION_EXHAUSTED` distinction thrown as `NextGenError` with `remainingModelCount`;
- the caller-side continuation: `services/agent-runtime/src/services/agent-executor/brainTurn.ts` `retryWithRemainingModels()` (lines ~157–190) re-issues the same routing-session request while eligible models remain, bounded by `MAX_MODEL_SELECTION_RETRIES = 50` (constants.ts line 44) and a no-progress guard;
- all `BRAIN_*` env variables themselves in `.env.example` (only the "FALLBACKS" comment block is settings-added).

**Where the "spend cap" lives:** there is **no mission-level spend cap in the code today**. A repo-wide search for `spend|cost.?cap|maxspend|spend.?cap` (source, tests, history, all branches) finds only a comment in `services/brain/src/providers/registry.ts:127` about metered providers "quietly starting to spend money". The closest existing mechanisms are: the per-completion `budget` filter in `ModelRouter.getCandidates` (line 206 — a per-1k-token cost ceiling, currently **never supplied by any caller**: `BrainClient.complete()` does not send `budget`, and `routes/brain.ts` only forwards it if present in the request body); per-call `maxTokens`; `MAX_MODEL_SELECTION_RETRIES = 50`; and the completion deadline. The work order's phrase "or now, until the spend cap is reached" should be treated as either shorthand for the `budget` filter or as a planned capability — the implementer must not invent a new cap as part of this removal.

---

## 2. Constraints the change must respect

1. **Build order.** Root `npm run build` is dependency-ordered (shared-nextgen → artifacts → services); `npm run build --workspaces` is NOT safe under npm 10. Removing exports from `shared-nextgen` requires a clean shared build before services compile.
2. **Tests must run locally; GitHub Actions does not run them.** Two runners: Jest (`npm test` at root for services + shared-nextgen; tool-executor suites need `bubblewrap`, `prlimit`, `python3` on `/usr/bin` — irrelevant here but they fail fast in `beforeAll` if missing) and Vitest (`cd frontend-nextgen && npm test`). Suites that touch the affected surfaces:
   - `shared-nextgen/__tests__/brainSettings.test.ts` — tests only the settings module; dies with it (or is replaced by whatever survives the revert).
   - `frontend-nextgen/src/components/ModelCatalogCard.test.tsx` — does **not** assert the misleading paragraph, so a copy fix is test-neutral; removing the card requires deleting this suite.
   - `services/brain/__tests__/brain-route.test.ts` — covers `POST /api/brain/models` Zod validation (added `61acadb`); the route stays under either option for change #1.
   - `services/brain/__tests__/brain.test.ts`, `model-router.test.ts`, `model-cooldown.test.ts` — cover the attempt loop; must stay green and untouched in behavior.
   - `services/agent-runtime/src/__tests__/brain-client.test.ts` — no assertions on the settings-derived timeout; a revert of `BrainClient` should keep it passing but it must be re-run.
   - `shared-nextgen/__tests__/missionSettings.test.ts` — must keep passing; do not touch `settingsDocSource.ts` or `missionSettings.ts`.
3. **Persistence/schema.** The settings doc is an untyped document in the artifacts service's `documents` collection (`brain/settings/llm-config`, `tenantId: 'system'`, `collection: 'settings'`). There is no schema, migration, or default-baking anywhere else; saves use document-replace semantics. After removal, any previously saved doc simply becomes an unread orphan — harmless at runtime, but the independent-review acceptance criterion ("no orphaned references to the removed settings or misleading copy remain — state, UI, persistence, defaults") suggests either deleting the doc or explicitly noting it as inert. Do **not** delete shared artifacts documents machinery (`routes` on the artifacts service) — it is used by the Preferences and Mission Approvals cards.
4. **Shared code boundaries.** `saveKnobDocument` in `Settings.tsx` is shared with the Mission Approvals card — keep it. `settingsDocSource.ts` is shared with `missionSettings.ts` — keep it. Only the Brain-specific adapter (`brainSettings.ts`) and its five knobs are removal targets.
5. **Existing patterns.** The revert should restore the pre-`bb9b883` shapes exactly where they existed: env-based `providerAttemptTimeoutMs()` helper, env-based `providerTimeoutMs()` in `providerFetch.ts`, `readonly` constructor params on `CircuitBreaker` (dropping `configure()`), `brainRequestTimeoutFromEnvironment()` in `BrainClient`, and the constructor-time env resolution of breaker defaults in `BrainService`.

---

## 3. Risks

- **Attempt-loop time budgeting is the highest-risk surface.** `resolveBrainSettings` currently feeds three things the loop depends on: `attemptTimeout`, `attemptCostMs`, and `completionDeadline`. Removing the doc layer must **revert to** the pre-existing env resolution, not delete the deadlines — otherwise the loop either loses its outer bound (unbounded attempts) or (if the deadline defaults change subtly) exits early and turns `BRAIN_MODEL_SELECTION_RETRY` situations into `EXHAUSTED` ones. Preserve the exact pre-`bb9b883` formulas.
- **Cross-service compile breakage.** `publishResolvedBrainSettings`, `latestResolvedBrainSettings`, `resolveBrainSettings`, `brainSettings`, and the two `DEFAULT_BRAIN_*` re-exports are imported in five services plus shared's barrel (`shared-nextgen/src/index.ts`). Removing the module without touching every import fails `npm run build` (root script, dependency-ordered).
- **`providerFetch` hot path.** `fetchProvider` is used by every provider; if `providerTimeoutMs()` is reverted to the env-only version, all providers automatically inherit the change. Forgetting it leaves a dangling import of `latestResolvedBrainSettings` — a build break, at least, not a silent behavior change.
- **Breaker semantics.** `configure()` was added specifically to apply operator changes without resetting failure history. Reverting to constructor-only settings means breakers are sized once at boot — same as before the settings existed. Do not "improve" this during removal.
- **Frontend state removal.** `Settings.tsx` has interleaved state for three cards; removing `SettingsState.brain`, `BRAIN_KNOBS`, `parseBrainKnob`, `brainDraft`, and `handleSaveBrain` while keeping the shared `saveKnobDocument` and the Preferences/Mission cards requires care — the two remaining cards must keep working.
- **Copy change must not overcorrect.** The second sentence of the current copy ("Registrations live in memory and are re-derived from provider catalogs when the Brain restarts") is true and load-bearing — a rewrite that keeps only "any model meeting the Brain's criteria is eligible" without the restart caveat would be a new inaccuracy (manually registered models vanish on restart).
- **Do not strip "free models only" strings.** Error messages in `BrainService.complete()` mention `freeModelsOnly` — that is the *Preferences* (`llm-config`) setting, which stays.
- **Spend cap.** Nothing to remove, and the principle must not be "implemented" incidentally: adding a new cap is out of scope for this work order.

---

## 4. Options considered

### Change #1 — Model Catalog panel

| Option | Effect | Cost |
|---|---|---|
| **A. Fix the copy** | Rewrite the paragraph to state the truth: provider catalogs are registered automatically when the Brain boots, the form adds a definition to that same in-memory routing set, and any model meeting the Brain's call criteria (context window, capability/format match, budget, free-only preference, provider availability) is eligible — this panel is not an allow-list | One paragraph + no test churn (`ModelCatalogCard.test.tsx` doesn't assert the paragraph); keeps operator visibility into what the Brain can route to and a manual-registration path for models a provider's catalog doesn't expose |
| **B. Remove the panel** | Delete `ModelCatalogCard.tsx`, its render site in `Settings.tsx`, and its test file; `GET/POST /api/brain/models` become UI-orphaned (could stay for API users or be removed too) | Larger diff; loses the only UI view of the routing catalog and the only manual-registration path |

**Recommendation: Option A (fix the copy).** The acceptance criterion is written as "no longer implies… either fixed … or removed if cleaner". The card's *listing half* (what models exist, their cost/context/capabilities) is accurate and useful; only the *claim* about allow-listing is false. Fixing the copy corrects the falsehood at minimum cost and keeps a debugging surface the Brain otherwise lacks. Removal is justified only if the manual-registration path is judged dead weight — nothing in this research suggests it is used or harmful.

### Change #2 — Brain Runtime settings removal scope

| Option | Scope | Assessment |
|---|---|---|
| **A. Full removal of the added logic (revert to env-based resolution)** | Frontend: Brain Runtime card, `BRAIN_DOC_ID`, `BRAIN_KNOBS`, `parseBrainKnob`, brain state/draft/handler. Shared: delete `brainSettings.ts` + its barrel export + `brainSettings.test.ts`. Brain: revert `BrainService` to env-resolved attempt timeout/deadline/breaker defaults, revert `providerFetch.ts` to env-only, drop `CircuitBreaker.configure()`. agent-runtime/temporal: remove `startPolling()` calls, restore env-based `brainRequestTimeout*`, revert `AgentExecutor`/`AgentRuntimeConfig` to env reads. `.env.example`: drop the FALLBACKS comment block, keep the `BRAIN_*` vars | Exactly matches the work order ("remove these settings, the entire panel, and any logic you added to implement them"); restores the pre-`bb9b883` code shapes that the attempt loop was built on; `settingsDocSource.ts` + `missionSettings.ts` stay (they implement a *different* feature) |
| **B. Remove the panel UI only, keep the doc-reading plumbing** | Frontend deletion only; the doc keeps working via the artifacts API | Rejected: leaves live, undocumented behavior (a settings doc silently overriding env vars) — the exact "logic added to implement them" the work order says to remove, and the review step would rightly flag it as an orphaned/persisted setting path |
| **C. Keep `resolveBrainSettings` as an env-only helper, delete the doc layer** | Collapse doc/env/default precedence to env/default but keep the shared module | Rejected: it is pure added machinery with no remaining second source; keeping it preserves a concept ("Tier-1 knobs doc layer") the platform has disowned, and `constants.ts` re-exports / `publishResolvedBrainSettings` / `latestResolvedBrainSettings` exist only to serve the doc layer |

**Recommendation: Option A — full removal with exact revert to pre-`bb9b883` behavior.** It is the only option that satisfies the acceptance criteria verbatim (panel, settings, and all implementing logic gone; "no orphaned references … state, UI, persistence, defaults"). The safest implementation shape is `git revert`-style restoration of the pre-`bb9b883` bodies for the five Brain-side files (BrainService wiring, providerFetch, circuitBreaker, BrainClient, AgentExecutor/AgentRuntimeConfig), rather than a fresh rewrite, because the pre-existing formulas (deadline default, `attemptCostMs` budgeting, breaker defaults) are the attempt-loop invariants to protect. The spend-cap clause of the principle requires no code — no cap exists in the code today, and none should be invented here.

---

## 5. Evidence trail (what this document rests on)

- Full reads: `ModelCatalogCard.tsx`, `Settings.tsx`, `shared-nextgen/src/config/brainSettings.ts`, `services/brain/src/utils/providerFetch.ts`, `services/agent-runtime/src/services/agent-executor/BrainClient.ts` and `constants.ts`, `ModelRouter.ts` (lines 180–300), `routes/brain.ts` (lines 130–210), `brainTurn.ts` (lines 130–200), `BrainService.ts` (first ~700 lines).
- Diff inspection: `git show bb9b883` (BrainService, circuitBreaker, providerFetch, AgentExecutor, index files, `.env.example`) and `git show 61acadb` (missionActivity, commit message) — the two upstream commits that added the settings logic and the panel.
- Repo-wide greps: `spend|cost.?cap|maxspend` (no spend cap in code), `BRAIN_`, `budget` consumers, test-suite locations, `package.json` test scripts (frontend Vitest, services/shared Jest).
