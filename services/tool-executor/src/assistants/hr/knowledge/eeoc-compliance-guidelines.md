# EEOC and Fair Employment Compliance Guidelines

This handbook is the internal compliance reference for the Human Resources & Talent Acquisition Assistant. It maps the statutes and guidance that govern recruitment decisions onto the checks the Compliance Audit Check performs, states what the assistant can and cannot conclude from a record, and describes the practices that keep an automated hiring process defensible when it is examined. This is operational guidance for building and reviewing a process; local employment law, collective bargaining agreements, and counsel govern every actual determination, and a finding surfaced by this assistant is a prompt for that review, never a legal conclusion.

## Statutes the assistant's checks map to

| Statute | Covers | Signal in the audit check |
| --- | --- | --- |
| Title VII, Civil Rights Act | Race, colour, religion, sex, national origin, and discrimination because of pregnancy | Discrimination predicate language in a decision record |
| ADEA | Age 40 and over, including mandatory retirement | A decision whose reason is recorded as age |
| ADA | Disability, and reasonable accommodation of disability | Accommodation language absent from a rejection |
| GINA | Genetic information | Inadvertent collection of family or genetic history pre-offer |
| PWFA | Religion, including sincerely held religious observance or practice | Scheduling or shift-assignment constraints overriding religious needs |
| Equal Pay Act | Sex-based wage differences for equal work | Compensation fields inconsistent across protected groups |
| USERRA | Uniformed service members' reemployment rights | Deployment or leave gaps in the timeline |
| Title V of the LMRDA | Organisational and political union activity | Adverse treatment after union activity |

Fourteen federally protected characteristics fall under Title VII's employment discrimination provisions, with additional protection for sex-based stereotyping, sexual orientation, and gender identity. Age is protected separately by the ADEA and only from age 40, which is a distinction that most automated screening handles badly.

## What the Compliance Audit Check actually looks for

The monthly audit reads each record in the compliance store and emits findings in three patterns:

| Pattern | Condition | Finding text |
| --- | --- | --- |
| Posting without EEO language | A record has a `posting` object with no `eeoStatement` | Missing EEO statement in job posting |
| Consent gap | A record has a non-empty `data.sensitiveFields` array and no `data.gdprConsent` | GDPR consent not recorded for candidate data |
| Age-based decision | A record's `decision.reason` equals `age` | Decision based on age — potential ADEA violation |

The output is a `check` object with `findings`, a `compliant` boolean derived from whether findings is empty, and `totalChecked`. It reports only three indicators.

Read this narrowly. The audit is a **recall** check — it finds known bad patterns — and not a **precision** check. A clean report does not mean the process is lawful; it means these three patterns were not present in the records supplied. The report says so explicitly: it is generated locally, no external legal database is consulted, and scope is limited to the checked records. Any finding is a flag for a human reviewer, not a determination of violation, and a substring or field-shape match carries no inference about intent.

The third check is the sharpest illustration. `decision.reason === 'age'` fires on a recorded reason string, whatever the intent behind it. A genuine age-based exclusion is a potential ADEA violation; a poorly worded free-text field that happens to contain the word can produce the same finding. Treat the finding as "this record needs a human look".

## Disparate impact analysis

Disparate impact is where an apparently neutral criterion produces a different effect on a protected group. The Uniform Guidelines on Employee Selection Procedures use the four-fifths rule as a screening threshold.

For each protected group in each selection stage, compute the selection rate: selected from the group divided by available in the group. Compare each group's rate to the highest group's rate.

- Four-fifths rule: if a group's selection rate is less than 80 percent of the highest group's rate, that stage warrants investigation.
- Statistical significance: a four-fifths result is a trigger, not a finding. Apply a chi-square or Fisher's exact test to determine whether the difference is unlikely under random variation, and note practical significance alongside statistical significance.
- Sample size: a four-fifths result from 3 candidates in a group is not evidence of anything. Statistical power depends on cell counts, so small pipelines need to be reviewed qualitatively.

The four-fifths rule is a screening heuristic adopted under the Uniform Guidelines. It is not a safe harbour — a selection rate can clear 80 percent and still be unlawful — and a pipeline with no recorded group information cannot be analysed at all. That last point is why collecting voluntary self-identification, separately from the application and with proper consent, is a prerequisite for the analysis rather than an optional nicety.

## Selection-procedure validity

Every assessment used in hiring should have a documented job-relatedness and business-necessity rationale. The framework that works:

1. **Job analysis.** Define the actual requirements of the role before defining how it is measured.
2. **Content validity.** Does the criterion represent the construct it claims, with the knowledge and behaviours the role genuinely requires?
3. **Criterion-related validity.** Does the procedure predict a relevant job outcome? Structured interviews and work samples are the best-supported predictors in the meta-analytic literature; unstructured interviews sit well below them.
4. **Construct validity.** Does the test measure the theoretical trait it names, or something narrower?
5. **Fairness and adverse impact analysis.** Documented as above.
6. **Documentation and review.** Record the analysis, its date, and the population it applies to, and revisit it.

The Uniform Guidelines distinguish two impact standards. Under the four-fifths rule, an adverse impact finding is one where a protected group's rate is below four-fifths of the highest rate. Under the bottom-line rule, a selection rate for a protected group is less than four-fifths of the rate for the population as a whole. Both belong in the analysis; they answer different questions.

## Disability and medical inquiry boundaries

The ADA's pre- and post-offer split is the single most commonly mishandled boundary in automated screening:

- **Before a conditional offer**, an employer may not make a disability-related or medical inquiry of a job applicant, and may not require a medical examination. Disability-related information collected before a conditional offer is limited to asking whether the applicant can perform the essential functions of the job.
- **After a conditional offer**, the employer may make a disability-related inquiry and require a medical examination if all applicants in the same category are asked.
- Any medical examination or inquiry must be job-related and consistent with business necessity.

Practical consequences: an automated screen must not request medical history, disability status, accommodation need, or a diagnosis in its intake fields. Pre-employment tests of a medical or fitness character are examinations and need the same justification.

The interactive process — the obligation to engage in a good-faith conversation about a requested accommodation — is a documented human conversation and is not something an assistant can run. What the assistant must not do is block an application because the accommodation pathway was not engaged, which is the most common way a well-meaning intake form creates a violation.

## Protected-class information handling

Voluntary self-identification data is the most sensitive category the recruiting function holds. Handling rules that hold across jurisdictions:

- Collect it separately from the application, in a system with narrower access than the ATS.
- Never expose it to the hiring manager or the interview panel, in the requisition, in the scorecard, or in the interview kit.
- Do not display it on the candidate-facing status page.
- Never key a decision to it. Race, sex, age, disability, and veteran status are only ever used in aggregate reporting.
- Report it only in aggregate, at a threshold cell count, so a small group cannot be re-identified.

A keyword screen is not a safe filter for protected-class terms. Names, accent, photograph, graduation year, and education pedigree are all proxies for race or national origin, and using them produces disparate impact whether or not the intent was discriminatory. The hiring analytics skill's diversity counters are the intended shape of this data in aggregate: counts of records carrying a diversity category against a total, with no linkage from a record to a decision.

## GDPR and other privacy regimes

Where EU or UK GDPR applies, candidate data needs a lawful basis, and consent is one option rather than the default for employment processing. Two distinct requirements apply:

- **Lawful basis** for processing, documented and disclosed in the privacy notice.
- **Consent**, freely given and specific, for the categories of data that require it. Withdrawal must be as easy as giving.

`sensitiveFields` is the field the audit treats as triggering the consent check. In GDPR terms these are special-category data under Article 9 — health, biometric, racial or ethnic origin, political opinions, trade-union membership, genetic data, and sex life or orientation — and processing them requires an Article 9 condition in addition to the Article 6 basis. Health-related accommodation records are the most common case in recruiting.

Retention is the other half. Candidate records must have a defined retention period and an actual deletion action. Local stores are not exempt from a deletion request, so the persisted screening, analytics, scheduling, and compliance stores all need to be inside the erasure path.

Other regimes layer on top where they are stricter: the CCPA and CPRA with their sale-or-share disclosure and deletion rights, provincial privacy law in Canada, and state and city rules including ban-the-box regimes, salary-history bans, pay-transparency duties, and limits on automated decision-making with explanation rights.

## Regulations specific to automated hiring

Recent rules apply directly to the tools in this assistant and are worth knowing about before a hiring function scales one of them:

- Bias-audit and notice requirements in several jurisdictions obligate an employer to conduct and publish an annual bias audit of its automated employment decision tools, and to notify candidates that such tools are used.
- Explanation rights mean a candidate subjected to an adverse automated decision can request an explanation of the principal reasons, and a process for human review. A keyword match score with a `gaps` list is not an explanation of the decision; the score is not the decision.
- Enforcement in several jurisdictions reaches the vendor, not only the employer, which changes who should be reviewing these systems.

The practical response is the one the design already implies: automate the parts of the process that do not make the decision, and keep the decision with a named human who can be asked to explain it.

## The compliance programme around the tool

A monthly audit is one control in a larger programme. The rest of it:

- **Ownership.** A named compliance owner for recruiting processes, distinct from the recruiting manager.
- **Training.** Annual training on protected characteristics, on accommodation boundaries, and on how the tools are used and not used.
- **Document retention.** Requisition, criteria used, assessments, interview notes, and the decision record, retained together so the process can be reconstructed.
- **Charge response.** A defined intake route, an acknowledgement obligation, and a documented preservation hold when a charge arrives. Litigation holds override deletion schedules, including the candidate-data deletion obligations above.
- **Vendor review.** Periodic review of any scoring or screening tool against the same validity and impact standards applied to an internal test.
- **Postings.** Every external and internal posting carries the equal-opportunity language, and where the state requires it the pay-transparency and benefits-disclosure language.

## Posting and record-retention hygiene

- Every external posting should carry the employer's EEO statement, the equal-opportunity employer language, and any state-required disclosure language.
- Internal postings need the same EEO statement; the audit's posting check covers either.
- Applicant records must be retained at least one year from the making of the charge for private employers under the recordkeeping rules, and federal contractors and their subcontractors under a contract of $150,000 or more generally retain for two years. Confirm the applicable period for the specific employer rather than assuming the shorter one.
- Retain the structured interview scorecards for every candidate in the pool, not only the ones hired. Selective retention is itself a failure of the documentation requirement.

## Configuring this

The monthly cadence, the dry-run flag, and the inline data override are the only tuning points the Compliance Audit Check exposes; the three indicator patterns are fixed in the skill's checking logic and are not configuration fields. In practice the deployment controls what lands in the compliance store — the screening, analytics, scheduling, and compliance stores are the sources the audit reads — so the effective coverage of the audit is a function of what the pipeline records, not of settings on the audit itself. Anything beyond these three indicators, including state and local law, works-council and collective-bargaining obligations, and individual accommodation matters, needs counsel.
