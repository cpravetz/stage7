# Assistant Skill Design Framework v1
### Worked example: Career Coach

This document is the reusable method for re-deriving skills on any of the 21 assistants,
worked in full for Career Coach so it can serve as the reference case. The method is the
8 steps; the fix for Career Coach is the proof it produces something better than "discrete
skills that are slightly better than raw functions."

---

## The method

1. **Domain** — what problem space does this assistant own end-to-end?
2. **Advise** — where must the assistant give the user reasoned options, not act, because the
   decision is personal, values-based, or irreversible?
3. **Proxy** — where can the assistant act *as* the user, directly, because the action is
   mechanical, low-risk, or reversible with review?
4. **Aide** — where does the user have to act personally (a call, an interview, a decision
   conversation), but the assistant can prepare the material that makes that moment easier?
5. **Higher-order skills** — group 2–4 into the smallest set of *outcomes* a user would ask for
   in plain language. This is the point where atomic CRUD functions get folded into workflows.
6. **Outputs** — for each higher-order skill, what does the user actually receive?
7. **Config & inputs** — what does the skill need to produce that output, and — critically —
   what should it *derive itself* from stored context vs. require from the user?
8. **Triggers** — user-initiated, scheduled (date/time), event-driven (new data arrived), or
   data-driven (a threshold/condition was met). Most of the original 25 tools only had one
   trigger type available: a human pressing a button. That's the tell that they were built as
   functions, not skills.

### The cross-cutting classification (applies at step 6–7)

Every skill also needs to be tagged by **what it actually depends on**:

| Class | Depends on | Original mistake |
|---|---|---|
| **Reasoning-only** | Data already in context (resume, profile, stored jobs) + the assistant's own model | Modeled as `createExternalActionSkill` requiring a third-party `endpointUrl` + `apiKey` that was never configured, so it always failed |
| **Real external integration** | A live system of record (a job board's actual API, Gmail, Notion, an ATS) | Modeled identically to reasoning-only skills — same stub shape, same fake "provider" config — so it was indistinguishable from something that couldn't possibly work |
| **Hybrid** | Real data fetch, then reasoning on top of it | Split across two disconnected tools with no shared state |

Collapsing all three into one `createExternalActionSkill` factory is exactly the
over-simplification you flagged: it made "needs a stub" and "needs a real MCP/API
connection" look like the same design decision. They aren't. A skill's classification
here determines whether step 7's config schema should contain an MCP server reference,
a real credential, or nothing external at all.

---

## Applied: Career Coach

### 1. Domain
Managing a job search end-to-end: positioning (resume/profile), discovery (finding
relevant roles), execution (applying, tracking), preparation (interviews), and decisions
(offers, negotiation, networking) — as one continuous pipeline, not five unrelated tools.

### 2. Advise (assistant gives reasoned options, doesn't act)
- Should I take this offer vs. the alternative / vs. staying put?
- What's my negotiation leverage and opening position?
- Is my resume actually strong for this specific role, and why or why not?
- Is this company/role worth pursuing given my stated priorities?

These are judgment calls with the user's values at stake (risk tolerance, compensation
priorities, life circumstances). The assistant's job is to reason well and lay out
trade-offs — never to submit an acceptance or a counter-offer on the user's behalf.

### 3. Proxy (assistant acts directly, on the user's behalf)
- Searching job boards using criteria derived from the stored profile
- Scoring/ranking listings against that profile
- Filling and submitting applications using the stored resume + generated cover letter
- Tracking application status and logging outcomes
- Scheduling/sending routine follow-ups on a cadence, once the user has approved the pattern

These are high-volume, mechanical, and reversible-with-review — the textbook case for
letting the assistant just do it, with a dry-run/review gate rather than a
manually-operated button per step.

### 4. Aide (assistant prepares, user performs)
- Interview prep: likely questions, model answers grounded in the user's actual
  experience, mock Q&A
- Drafting (not sending) a specific networking message for the user to personalize and send
- Talking points for a negotiation call
- A polished resume/cover letter draft for the user's final sign-off

### 5. Higher-order skills (replacing the 25 atomic tools)

| # | Skill | Absorbs (old tool ids) | Nature |
|---|---|---|---|
| A | **Career Profile & Resume Intake** | `career_setup`, plus the missing resume-creation step | none external — local parse/store |
| B | **Job Discovery & Fit Ranking** | `career_scrape` + `career_rank` | hybrid (real board APIs, if connected, + reasoning) |
| C | **Application Execution** | `career_apply`, `career_add_portal`, `career_add_template` | hybrid (real portal submission where connected) |
| D | **Interview Preparation** | `career_interview` | reasoning-only |
| E | **Career Advisory** | `career-resume-optimizer`, `career-resume-analyzer`, `career-resume-formatter`, `career-salary-analyzer`, `career-negotiation-advisor`, `career-offer-evaluator` | reasoning-only — collapses 6 stub tools into 1 real one |
| F | **Networking & Outreach** | `career-networking-advisor`, `career-followup-advisor` | aide by default; proxy only if an outreach channel (email/LinkedIn MCP) is connected |
| G | **Pipeline Reporting & Sync** | `career_outcome`, `career_html_report`, `career_notion_sync`, `career_gmail_sync`, `career_expand`, `career_upskill` | hybrid — real sync needs real MCP connectors; reporting is reasoning-only |

`career_reset` becomes a utility action inside Profile & Resume Intake, not a standalone skill.

### 6–7. Outputs, config & inputs per skill

**A. Career Profile & Resume Intake**
- *Output:* a structured profile + parsed resume record, used as the default context for every other skill.
- *User-supplied:* an uploaded file (pdf/docx/md/txt) and a handful of preferences (target roles, salary floor, locations, exclusions) the assistant cannot infer.
- *Assistant-derived:* structured resume fields (skills, roles, dates, achievements) parsed from the upload — never re-typed by the user.
- *Config:* none external. Local storage only.

**B. Job Discovery & Fit Ranking**
- *Output:* a ranked list of current listings with a fit score and a one-line rationale per listing.
- *User-supplied (optional overrides only):* refine query, exclude a source, narrow location.
- *Assistant-derived by default:* search queries from `profile.preferences.targetRoles`/`keywords`, sources chosen by what's actually connected (real job-board MCP if present; otherwise the assistant says plainly that results are unverified/placeholder rather than silently faking listings).
- *Config:* real board integrations declared as MCP connectors, not stub API-key fields. If none are connected, the skill must say so rather than emit synthetic data as if it were real.

**C. Application Execution**
- *Output:* submitted applications (or a dry-run preview) with resume/cover letter attached, and a tracking record.
- *User-supplied:* which ranked jobs to apply to (or an auto-apply threshold they set once, e.g. "auto-apply above 85 fit score").
- *Assistant-derived:* resume and cover letter selection — always from the single stored resume record from Skill A, never a re-specified `resumeId` with no creation path.
- *Config:* real portal submission requires a real portal integration (MCP or registered submit config); without one, this reduces to "prepare the application, open it for the user to submit" rather than pretending to submit.

**D. Interview Preparation**
- *Output:* likely questions + grounded model answers + a short mock-interview script, keyed to a specific job from Skill B.
- *User-supplied:* which job, optionally which interview stage.
- *Assistant-derived:* everything else, from resume + job description already on file.
- *Config:* none external.

**E. Career Advisory** (resume strength, salary benchmarking, negotiation strategy, offer evaluation)
- *Output:* a reasoned recommendation with trade-offs stated explicitly, not a single verdict.
- *User-supplied:* the specific question/decision (e.g., the competing offer terms).
- *Assistant-derived:* everything else, from stored resume/profile/job history — no external "optimization provider" required, because this is exactly the reasoning an LLM assistant should do natively.
- *Config:* optional — salary benchmarking is *stronger* with a real market-data MCP connector if one exists, but functions without one by reasoning from general knowledge with appropriate caveats. That optionality (works standalone, improves if connected) is the correct shape — not a hard dependency on an unconfigured stub.

**F. Networking & Outreach**
- *Output:* a drafted, personalized outreach message and a follow-up cadence.
- *User-supplied:* who, and what relationship stage.
- *Assistant-derived:* tone and content from profile + target company/role.
- *Config:* drafting needs nothing external. Actually *sending* requires an explicit, connected channel (email/LinkedIn MCP) and always stays confirm-before-send — this is where proxy has a hard line.

**G. Pipeline Reporting & Sync**
- *Output:* a status rollup (applications, interviews, offers) and, where connected, a sync to the user's actual tracking system.
- *User-supplied:* nothing, ordinarily.
- *Assistant-derived:* pulled from Skill C's tracking data.
- *Config:* real sync (Notion, Gmail) requires a real MCP connector; reporting itself does not.

### 8. Triggers

| Skill | User-initiated | Scheduled | Event-driven |
|---|---|---|---|
| A | "here's my resume" | — | — |
| B | "find me jobs" | daily/weekly digest of new matches | a new listing crosses the user's fit threshold |
| C | "apply to these" / auto-apply setting | — | — |
| D | "prep me for this interview" | — | an interview is detected/logged (via G) |
| E | "should I take this offer" | — | an offer is logged |
| F | "draft outreach to X" | scheduled follow-up cadence | a contact hasn't replied in N days |
| G | "how's my pipeline" | weekly summary | a status changes (rejection, interview, offer) |

This is the piece the original design was missing entirely: only "user presses a
button" existed as a trigger. A real career-coach *assistant* should notice that
a promising job appeared, that a follow-up is overdue, or that an interview was
just scheduled, and proactively surface that — not wait to be operated.

---

## Applying this to the other 20 assistants

The repeatable part is steps 1–5: domain → advise/proxy/aide → collapse into
outcome-shaped skills. The repeatable failure to check for is the same one found
here — atomic CRUD exposed as user-facing "skills," advisory reasoning wrongly
modeled as external stub calls, and no trigger besides manual invocation. Grading
an assistant "A" complete should mean all of steps 6–8 are filled in for every
skill, with the classification table applied honestly — not that the stub shape
compiles.
