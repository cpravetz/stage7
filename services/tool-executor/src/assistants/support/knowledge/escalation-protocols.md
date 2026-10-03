# Escalation Protocols

How a support contact moves up a tier, who is accountable at each step, and what the `ticket-ops` tool will and will not do on the way. The assistant's support flow is `intake → triage → resolution → follow-up`; `support-sentiment-analysis`, `support-issue-analysis`, `support-search-kb`, and `support-resolve-ticket` handle intake, `response-drafting-user` handles a human-supplied reply, and `ticket-ops` performs the CRM mutation — including escalation and follow-up — behind a confirmation gate. This handbook sets out the tier model, the matrix that decides an escalation, and the rules for moving it.

## The tier model

| Tier | Name | Owns | Target first response | Target resolution | Escalates on |
| --- | --- | --- | --- | --- | --- |
| Tier 1 | Front line | Known-issue answers, how-to, account and billing questions, incident intake | Within business hours | Same day to 2 business days | Unknown defect, account-specific behaviour, security concern, repeated contact |
| Tier 2 | Specialist | Product defects, integration faults, data corrections, repro and workarounds | Within the target window for the severity | Agreed fix or workaround within the severity target | Platform or architecture fault, needs a code change, cross-service impact |
| Tier 3 | Engineering / incident | Code changes, root cause, permanent fix | Paged, continuous | Tracked to release | Customer-specific fork required, systemic outage |
| Security / Privacy | Named specialists | Any suspected exposure of credentials, personal data, or payment data | Immediate, via a dedicated path | To disclosure decision | — |

The tiers are a routing decision, not a status. A contact does not "become tier 2"; it gets a tier-2 owner, and it keeps the history, the sentiment record, and the SLA clock it arrived with.

## Escalation triggers

Escalate on any one of these, without needing a second opinion:

- **Security or privacy** — suspected credential exposure, personal data access, payment data, or an authentication bypass. Do not troubleshoot in the open channel; move to the dedicated path.
- **Data loss or corruption** — anything where data written by the customer is missing or altered.
- **SLA breach risk** — `ticket-ops` carries an `slaBreach` flag; a contact projected to breach on the current tier is an escalation trigger in its own right, not a note for later.
- **No owner** — the contact does not match any known issue, article, or product area.
- **Repetition** — third contact on the same issue, or a reopen within 7 days of resolution.
- **Sentiment** — sustained negative signal on the contact, particularly combined with any of the above.
- **Regulatory or contractual** — anything with a reporting obligation, a named SLA penalty, or a committed delivery date.
- **Executive or churn risk** — named strategic accounts, or a contact that names a competitor or a cancellation.

## Severity and priority

Priority is a separate axis from tier. `ticket-ops` accepts `priority` of `low`, `medium`, `high`, `critical` and a `defaultPriority` in its configuration.

| Severity | Definition | Examples | Response | Update cadence |
| --- | --- | --- | --- | --- |
| S1 critical | Service unavailable or data at risk, no workaround | Full outage, data loss, breach in progress | Immediate page, incident channel, executive notification | Every 30 minutes until mitigated |
| S2 high | Major function blocked, workaround is poor | Core workflow broken for a whole segment | Within the high-severity window | Daily |
| S3 medium | Function degraded, acceptable workaround exists | Slow, cosmetic defect, partial failure | Standard queue | Every other day |
| S4 low | Question, minor defect, no impact on outcome | How-to, config question | Standard queue | On resolution |

Two common failures: escalating a workaround-request to S1 because the customer is angry, and sitting on an S2 because no one has escalated it. Severity tracks impact, not volume.

## The escalation matrix

| Condition | From | To | Authority to escalate | What must accompany it |
| --- | --- | --- | --- | --- |
| Unknown defect, no repro | Tier 1 | Tier 2 | Tier 1 agent | Contact text, steps to reproduce, environment, recent changes |
| Architecture or platform fault | Tier 2 | Tier 3 | Tier 2 lead | Evidence, correlation id, impact scope, workaround status |
| Security or privacy signal | Any | Security path | Any agent, no approval needed | What was observed, what data is implicated, containment already applied |
| Account-specific behaviour | Tier 1 | Tier 2 | Tier 1 agent | Account identifier, configuration, contract terms |
| Third contact on the same issue | Any | Next tier up | Any agent | Full contact history and every resolution already attempted |
| SLA breached | Any | Next tier up plus support lead | Automated, via `slaBreach` | Breach duration, customer impact, recovery plan |
| Churn risk on a strategic account | Any | Support lead and account owner | Any agent | Commercial context, renewal date, executive contact |
| Requested change, not a defect | Tier 1 | Product | Tier 1 lead | Problem statement and evidence of breadth; route as a request, never as a bug |

The rule underneath: **escalation transfers ownership with the full context attached.** An escalation that arrives without the contact history is a new contact, and it restarts every clock in the SLA.

## A handover that works

A tier 1 agent escalating a suspected defect should hand over:

> **Contact**: TCK-4471, opened 09:12, customer on the Enterprise plan (3 sites).
> **Issue**: "Bulk export returns a 200 with an empty CSV for any date range in August. Worked in July."
> **Repro**: filter to any August date, click Export CSV, file downloads at 0 bytes. Reproduced twice on Chrome and Safari. Not reproduced on the July range.
> **Environment**: EU region, self-serve tier, account id in the contact record.
> **Attempted**: cleared the export cache (09:40), retried with a narrower range, checked the browser console for a client-side error — none. No workaround found.
> **Recent changes**: export service deployed 06 Aug (CHG-2211).
> **Sentiment**: negative on this contact; the customer has written twice today.
> **Told so far**: that we are escalating to the platform team and will update within one business day.
> **Business impact**: month-end close in four days; the customer has raised the possibility of exporting manually.

What makes it a handover rather than a forward: the reproduction is reproducible, the failed attempts are listed, the deploy window is named, the customer has been told something specific and true, and the business deadline is present. A tier 2 owner reading that can start work immediately. A tier 2 owner reading a summary — "customer cannot export data, escalated" — has to ask five questions before they can begin, and each question is an hour the clock is running.

## Handing over

A handover is complete when the receiving owner has:

- The contact text, unedited. Never summarise away the customer's words.
- The reproduction path, or an explicit statement that there is none.
- Environment, account, plan, and region.
- Every action already taken, including the ones that did not work — the failures are the useful part.
- The sentiment record and any earlier `support-issue-analysis` output.
- What the customer was last told, so nobody contradicts it.

## Communicating during escalation

- Say it is escalating, say to whom, and say when they will next hear from you. A contact that goes quiet after escalation is where CSAT damage is done.
- Do not promise a fix date you have not been given. Promise the next update time, which you can always keep.
- On handoff, the customer should not have to re-explain the problem. If they do, the handover was incomplete.
- Escalation updates follow the severity cadence above, including "no change" updates. Silence is read as abandonment.

## The assistant's role in escalation

`ticket-ops` is the tool that performs it. Its shape:

- `provider` is not the escalation mechanism — the tool runs against a configured endpoint, and `entity` selects the CRM object (`ticket`, `customer`, `contact`, `account`, `interaction`).
- `escalationLevel` is a number from 1 to 5, enforced by the schema.
- `reason` is a free-text field and the one that matters. A structured `reason` is what makes a queue analysable six weeks later.
- `assignedTo` names the receiving owner or team.
- `slaBreach` and `priority` carry the SLA and severity state.
- `followUpType` selects `satisfaction`, `resolution_check`, `upsell`, `renewal`, or `custom`, with `schedule` (`at`, `delay`, `recurring`), `channel` (`email`, `sms`, `in_app`, `phone`, `chat`), `template`, and `customMessage`.
- `confirmBeforeSend` is `true` and `dryRun` defaults to `true`. Mutating a live ticket is a represent-tier action and requires explicit confirmation.

Three governance rules that follow from that shape:

- **Dry run first, always.** The default is `dryRun: true` for a reason: it produces the request that would have been sent, so the operator reads the payload before the customer's record changes.
- **Escalations are manual decisions.** The assistant drafts and performs; a human decides. Nothing in the pipeline should raise a level without a named approver.
- **A failed escalation is not a queued escalation.** If the call throws or returns nothing, the contact has not moved. Verify the `response.status` before closing your own loop — a contact silently left in the old queue past its SLA is the most expensive failure in this process.

## De-escalation

De-escalation is normal and should not feel like a demotion. When the issue is resolved at the higher tier, route the fix back to the original owner so the knowledge base and macros improve. When a contact is escalated in error, say so plainly and return it with a note explaining why. Record both.

## After the incident

- Resolution check before closing anything with a severity above S3. `followUpType: resolution_check` exists for this.
- Root cause belongs to the owning team, with a date, not to the contact record.
- Reopen within 7 days of a resolution invalidates the resolution; re-open the contact, do not open a new one.
- Feed the pattern into `support-issue-analysis` with `analysisType: pattern_detection`; a single contact is an issue, ten similar ones are a product defect.
- Anything that reaches `classification`, `similarity`, or `prediction` should be re-run once the `category` and `rootCause` fields carry real values, rather than the placeholders the skill writes today.

## Configuring this

The tier names, severity definitions, response and resolution targets, the 7-day reopen window, and the escalation conditions in the matrix are operating conventions; nothing in the code enforces them. What the operator does control: `defaultPriority` and `rateLimitPerMinute` (60 by default) in the `ticket-ops` configuration, `confirmBeforeSend` and the `dryRun` default, the escalation `channel` and `followUpType` used for the outbound update, the `eventTypes` and `targetChannels` selectors on the drafting notifier, and the `period` and `reportType` on the scheduled analytics review. Pin your tier roster, severity-to-SLA mapping, named approvers, and update cadences in the assistant's persisted configuration, and keep `dryRun` at its default for anything that touches a live customer record.
