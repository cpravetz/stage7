# PRD Writing Standards

What a product requirements document has to contain before an engineering team can start, and how the `write-prd` skill assembles it. The skill takes a problem statement and a scattering of goals, constraints, and risks, and returns a structured PRD with INVEST user stories, Given/When/Then acceptance criteria, a data model, UX flows, dependency lists, and a phased rollout plan behind feature flags. This handbook covers the section-by-section standard, the defaults baked into the generator, and the review rules that keep a PRD honest.

## The standard

A PRD is a decision record, not a feature description. The test is whether an engineer who has never spoken to you could scope, build, and test the work without asking follow-up questions. If any section below cannot be answered, the gap is an open question, not something to be smoothed over with prose.

The `write-prd` input surface is the contract: `title`, `problem`, `scope`, `goals[]`, `successMetrics[]`, `nonGoals[]`, `openQuestions[]`, `targetUsers[]`, `userStories[]`, `constraints[]`, `assumptions[]`, `risks[]`. The output is a single `prd` object plus flattened `userStories`, `acceptanceCriteria`, and `rolloutPlan`.

## Problem, scope, and non-goals

- **Problem** — whose pain, how often, and what it costs them today. Written in the user's language, not the feature's. If the statement describes a solution, rewrite it as the problem underneath.
- **Scope** — the boundary of the change, stated positively. What is in.
- **Non-goals** — `nonGoals[]` becomes `nongoal_<n>` entries. This list is the most-read section in the document and the cheapest defence against scope creep. "We are not building a reporting suite in this release" saves an entire argument later.
- **Target users** — `targetUsers[]` drives both story personas and the secondary UX flows. When empty, the skill falls back to `end user`, `administrator`, `viewer`, which is a reasonable smoke-test but should not reach a real PRD.

## Goals and success metrics

`goals[]` are statements of outcome. `successMetrics[]` become `metric_<n>` entries, each carrying a `target` of "Defined during sprint planning" and a `baseline` of "Current state measurement".

A metric is only useful if it has a number, a direction, a baseline, and a date. Replace both placeholders before circulation. Two or three metrics beat eight; a PRD whose success cannot be falsified will be declared successful regardless of what shipped.

## INVEST user stories

`write-prd` emits between 3 and 15 stories. The count comes from what you supply: if you pass three or more `userStories[]`, that count is used verbatim; otherwise the skill derives `ceil(problem.length / 40) + 2` and clamps to the 3–15 range. Stories are emitted as `story_<n>` in the shape `As a [user type], I want [action] so that [benefit]`.

| Letter | Criterion | How to check it |
| --- | --- | --- |
| I | Independent | No dependency on another story being done first |
| N | Negotiable | The solution is a proposal, not a contract |
| V | Valuable | Delivers value to a user or the business |
| E | Estimable | The team can size it without a design spike |
| S | Small | 25 words or fewer is the skill's heuristic |
| T | Testable | Acceptance criteria can be automated |

Each story carries an `invest` object with `independent`, `negotiable`, and `estimable` fixed at `true` and `valuable`, `small`, and `testable` derived from the text — small from the 25-word count, testable from the presence of a modal verb, valuable from the presence of a stated benefit phrase. The `score` is the fraction of the three testable criteria that passed, as a percentage. Treat a low `score` as a prompt to fix the story, not as a grade to report.

Every story also gets a `definitionOfDone`: "Code reviewed, all acceptance criteria pass, unit tests written and passing, documentation updated".

## Acceptance criteria

Three Given/When/Then criteria per story, as `ac_<storyIndex>_<criterionIndex>`:

- Index 0 carries `priority: must`; indices 1 and 2 carry `should`.
- Each has `format: 'Given/When/Then'`, `passed: false`, and a `storyIndex` linking back to the owning story.
- The `given` / `when` / `then` text is generated from role, trigger, and outcome patterns. Generated criteria are a scaffold: they prove the section exists and force the team to argue about behaviour, but they are never the criteria you ship with. Replace every `given` with the real preconditions, every `then` with an observable assertion.

A criterion that cannot fail is not a criterion. "Then the system is fast" is not testable; "Then the p95 response is under 2000 ms for 95% of requests in a 10-minute load test" is.

## Technical requirements

The skill emits six functional requirements (`fr_1`–`fr_6`): authentication, authorization via role-based access control, data persistence with timestamps, search with filtering and sorting, notifications on state change, and audit logging of critical operations. Authentication, authorization, persistence, and audit are `must`; search and notifications are `should`.

Six non-functional requirements (`nfr_1`–`nfr_6`) ship by default:

| Id | Category | Requirement | Priority |
| --- | --- | --- | --- |
| `nfr_1` | Performance | Page load under 2 seconds at p95 | must |
| `nfr_2` | Availability | 99.9% uptime during business hours | must |
| `nfr_3` | Scalability | Support 10x current user load with horizontal scaling | should |
| `nfr_4` | Security | TLS 1.2+ for all data transmission | must |
| `nfr_5` | Accessibility | WCAG 2.1 AA | must |
| `nfr_6` | Compatibility | Latest two versions of Chrome, Firefox, Safari, Edge | should |

These are house defaults. They are a good starting posture and a poor specification: "10x" needs a current baseline to be meaningful, and "business hours" needs a definition. Confirm each against the real product before treating it as a commitment.

## Data model

`dataRequirements` carries three entities by default, each with typed attributes and privacy classification:

- `entity_user` — `id` (UUID, unique), `email` (string, unique), `name`, `role` (enum), `createdAt` (timestamp). Privacy `PII`, retention `active_period`.
- `entity_entity` — `id`, `ownerId` (foreign key to `user.id`), `name`, `status` (enum), `metadata` (json). Privacy `business`, retention `active_period`.
- `entity_action` — `id`, `entityId` (FK to `entity.id`), `userId` (FK to `user.id`), `action`, `timestamp`. Privacy `audit`, retention `7_years`.

Relationships: user → entity (one-to-many), entity → action log (one-to-many), user → action log (one-to-many). The privacy block lists PII fields (`user.email`, `user.name`), `encryption: at_rest_and_transit`, `retentionPolicy: per_entity_retention`, and `anonymization: automatic_after_retention`.

`entity_action` with a 7-year retention is the audit requirement (`fr_6`) expressed as schema. Do not drop it when the feature is scoped down; an append-only action log is what makes an incident review possible six quarters later.

## UX and accessibility

Two flows: `flow_1` (Primary User Flow — authenticate, reach the main interface, perform the primary action, review results, save or discard) and `flow_2` (Secondary Flow — navigate, review, filter, export or share). Each declares `entryPoint`, `steps`, `exitPoint`, `errorHandling`, and `states` (`idle`, `loading`, `success`, `error`, `authenticated` for the primary; `idle`, `loading`, `editing`, `viewing` for the secondary). Enumerate the states; the empty, loading, and error states are where most of the real defects live.

Three UI components ship by default — a dashboard, a data table, and a settings panel — each with `accessibility: WCAG 2.1 AA` and an explicit `states` list. The top-level `uxRequirements.accessibility` is fixed at WCAG 2.1 AA.

## Dependencies, risks, and open questions

- `dependencies.internal` — service, data, and API prerequisites, all `status: required`.
- `dependencies.external` — identity provider and cloud provisioning, both `status: pending` with `impact: blocks`. Anything with `impact: blocks` and status `pending` is a schedule risk, full stop.
- `risks[]` become `risk_<n>` with `severity: medium` and a `mitigation` of "TBD - risk assessment during planning". Fill the mitigation in; a risk without a mitigation is a worry.
- `assumptions[]` become `assumption_<n>` with `validated: false`. Assumptions are the first things to attack in review, because everything downstream rests on them.
- `openQuestions[]` become `question_<n>` with `status: open` and `resolution: null`. A PRD with an empty open-questions list is usually a PRD where the questions were not asked.

## Rollout plan

Three phases, each with `featureFlags`, entry `criteria`, `duration`, and a `rollback` instruction:

| Phase | Audience | Flags | Exit criteria | Rollback |
| --- | --- | --- | --- | --- |
| `phase_1` Alpha | Internal team | `prd_core_v1` | All acceptance criteria pass, internal beta tested | Disable `prd_core_v1` |
| `phase_2` Beta | 5–10% of external users | `prd_core_v1`, `prd_analytics_v1` | 95% of criteria pass, no P0 bugs | Disable `prd_analytics_v1`, notify beta users |
| `phase_3` GA | All users | all three flags | All criteria pass, monitoring dashboards active | Disable all flags, redeploy previous version |

Strategy is "phased rollout with feature flags for gradual exposure and easy rollback". Every flag must be independently disableable in under the rollback window you claim. If a phase takes four weeks, a rollback that needs a deploy is not a rollback — it is a mitigation.

`releaseCriteria.definitionOfDone` is "All acceptance criteria pass, code reviewed, tested, documented, and deployed to production with monitoring", and `releaseCriteria.featureFlags` carries the GA flag set.

## A story written properly

The generated version and the shipped version of the same story, for contrast:

**Generated**: "As a end user, I want export and filter and select so that solve the core problem effectively."

**Shipped**: "As a finance analyst, I want to export a filtered transaction list to CSV so that I can reconcile it against the general ledger without copying values by hand."

What changed: the role is specific, the action is one thing rather than three, the benefit names the job rather than the problem, and the criterion is falsifiable. The generator's heuristics found the template shape and produced something structurally valid and completely unusable — which is the point of the scaffold.

## Review checklist

Run this before the PRD circulates. Each failure is a line edit now and a week of argument later.

- [ ] The problem statement names a person, a frequency, and a cost.
- [ ] `nonGoals[]` is non-empty and someone will recognise their pet idea in it.
- [ ] Every `successMetrics[]` entry has a number, a direction, a baseline, and a date.
- [ ] Every story passes all six INVEST checks, including the 25-word test.
- [ ] No `given` still reads "Given the user is on the main interface".
- [ ] Every `then` is an observable assertion that can fail.
- [ ] Each `nfr` threshold is confirmed against the real product, not inherited.
- [ ] PII fields, retention windows, and encryption are stated for every new entity.
- [ ] Every UI component enumerates empty, loading, and error states.
- [ ] `ext_dep_*` items with `impact: blocks` have an owner and a date.
- [ ] Every `assumption_*` has been either validated or explicitly accepted as an assumption.
- [ ] Every `risk_*` has a real mitigation, not "TBD".
- [ ] Every `question_*` is either resolved or accepted as blocking.
- [ ] Every feature flag in the rollout plan is independently disableable within its phase's stated duration.
- [ ] The rollback path has been rehearsed, not just written.

## Configuring this

The story count bounds (3 and 15), the 25-word INVEST smallness test, the functional and non-functional requirement sets, the three entities, the two flows, the three phases and their percentages are defaults in the `write-prd` generator, not per-product settings. An operator overrides them by persisting the assistant's configuration for the `write-prd` skill — the runtime merges each skill's `configSchema` defaults with saved values — so teams that have a real house standard for p95 latency, availability, browser support, or retention can pin it there instead of editing every generated document. Treat the generated PRD as a first complete draft: the value the skill adds is the section skeleton and the completeness check, and the value you add is every target, threshold, and mitigation it leaves as a placeholder.
