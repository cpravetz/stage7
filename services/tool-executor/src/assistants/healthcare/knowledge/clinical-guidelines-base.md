# Clinical Guidelines Base and Evidence-Grading Conventions

This handbook defines how the Clinical Practice & Care Operations Assistant handles the guideline inputs it is given and how it turns them into provider-facing output. The assistant does not carry a clinical guideline corpus and does not generate one: it receives `guidelines` as a caller-supplied structure and performs a transparent keyword-relevance ranking over it. Understanding that boundary is the point of this document, because most misuse of decision support comes from treating a ranked list of supplied pathways as if it were a clinical recommendation.

Nothing in this domain replaces a licensed clinician. Every output is decision support and education only, and a qualified professional governs any real clinical decision.

## What the decision-support evaluator actually computes

Input shape for the evaluator is a `patient` object with `age`, `symptoms`, and `history`, plus a `guidelines` array whose entries carry `name`, `keywords`, `pathway`, and `evidenceLevel`. Both are required; missing either returns `not-connected` with an input-required notice rather than a partial answer.

The computation is deliberately simple and fully inspectable:

1. Every supplied symptom is tested against a red-flag pattern covering chest pain, difficulty breathing, stroke, severe bleed, unconsciousness, and suicidal ideation. Matches are collected into `redFlags`.
2. Each guideline's `keywords` array is tested for substring containment against each symptom, case-insensitively. The number of matching symptoms is that guideline's `relevance` score.
3. Guidelines are sorted by `relevance` descending, then alphabetically by name for stable output.
4. `escalation` is set to urgent clinician or emergency-pathway review when any red flag matched, and routine clinician review otherwise.

The returned `considerations` array carries every guideline scored, including zero-relevance ones, with a `guideline`, `relevance`, `pathway`, and `evidenceLevel` field each. Guidelines with a missing `evidenceLevel` are labelled `not supplied`; a missing `pathway` becomes `clinician review required`. Those defaults are the tell that nothing here was independently verified.

Because relevance is a keyword-overlap count and not a clinical likelihood, a guideline with three loosely related keywords can outrank a precisely matched one. The `patientSpecificConsiderations` string states the arithmetic explicitly so a reviewer can see what drove the ranking.

Two properties of the matching follow from using substring containment. A keyword such as "pain" matches inside "painless", and a keyword that is a common English word matches unintended symptom text. Keyword curation is therefore a clinical task, not a clerical one, and the skill that consumes them needs someone to own the list.

## Evidence grading vocabulary

`evidenceLevel` is a caller-supplied free-text field. Supply it using a recognised scheme so the clinician reading the output can interpret it. The conventions in common use:

| Scheme | Levels | Typical source |
| --- | --- | --- |
| GRADE | High, Moderate, Low, Very low | GRADE Working Group; guideline panels adopting it |
| Oxford CEBM | 1a through 5 | Oxford Centre for Evidence-Based Medicine |
| AACE / AOA task-force grades | A, B, C, D, E | Endocrinology and orthopedic specialty societies |
| ACP guideline grades | Strong, Moderate, Weak | American College of Physicians |
| USPSTF | A, B, C, D, I | Preventive Services Task Force |

Two habits matter more than the specific scheme. First, record the publication or update year alongside the level, because graded recommendations are frequently retired without a formal retraction. Second, treat a level as a property of the recommendation rather than of the whole document: a single guideline can carry a grade-A screening recommendation and a grade-C pharmacotherapy recommendation simultaneously.

The distinction between **certainty of evidence** and **strength of recommendation** is the one most often lost in transmission. GRADE rates certainty as high, moderate, low, or very low and strength as strong or conditional. A strong recommendation can rest on low-certainty evidence when the consequence of being wrong is severe and the intervention is low-harm; that is exactly the shape of an urgent referral recommendation, and it is why evidence grade alone must not drive escalation decisions.

## Guideline maintenance

A guideline set that is not versioned becomes a liability, because a pathway quoted six months after it was superseded is worse than no pathway. For each entry carried into the `guidelines` array, record:

- The issuing body and the exact document title, not a shorthand.
- The publication or last-review date, and the next scheduled review if the body publishes one.
- The evidence level for the specific recommendation, not for the document.
- The population the recommendation applies to, since most graded recommendations are conditional on age, stage, comorbidity, or pregnancy status.
- Whether it is current, under review, or superseded.

The superseded case is the one the assistant cannot detect. Nothing in the schema carries a validity window, so a retired recommendation scores and ranks exactly as a current one does. Currency is a property of the supply pipeline, not of the evaluator.

## Red flags and urgency stratification

The Clinical Decision Support tool applies a second, independent urgency function that considers vital signs rather than text alone. Its thresholds classify a presentation as `critical` when any of the following holds:

- Systolic blood pressure above 180 or below 80 mmHg
- Heart rate above 130 or below 40 BPM
- Temperature above 40 or below 35 degrees Celsius
- Any critical-sign symptom string: chest pain, shortness of breath, severe bleeding, loss of consciousness, or stroke symptoms

A critical-sign symptom without a vital-sign breach is classified `urgent`. Everything else is `routine`. The tool's inputs are `vitalSigns` with `bloodPressureSystolic`, `bloodPressureDiastolic`, `heartRate`, `temperature`, `respiratoryRate`, and `oxygenSaturation`; the two not used in the urgency function are still carried into the stored decision for the reviewing clinician.

These are screening defaults, not clinical criteria of care. They exist to force escalation of a clearly unstable presentation to human eyes. They do not identify emergencies the pattern does not match, and a `routine` result is not a clearance. A negative screen on a presentation that the clinician already suspects is a serious problem must not be allowed to lower their concern.

## Differential and risk output

The `includeDifferential` and `includeRiskScore` inputs default to true. The `reasoningDepth` select takes `brief`, `standard`, or `comprehensive`. In every case the emitted `differentialDiagnoses` entries carry a single placeholder condition string and a confidence of zero, with the caveat that differential diagnosis requires professional clinical assessment. That is the intended shape: the tool structures the question, records the inputs, and refuses to answer it. A downstream consumer that treats a populated `differentialDiagnoses` array as a real candidate list is misreading the contract.

`riskFactors` map to `riskFlags` entries, each marked `requires-review`. `recommendedActions` is fixed to consultation with a qualified healthcare professional, and `safetyCaveats` always includes the limitation that negative results do not rule out disease.

Decisions are persisted under the decision-support store path and accumulate. Two operational consequences: the store holds patient-context records and belongs inside the retention and access-control program described in the compliance handbook, and an accumulation of past decisions should not be read as a patient history without review, because the `id` field is timestamp-derived and carries no encounter linkage.

## Care-plan briefing construction

The care-plan co-pilot takes a `condition` (or the alternate `careNeed` label), `goals`, `medications` with clinician-supplied `instruction` text, `educationTopics`, and an optional `followUp` interval. All of `condition`, `goals`, and `educationTopics` are required.

The output is structural, and the code comments say so directly:

- `goals` are ranked in supplied order with a placeholder `measure` of patient-reported or clinician-defined target.
- `medications` are copied verbatim. A medication with no instruction is rendered with `verify the instruction with the prescribing clinician`.
- `education` topics are listed verbatim with a `format` of plain-language briefing and a note that a human clinician should explain each. No explanatory prose is generated.
- `briefing` carries `purpose`, a `medicationSafety` string, and two `teachBack` prompts: describing the plan in the learner's own words, and naming questions or concerns for the care team.
- `disclaimer` and `safetyBoundary` are always attached.

The medication handling is deliberately non-generative. The tool does not restate a dose, does not infer a schedule, does not check an interaction, and does not adjust anything. A clinician who supplies an incomplete instruction gets an explicit verification prompt rather than a plausible completion, which is the correct failure mode here.

## Teach-back as the safety mechanism

Teach-back is what makes the briefing safe: the co-pilot does not explain the topics, it produces the structure a clinician uses to run a teach-back conversation and confirm comprehension. The practice that makes it work:

- Ask for the explanation in the patient's own words, never "do you understand?".
- Do not correct during the explanation; note the gaps and re-explain afterwards.
- Chunk it. Three topics verified separately beats six verified together.
- Close with the question the briefing already contains: what questions or concerns should the care team address? It surfaces the unasked thing, which is the one most likely to cause a missed instruction.
- Re-ask at the next contact rather than treating a single teach-back as durable.

Education topics should be prioritised by what the patient must do rather than by what the condition involves. A topic that does not change a patient action is usually not worth a briefing slot.

## Workflow thresholds

The clinical practice workflow evaluator classifies each `locationMetrics` row into exactly one bottleneck, in this precedence order:

| Bottleneck | Condition | Default threshold | Recommendation emitted |
| --- | --- | --- | --- |
| `access` | `avgWaitMinutes` exceeds the wait threshold | 30 minutes | Review access capacity and wait-time handoffs |
| `billing` | `billingDelayDays` exceeds the delay threshold | 7 days | Review billing-cycle delays and follow-up ownership |
| `retention` | `noShowRate` exceeds the no-show threshold | 15 percent | Review no-show outreach and scheduling flexibility |
| `none identified` | No threshold exceeded | — | No recommendation |

Precedence matters: a row breaching both the wait and billing thresholds is classified `access` only. Utilisation is `completed` over `scheduled` as a percentage, and the no-show rate is `noShows` over `scheduled`; both are computed to two decimal places. A row with zero scheduled appointments yields 0 for both rather than a divide-by-zero. The set summary reports totals for scheduled, completed, and no-shows alongside unweighted averages of the per-location rates, which means a large clinic and a small clinic weigh equally in the averages.

Recommendations are deduplicated at the set level: a single access bottleneck anywhere produces one access recommendation regardless of how many locations breached. The report also states the thresholds it applied, so a reader can tell whether a location cleared 29 minutes or 31.

These are operational thresholds, not clinical ones. No output of this skill makes any claim about a patient, a diagnosis, or a treatment, and it says so in the safety boundary appended to the report.

## Operational analytics periods

The operational analytics tool accepts `period` values of `7d`, `30d`, `90d`, `YTD`, and `1y`, and resolves them to an inclusive start date relative to now. Any unrecognised value falls back to 30 days. `granularity` takes `day`, `week`, `month`, or `quarter` and is reported alongside the results but does not currently re-bucket the underlying records. The KPI blocks returned are `patientVolume`, `averageLengthOfStay`, `bedOccupancy`, and `throughput`, each computed from records whose `type` field matches, with `total`, `average`, `count`, `min`, `max`, and a first-to-last percentage `trend`.

The `trend` figure is the weakest of these and should be labelled as such. It compares the last record in the slice to the first, so it is sensitive to two outliers, to the granularity of the underlying records, and to a partial final period. It is a directional indicator, not a rate of change.

## Configuring this

The 30-minute wait threshold, 7-day billing delay, 15 percent no-show rate, minimum evidence source count, default briefing language, and 30-day default analytics period are defaults. Operators override the thresholds and the `minimumEvidenceSources` and `requireClinicianReview` flags through the persisted configuration of the workflow evaluator and the decision-support evaluator, and the care-plan language and review flag through the co-pilot's own configuration. The 15 percent no-show rule and the vital-sign urgency cutoffs are currently inlined rather than exposed as configuration fields, so a site that needs different values should raise that with the platform team rather than assuming a setting exists. The guideline records themselves are supplied per call; the assistant holds no clinical content of its own to be tuned.
