# Open decision: intended trigger for Skills the code cannot settle

**Status:** awaiting product decision
**Raised:** 2026-10-01, during the Skill-visibility / trigger-reachability audit
**Blocked on:** product owner per Assistant
**Companion work:** twelve Skills were already reassigned to **User** in the same audit and are *not* listed here. See `docs/assistants_design_0922_v7.md` §0.14 for the rule that was applied and the ids it covered.

## Why these nine are open

The other Skills fell into a decidable class: their handler refuses to run when a required input is absent, so the only thing that could ever supply it is a person, and the trigger is User. These nine are different — **their handlers read the input when present and carry on regardless**. There is no guard, no fetch, no base-tool call. They neither block nor self-supply, so the implementation genuinely does not record who was meant to invoke them. Nothing in the repo answers it.

`scripts/skill-trigger-review.ts` regenerates the full evidence table. Lower-order/base tools are excluded by design (see v7 §0.14, "Skills excluded from this discussion").

## The decisions

### Legal — `contract-document-advisory`
Required: `contractText`. Optional: `contractType`, `jurisdiction`. Handler reads it if present, produces a classification if not.

- **User** — an operator pastes a contract to triage. Matches the current §4 *Event* reading only if a document-management connector is eventually wired, which it is not.
- **Event/State** — a redline arriving in Drive/SharePoint fires it. Requires the connector to exist first; today nothing would ever fire it.
- **Recommendation: User**, or Event **only** alongside a real connector.

### Legal — `compliance-tracking`
Now has **no required inputs** (its unused `documentText` requirement was removed in this audit; the handler reports `documentProvided` rather than implying a check ran). Declared Schedule.

- The real gap is that there is **no rule set or provider**, so it cannot conclude anything — it returns `manual-review-required` honestly.
- **Decision needed:** is this a Schedule monitor over a real compliance feed (needs an integration), or a User-triggered "check this document against GDPR" tool (needs a rule set)? Both are unshippable today.
- **Recommendation: User**, matching `contract-document-advisory` above, so the pair is coherent.

### Support — `response-drafting`
Required: `customerMessage`. Optional: `ticket`, `tone`, `template`, `includeKB`, `suggestedActions`. Declared Event, and v7 §11 supports that: fired by `ticket-understanding`'s classification.

- **This is the one Event trigger in the list with a credible edge** — but it is **not declared** in `manifest.consumes`, so the edge exists only in prose. Per v7 §0.14 the Event being watched for "must be defined within the Skill itself, in a form the Assistant can parse and monitor — not left as a vague label."
- **Decision needed:** declare the edge (Skill now), or make it User (a support agent pastes the customer's message and asks for a draft).
- **Recommendation:** keep Event, **and** declare `consumes`. Making it User would re-open the ticket lifecycle that §11 says is genuinely sequential per ticket.

### Education — `education-lesson-assessment-drafting`
Required: `task`, `subject`, `topic`. Eleven optional fields (grade, standards, objectives, quizType, questionCount, difficulty, …). Declared Event. **Not in Part B under this id.**

- Its required inputs are a request to produce something, not a payload an event would carry.
- **Recommendation: User.** Also needs a Part B row.

### HR — `hr-trigger-interview-scheduling`
Required: `data`. Optional: `dryRun`, `filters`, `pagination`, `confirmation`. Declared Event, has an endpoint (`HR_RECRUITING_ENDPOINT`).

- v7 §6 explicitly split `recruiting-ops` into "a User-triggered JD/interview-kit builder and an Event-triggered interview scheduler" — so Event here *is* the designed answer, and `hr-draft-jd-interview-kit` is the User half.
- The open part is only the shape of `data`: a bare `"data is required"` string is not a parseable Event definition (§0.14).
- **Recommendation: keep Event; define the payload shape** and declare `consumes`. This one is close to done.

### Scriptwriter — `scriptwriting-genre-market-evaluator`
Required: `genre`. Nine optional (genreFocus, marketDataSource, targetFormat, topic, logline, script, audience, targetDuration, pageTarget). Declared Schedule, has `SCRIPTWRITING_SUBMISSION_ENDPOINT` in its manifest.

- A schedule-driven market monitor needs the market source configured; with nothing configured it cannot poll.
- **Decision needed:** is this a recurring market monitor (needs a live source + cron) or a User request to check a genre?
- **Recommendation: User** unless a market data source is actually being built.

### Sports — `sports-ingame-predictive-modeling`
Required: `event`. Optional: sport, gameStatus, playByPlay, lineup, momentum, timeRemaining. Declared Event. **Not in Part B** — v7 §11 states "In-Game & Predictive Modeling — not in code," so this is new code the design has not caught up with.

- **Decision needed:** what fires it, and on what cadence? Real-time in-game implies a live play-by-play feed and a state condition; nothing supplies `event` today.
- **Recommendation: hold.** It needs a design decision before a trigger is assigned — note also that v7 §11 lists it as missing, so Part B needs updating regardless.

### Product — `product-data-analysis`
Required: `metric`. Optional: dimensions, filters, startDate, endDate, granularity. Declared Event; v7 §19 names the equivalent `product-analytics-insight` with no trigger recorded.

- Forwarded wholesale to `PRODUCT_ANALYTICS_API_URL` (see the `createExternalActionSkill` body-serialisation path), so a person supplying `metric` is perfectly coherent.
- **Recommendation: User**, and add a Part B row with the trigger recorded — v7 §19 currently leaves it blank.

### Marketing — `marketing-center`
Required: `targetChannel`. Optional: `data`. Declared Event; the one Skill in the list that is a real orchestrator — `lowerOrderTools` covers 7 marketing Skills.

- v7 §13 requires consolidating `marketing-content-generation`, `marketing-social-media` and `marketing-email` into one Skill. `marketing-center` looks like that consolidation, and `targetChannel` is the switch over the fragments.
- **This is also a §0.9 problem**, not just a trigger one: selecting which sub-operation runs is exactly the enum §0.9 forbids as a required field. But `targetChannel` names a *destination*, not an operation, so it is weaker evidence than `operation`/`mode` — the judgement is product's.
- **Recommendation: decide the §6 consolidation first.** The trigger cannot be settled independently, because if the three fragments remain separate Skills this wrapper should not exist.

## What was already decided, so it is not re-litigated here

- The twelve Skills whose handlers block on a missing required input are **User**-triggered. Rationale and ids in v7 §0.14.
- `isSkill: false` base tools need no trigger, no UX panel, and no user inputs. They are excluded from this document by construction.
- `content-multi-channel-publishing` exposes 33 optional inputs spanning CMS, social video and email (`videoFile`, `newsletterId`, `playlistId`). It is a §6 consolidation candidate hiding behind an optional-anything schema; it is not in the table above because its inputs are all optional, but it will not behave as one Skill until it is split.