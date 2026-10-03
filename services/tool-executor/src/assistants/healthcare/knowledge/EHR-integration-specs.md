# EHR Integration Specifications

This handbook is the integration reference for the five lower-order tools in the Clinical Practice & Care Operations Assistant: Records & Scheduling Ops, Resource Coordination, Patient Communication, and the intake and referral dispatchers that sit above them. It records the wire-level conventions those tools assume, the resource vocabularies they expose, and the pagination, identity, and audit patterns that keep an EHR connection defensible. The assistant does not embed a vendor client; it speaks through a configured endpoint with a declared provider, so everything vendor-specific is expressed as configuration.

## The connector surface

| Tool | System and action | Endpoint config key | Credential | Timeout |
| --- | --- | --- | --- | --- |
| Records and Scheduling Ops | `healthcare` / `records-scheduling` | operations endpoint key | bearer `token` | 60 s |
| Resource Coordination | `healthcare` / `resource-coordination` | resource endpoint key | bearer `token` | 60 s |
| Patient Communication | `healthcare` / `patient-communication` | communication endpoint key | API key header | 60 s |
| Intake dispatcher | inline `fetch` | `endpointUrl` | optional `accessToken` / `token` | none |
| Referral coordinator | delegates to the three above | `endpointUrl` | `accessToken` | none |

Each connector declares a `provider` enum for the system behind it: `epic`, `cerner`, `allscripts`, `athenahealth`, and `custom` for records and scheduling; `teletracking`, `central-logic`, `awarepoint`, `referral-md`, `kyruus`, and `custom` for resource coordination; `twilio`, `sendgrid`, `mailgun`, `patient-portal`, and `custom` for communication. Where the assistant's connector predates current vendor branding, the mismatch is resolved through `custom` rather than by loosening the enum.

Every connector declares `confirmBeforeSend` and exposes `dryRun` defaulting to true. A live mutation is only attempted when `dryRun` is explicitly false. The 60-second timeouts on the three connectors are generous for a REST call and are really a ceiling on a slow upstream; a request that hits them has not been proven failed and must not be treated as such.

## Record type vocabulary

The Records and Scheduling connector accepts a `recordType` select. These map onto FHIR R4 resource types as follows:

| `recordType` | FHIR R4 resource | Notes |
| --- | --- | --- |
| `encounter` | `Encounter` | The visit shell; class and period are authoritative |
| `diagnosis` | `Condition` | Use `clinicalStatus` for active versus resolved |
| `medication` | `MedicationRequest` | Distinguish an order from `MedicationStatement` for reconciliation |
| `allergy` | `AllergyIntolerance` | `criticality` and `verificationStatus` must survive the round trip |
| `immunization` | `Immunization` | Series and status are not optional in practice |
| `procedure` | `Procedure` | Carries the performed date, not the ordered date |
| `vital` | `Observation` with a vital-sign profile | Use LOINC codes; free-text names are not interoperable |
| `lab` | `Observation` or `DiagnosticReport` | Report-level and result-level are distinct resources |
| `imaging` | `ImagingStudy` plus `DiagnosticReport` | The study identifies, the report interprets |
| `note` | `DocumentReference` or `Composition` | Narrative content, not structured data |

Tags applied through the `tagType` select map to a comparable faceted classification: `diagnosis`, `procedure`, `medication`, `social`, `quality`, `research`, and `custom`. Keep `research` and `quality` separated from clinical tags; conflating them makes cohort extraction unreliable and puts research-purpose data into a clinical surface.

## HL7 v2 message shapes

Where a target system is HL7 v2 rather than FHIR, the same logical content arrives in segments:

| Workflow | Message | Key segments |
| --- | --- | --- |
| Admit / transfer / discharge | ADT^A01, A02, A03, A08 | MSH, EVN, PID, PV1, AL1 |
| Appointment booking | SCH | MSH, SCH, RGS, AIS/AIP, PID |
| Order entry | ORM^O01 | MSH, ORC, OBR, ODT, SPM |
| Order acknowledgement | ORR^O02 | MSH, ORC, OBR |
| Results | ORU^R01 | MSH, PID, OBR, OBX, NTE |
| Scheduling request | SIU^S12 | MSH, SCH, RGS, AIS |
| Patient merge | ADT^A34 | MSH, PID-3, PID-5 |

Practical requirements when speaking v2:

- MSH-9 carries the message type and trigger event; MSH-12 carries the version ID. Never negotiate below 2.5.1.
- Names are components, not strings: PID-5 has family, given, middle, suffix, and prefix. The family name in XPN-1.2 is not interchangeable with a display name, and collapsing them is the usual cause of duplicate-patient records.
- Dates use YYYYMMDD with optional time; HL7 timestamps are not ISO 8601. Convert at the boundary, not in the business logic.
- ACK handling: an application-level ACK with an AA or AE code is a receipt, not a success. A CR code is a reject and must be surfaced.
- Patient identity across facilities needs the assigning authority in CX components, not just the identifier. An MRN without its namespace is not an identifier.
- Escape and repetition characters must be escaped in free-text fields. An unescaped field separator in a message field truncates or corrupts the message, and clinical narrative is exactly the content likely to contain one.

## FHIR R4 resource set for a care-coordination assistant

Beyond the record types above, the coordination paths use:

- `Patient`, `Practitioner`, `PractitionerRole`, `Organization` for identity and roster.
- `Appointment`, `Schedule`, `Slot`, `SlotSearch` for booking and availability.
- `Coverage` for the insurance object the referral matcher consumes.
- `Location`, `HealthcareService` for the resource pool.
- `CarePlan`, `CareTeam`, `Goal` for the care-plan briefing domain.
- `Provenance` and `AuditEvent` for record-change lineage.
- `Task` for the to-do state machine behind intake and referral queues.
- `Consent` and `CommunicationRequest` for the authorisation to message a patient.

`Coverage` deserves a note: network and plan information drives referral matching, and its structure varies more than any other resource in this set. Treat the matching fields as opaque and pass them through rather than parsing them into a local model.

## SMART on FHIR and authorisation

For FHIR-facing deployments, the practical authorisation model is SMART App Launch 2.0, with backend-services authorisation for server-to-server access.

- Public clients use authorisation code with PKCE; backend services use the client-credentials grant with asymmetric client authentication.
- Scope format is `patient/*.read`, `user/*.read`, `launch/patient`, and the corresponding `.write` or `.cruds` suffixes.
- `patient/*.read` grants access across the patient's data as authorised; `user/*.read` grants access to data the authenticated user may already see. Choosing `user` over `patient` is the right default for a workforce tool and materially narrows blast radius.
- Every request to a FHIR server requires an `Accept: application/fhir+json` header. Omitting it yields HTML in some deployments and a confusing parse failure downstream.
- `Prefer: return=minimal` is appropriate for writes where the response body is not consumed.
- A write followed by a read-back should be treated as an optimisation, not a requirement; some servers are eventually consistent and an immediate read-back will occasionally report a stale state.

## Pagination and result limits

The records and scheduling connector uses offset pagination with `limit` defaulting to 50 and `offset` defaulting to 0, and the configuration field `maxPageSize` caps the page a connector will request. The referral coordinator's `maxResults` for resource candidates is bounded between 1 and 50 with a default of 10, and the handler clamps out-of-range values rather than rejecting them.

Two operational notes. Offset pagination drifts on a live dataset; when a connector supports cursor-based continuation, prefer it and treat `offset` as a compatibility path. And a `limit` that silently truncates is a data-loss risk in a clinical context: a search returning exactly `limit` rows should be flagged as possibly incomplete rather than reported as the full match set.

## Intake payload and queue derivation

The intake dispatcher builds a canonical payload when the caller does not supply one. The field names are fixed:

| Payload key | Source | Type |
| --- | --- | --- |
| `providerId` | `provider` | string or null |
| `appointmentType` | `appointmentType` | string or null |
| `facilityId` | `facility` | string or null |
| `startTime` | `startTime` | ISO 8601 or null |
| `endTime` | `endTime` | ISO 8601 or null |
| `reasonForVisit` | `reasonForVisit` | string or null |
| `symptoms` | `symptoms` | string array |
| `urgency` | `urgency` | `unknown`, `routine`, `urgent`, `emergency` |

`urgency` defaults to `unknown` and `emergency` short-circuits to `safety-escalation` before any dispatch is attempted.

Documentation completeness is computed by set difference: `missingDocumentation` is every entry in `requiredDocuments` that is not present in `documents`. Queue position is derived as `pendingIntakeIds.length + 1` when the caller does not supply `queuePosition` explicitly, and reported as not determined when neither is available. Route resolution falls back through `route`, then `provider`, then `facility`, then the literal `unassigned`.

The `unassigned` literal is worth flagging in any operational report: a dispatch that resolves to `unassigned` has been sent somewhere that will not route it, and the fallback chain means an empty provider and facility field produces a successful live call that nobody receives. Validate routing before dispatch rather than after.

## Error handling semantics

| Condition | Returned status | Operator action |
| --- | --- | --- |
| Endpoint not configured | `not-connected` | Configure the endpoint; nothing was staged or sent |
| Emergency urgency | `safety-escalation` | Use the clinician-approved emergency pathway |
| Live requested without confirmation | `confirmation-required` | Re-run with explicit confirmation |
| Upstream non-OK HTTP | `error` with the status code | Investigate upstream; the write may or may not have committed |
| Network failure | `error` with the transport message | Safe to retry only after confirming idempotency |
| Missing required input | `not-connected` with an input-required notice | Supply the missing fields |

The ambiguity in row four and row five is the one that matters. Neither path retries automatically, and neither can distinguish "the request never arrived" from "the request committed and the response was lost". For a non-idempotent write the correct recovery is a read-back against the upstream record, not a blind retry.

## Audit and record integrity

The records and scheduling connector exposes `auditLogging`, defaulting to true. When it is on, every create, update, tag, and scheduling mutation should produce a durable audit entry containing the acting user, the resource, the change, and the timestamp. In a FHIR backend that maps to `AuditEvent` on read and write access and `Provenance.target` on record creation and update.

Two integrity rules worth stating explicitly. First, `updatedAt` on local records is an ISO 8601 instant in UTC; a local store is not the system of record and must never be presented as one. Second, a non-OK HTTP response is not a partial success.

## Testing a connection

A connector should be brought up in this order, because each step depends on the previous one and the failure modes are different:

1. **Authentication.** A 401 or 403 confirms the credential and the scope, and nothing else. Fix this first because every other failure is ambiguous until auth is known good.
2. **Read path.** A non-mutating search exercises the endpoint, the mapping, and the pagination without touching a record.
3. **Schema conformance.** Confirm the resource shapes the connector expects are present, particularly `verificationStatus` on allergies and `clinicalStatus` on conditions.
4. **Time and timezone.** Verify `defaultTimezone` against a known appointment and against a DST boundary. Time errors are silent and produce wrong records rather than errors.
5. **Write path in dry-run.** Then one live write with an immediate read-back.

## Configuring this

The page size, result caps, provider enums, default facility, default timezone, and audit-logging switch are deployment settings carried in each connector's `configSchema` and persisted with the assistant. Endpoint URLs, credential bindings, matching and forecasting toggles, and the `maxAllocationHours` allocation horizon on the resource coordination connector are configured the same way, with credential values resolved from the secret store rather than stored in configuration. The dry-run default, the confirmation requirement, and the emergency-urgency interlock are behavioural defaults of the dispatchers themselves and are not intended to be disabled by an operator; a site that needs a different confirmation model should change the skill rather than the flag.
