# HIPAA Compliance Standards for Care Operations

This handbook is the internal reference for how the Clinical Practice & Care Operations Assistant stays inside the HIPAA regulatory perimeter while it reviews cases, drafts care-plan briefings, and dispatches intake and referral work. The assistant's manifest carries `policies.hipaaComplianceEnforced`, which means every skill in the blueprint is expected to emit the safety boundary and an honest connection state rather than a plausible-looking result. Nothing here is legal advice: the covered entity's privacy officer, security official, and counsel own the determination, and the assistant is a control surface inside their program, not a substitute for it.

## The three rules and where they bind

| Rule | Citation | Core obligation | Where it lands in this assistant |
| --- | --- | --- | --- |
| Privacy Rule | 45 CFR Part 164 Subpart E | Permitted uses and disclosures, individual rights, minimum necessary | `patient`, `clinicalNeeds`, `insurance` inputs; `patient` identifier fields on every connector |
| Security Rule | 45 CFR Part 164 Subpart C | Administrative, physical, and technical safeguards for electronic PHI | `auditLogging`, `dryRun`, `confirmBeforeSend`, credential isolation on all five tools |
| Breach Notification Rule | 45 CFR 164.400–414 | Individual, media, and HHS notification after an impermissible disclosure | Any live dispatch path that leaves the approved endpoint boundary |

Two related regimes ride alongside these: the 42 CFR Part 2 rules for substance-use disorder records, which require a separate and stricter consent even where HIPAA would permit disclosure, and state genetic-privacy statutes that may be stricter than HIPAA. A HIPAA-permitted disclosure is not automatically a state-permitted disclosure.

## PHI, ePHI, and de-identified data

The distinctions matter because they determine which safeguards apply.

- **PHI** is individually identifiable health information, including information held by a covered entity in any form or medium. Oral statements count.
- **ePHI** is PHI maintained in electronic form. It carries the Security Rule obligations; paper PHI does not.
- **De-identified information** is PHI that has had all 18 identifiers removed and carries no actual knowledge that the remaining information could be used alone or in combination to identify the individual. De-identified information is no longer PHI and the Privacy Rule no longer applies, so the determination is worth making and worth documenting.
- **A limited data set** permits retention of dates and a limited set of identifiers but may not be used for research, and may not be disclosed to anyone outside the covered entity or a business associate without a data use agreement.

The practical note for this assistant: an output block is not de-identified by being internal. Anything rendered into a `present` body leaves the structured data model and enters a transcript, a log, and possibly a ticket. Treat every rendered narrative as a disclosure event.

## The 18 identifiers

Safe harbor under 45 CFR 164.514(b)(2) requires removing all 18 identifiers of the individual and of relatives, employers, and household members before a limited data set is released:

1. Names
2. Geographic subdivisions smaller than a state
3. All date elements more specific than a year, except ages over 89
4. Telephone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate or license numbers
12. Vehicle identifiers and serial numbers, including plates
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers, including fingerprints and voiceprints
17. Full-face photographs and comparable images
18. Any other unique identifying number, characteristic, or code

Item 18 is the one that does the work in practice, because it captures vendor-specific identifiers such as an internal patient index or a device identifier that no checklist anticipated.

The consequence for the assistant is that free-text fields are the risk surface, not structured ones. `reasonForVisit`, `symptoms`, `notes`, `clinicalContext`, and `message` all pass through to output blocks verbatim. Expect unredacted clinical narrative in those fields, and treat redaction as a pre-dispatch step rather than a downstream cleanup.

## Minimum necessary

Minimum necessary under 164.502(b) is a use-and-disclosure standard, not an access standard: the workforce may see more than it may use. In practice this drives three rules for the connector tools:

- Send the minimum field set for the operation. A referral match needs `clinicalNeeds`, `insurance`, `location`, and `specialty`; it does not need the full encounter history.
- Prefer the minimum-necessary identifier over a direct identifier. `patient` on the referral coordinator is described in the schema as a "minimum-necessary patient identifier" for exactly this reason.
- Never widen scope by convenience. A dry-run that already returns `missingDocumentation`, `queuePosition`, and `route` does not need the payload echoed back to justify the call.

Minimum necessary has two exceptions worth remembering: disclosures to or requests by the individual for their own records are not subject to it, and disclosures for treatment are not limited by it. Everything else, including payment and operations, is limited by it.

## Permitted disclosure categories

The Payment and Operations rules permit specific disclosures without further authorisation. Every one of them is narrower than its plain reading suggests, and none of them is a general-purpose exemption:

| Category | Permitted | Still required |
| --- | --- | --- |
| Treatment | Disclosure to or request by a provider for treatment | Minimum-necessary standard does not apply; authorisation not required |
| Payment | Claims, billing, and payment operations | Minimum necessary |
| Operations | Support, coordination of benefits, quality assurance, utilisation review | Minimum necessary |
| Public health | Reporting to public health authorities as required by law | As the law requires, minimum necessary |
| Law enforcement | As required by law; plus a patient-requested copy | Valid legal process, or written request |
| Judicial and administrative proceedings | As required by law or court order | Valid order or subpoena |

Authorisation is required for everything else: psychotherapy notes beyond the exception, disclosure to a family member, marketing, and sale of PHI. Marketing has its own narrow definition and authorisation requirement and is the category most often mishandled by consumer-facing integrations.

## Security Rule safeguards

| Safeguard class | Citation | Representative requirement | Assistant-relevant implementation |
| --- | --- | --- | --- |
| Administrative | 164.308 | Risk analysis, workforce clearance, training, contingency plan, evaluation | Default-dry-run posture; documented thresholds in each skill's `configSchema` |
| Physical | 164.310 | Facility access, workstation use, device and media disposal | Out of scope for a software assistant; belongs to the facility program |
| Technical | 164.312 | Access control, unique user identification, audit controls, integrity, authentication, transmission security | `auditLogging` default true; credentials held outside config; TLS-only endpoints |
| Organizational | 164.314 | Business associate contracts with subgroups | Every downstream connector is a business-associate relationship |
| Policies and procedures | 164.316 | Documentation retention and review | This document and the operator's policy set |

The `auditLogging` configuration field on the records and scheduling connector defaults to `true` and should stay there. Turning it off to reduce write volume is the single most common way a technical-safeguard gap is created accidentally.

Encryption is an addressable implementation specification under 164.312(a)(2)(iv) and (e)(2)(ii) rather than a blanket mandate: PHI at rest and in transit must be encrypted, and an addressable spec is one you must implement or document why the alternative is reasonable and appropriate. Documenting a decision not to encrypt a particular data set is itself a required artifact, not an optional note.

## Credential handling

Upstream credentials are declared as `credentialSource` entries rather than ordinary configuration fields, so the runtime resolves them from the secret store and never echoes them into an output block. The pattern holds across the blueprint:

- Records and scheduling ops, and resource coordination: bearer token under a `token` key.
- Patient communication: API key under an `apiKey` key, sent as a request header.
- Intake dispatcher: optional `accessToken` or `token`, both marked non-required.
- Referral coordinator: passes the resolved `accessToken` down to the resource coordination delegate rather than reading a secret itself.

A connector that returns a non-OK HTTP status is a normal operational event, not a privacy event, but the error path must not include upstream response bodies that might echo submitted PHI. The intake dispatcher currently returns parsed response data on failure; that is acceptable only because the payload it submitted was already minimum-necessary.

## Individual rights

Four rights have concrete system consequences and a 30-day response window in general:

| Right | Operational consequence |
| --- | --- |
| Access | An export across every store the assistant writes to, including local task and decision stores |
| Amendment | A correction workflow that identifies which downstream summaries are now stale |
| Accounting of disclosures | A disclosure log covering every dispatch outside the entity, not just the six permitted categories |
| Restriction on a disclosure | A flag honoured by every downstream connector, not only by the main system |

The access and amendment rights are the ones this assistant's storage design affects most. Local decision stores, screening artefacts, and staging records are in scope, and an amendment that does not propagate leaves a stale clinical summary sitting in a downstream system. Retention in those stores should be bounded and purgeable for the same reason.

## Breach notification mechanics

- A breach is an impermissible use or disclosure of PHI, including an unauthorised person viewing or acquiring PHI.
- Notification to the individual is due without unreasonable delay and no later than 60 calendar days after discovery.
- If 500 or more individuals are affected, contemporaneously notify the media in the jurisdiction.
- If fewer than 500 are affected, notify the Secretary of HHS annually.
- If fewer than 500 and there is a risk of harm, the covered entity may elect to notify the Secretary contemporaneously with individual notice.
- The presumption after an impermissible use or disclosure is that a breach occurred unless the risk-assessment exception is demonstrated.

The 60-day clock starts at discovery, not at confirmation. Any incident channel for this assistant should log discovery time separately from investigation time.

## Status vocabulary and honest connection states

The healthcare result contract permits `ok`, `partial`, `failed`, `blocked`, `not-connected`, `confirmation-required`, plus the domain extras `safety-escalation` and `error`. Each exists to prevent a failure from being narrated as a success:

- `not-connected` when no endpoint is configured: the intake was staged locally and nothing was sent.
- `confirmation-required` when a live dispatch was requested without `confirmation` or `confirmed` set.
- `safety-escalation` when `urgency` is `emergency`, in either the intake dispatcher or the referral coordinator. Emergency intake is never auto-dispatched; it routes to the clinician-approved emergency pathway.
- `partial` when the referral coordinator's three delegated steps split between success and failure.
- `error` when the endpoint is unreachable or returns a non-OK status.

## Safety boundary language

Every healthcare skill appends the same boundary string to its output blocks, and the referral coordinator extends it with the care-coordination clause. The operative prohibitions are: do not diagnose, do not prescribe, do not change treatment, do not make autonomous clinical decisions, do not allocate clinical resources autonomously, use only authorised minimum-necessary data and approved secure endpoints, and require review by a qualified clinician or authorised care team. A skill that produces analysis without that text is out of contract regardless of what the analysis says.

## Configuring this

The window threshold, billing-delay threshold, and evidence-count figures used by the workflow and decision-support evaluators are defaults carried in each skill's `configSchema`; operators override them per deployment through the assistant's persisted skill configuration. The connector endpoint URLs, credential bindings, `defaultFacility`, `defaultTimezone`, `maxPageSize`, and `auditLogging` flags on the five healthcare tools are likewise persisted configuration, and the credential values themselves belong in the secret store rather than in those fields. The `hipaaComplianceEnforced` policy in the assistant manifest is a declaration of intent that the runtime and validation layer check against the emitted contract, so treat any change to it as a governance decision rather than a configuration tweak.
