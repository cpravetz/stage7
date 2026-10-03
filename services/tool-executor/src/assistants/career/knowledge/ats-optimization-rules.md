# ATS Optimization Rules

This handbook defines how the Career & Executive Search Assistant scores a candidate's fit against a job listing and how it reads the applicant tracking systems that publish structured job boards. It covers the weighted fit model, the graded role-match scale, the per-axis scoring rules, and the relevance floor that separates on-target roles from off-target noise. Use it to interpret a fit score, to tune a search, or to explain why a listing ranked where it did.

## The weighted fit model

Fit Ranking scores every listing on five axes and combines them into a 0–1 weighted total. Role is the axis a job search is actually about, so it carries the heaviest weight and is the only axis that can separate one listing from another when the profile is empty.

| Axis | Default weight | What it measures |
|---|---|---|
| `role` | 0.45 | Title match against the searched role terms |
| `keywords` | 0.20 | Description coverage of profile keywords and searched terms |
| `salary` | 0.15 | Overlap between the listing's pay band and the candidate's target range |
| `location` | 0.10 | Work-arrangement fit (remote / onsite / hybrid) |
| `company` | 0.10 | Target-company match, minus exclusions |

Weights are rebalanced to sum to 1.0, so any operator override rescales the remaining axes rather than breaking the total. Each listing's output carries `score`, `roleScore`, `roleMatch`, `relevance`, a `weightedBreakdown` per axis, and a human-readable `rationale`.

## The graded role-match scale

The role axis is graded rather than binary, so a real title match outranks a near miss and a listing with no title overlap scores zero:

| Condition | Score |
|---|---|
| Title exactly equals the searched phrase | 1.00 |
| Title contains the searched phrase | 0.95 |
| Every query token matches a title token | 0.80 |
| At least half the query tokens match | 0.40 × (matched / total) |
| No token overlap | 0.00 |

Tokens are compared after stripping seniority noise and applying stemming, so "Sr. Software Engineer" and "software engineering" compare on substance. The searched role terms for the current run are scored first, then the titles saved on the profile.

## Per-axis scoring rules

- **Keywords.** Profile keywords and the searched role terms are normalized into a token set; the score is the fraction of those tokens found in the listing description, capped at 1.0. With no keywords and no role targets the axis is neutral (0.5).
- **Salary.** `overlap = max(0, min(listingMax, targetMax) − max(listingMin, targetMin))`, then `salaryScore = min(1, overlap / (targetMax − targetMin))`. When no target range is configured the axis is unknown and scores neutral, not zero.
- **Location.** A remote listing scores 1.0 when remote is wanted, else 0.4; an onsite/hybrid listing scores 0.8 when onsite or hybrid is wanted, else 0.3.
- **Company.** An excluded company scores 0; a named target company scores 1.0; a non-target company scores 0.3; with no target list the axis is neutral (0.5).

## The relevance floor

A listing whose title matches none of the searched roles is not a result for the search, so it is held back rather than shown with a low score. The floor defaults to `0.01` whenever role terms were supplied — just above zero, so it removes exactly the listings with no title overlap — and `0` when the run was profile-only. Set `minRoleScore` to `0` to see the raw discovery output including off-target listings. Held-back listings are reported in `droppedOffTarget` with the role match that excluded them, so a run that hides forty listings can say which ones and why.

## Applicant tracking systems read

Discovery reads public, no-auth endpoints on the ATS platforms employers publish for public consumption. Each provider declares the host shapes it will accept so a config-derived URL cannot be pointed somewhere else, and each reports a per-source status:

- **Greenhouse** — board listing plus per-job detail enrichment.
- **Ashby** — posting API with compensation components.
- **Lever** — postings JSON with categories and salary ranges.
- **Workday** — CXS search route, served over POST with a JSON filter body.
- **iCIMS**, **SmartRecruiters**, **BambooHR**, **Breezy**, **Jobvite**, **SuccessFactors**, **Oracle**, **Recruitee**, **Teamtailor**, **Workable**, **Phenom** — additional structured sources probed per company.

A source is reported `ok` only when pages were read and listings extracted; `no-match` when pages were read and genuinely nothing matched; `error` when the source could not be retrieved or its structure was not recognized. A retrieval failure is never flattened into a clean pass.

## Discovery source tiers

Job Discovery consults three tiers of source, in order, and the tier a listing comes from shapes how much trust its fit score deserves:

1. **Company-agnostic public feeds** (RemoteOK, Remotive, Arbeitnow, Jobicy, We Work Remotely, Himalayas). Public, no-auth, structured. These need no company name, so a search with nothing but a role still returns results.
2. **Applicant tracking systems** (the platforms listed above). Public, no-auth, structured, but they need a company, supplied by the caller, by a portal registry, or by probing the named company against each provider.
3. **General search boards** (LinkedIn, Wellfound, Indeed, Glassdoor, Monster). HTML pages behind bot protection, consulted last. Most are permanently blocked from a datacenter IP, so they are off by default and add a permanent failure to every run they are enabled on.

## The per-source run ledger

Every discovery run reports a per-source status derived from what actually happened, so a real empty result is distinguishable from a source that never ran:

- `ok` — pages read and listings extracted.
- `no-match` — pages read, structure recognized, genuinely nothing matched. A real answer from a source that was read, not a failure.
- `error` — the source could not be retrieved, or was retrieved but its structure could not be recognized. There is no "offline": an inability to retrieve is a failure inside this system.

A source is never reported `ok` when nothing was extracted, and a retrieval failure is never reported as `no-match`. Runs carry an aggregate status of `ok`, `partial`, `no-match`, `failed`, or `blocked`, and a partial run names the sources that could not be read.

## Network and concurrency defaults

The discovery sweep is tunable, and its defaults bound how aggressively it reads sources:

- Per-request timeout: 20 seconds, with bounded retries (default 2) on retryable statuses (408, 425, 429, 500, 502, 503, 504).
- Retries use exponential backoff with full jitter, so a sweep that walks many boards does not retry in lockstep.
- Concurrency: up to 4 sources read concurrently, with per-posting detail fetches bounded separately.
- Redirects are followed manually and capped (default 3 hops), and every hop is re-validated against the hosts a provider legitimately contacts.
- Requests to private or internal hosts are refused outright.

## Reading a fit score

A fit score is a weighted blend, not a verdict. Read it alongside the breakdown and the rationale:

- A high score with a low `roleScore` usually means the salary, location, and company axes carried a listing the role axis did not — treat it with suspicion.
- A low score with a high `roleScore` is a strong role match on a listing that misses on pay or location; the role axis alone can justify a look.
- `relevance` is `on-target` when the role score is 0.7 or above, `adjacent` above zero, and `off-target` at zero when role terms were supplied.
- An `excluded` listing was removed for matching an `excludeCompanies` entry, regardless of its other scores.

Worked example. A listing matching the searched title exactly (role 1.0), covering half the keyword tokens (keywords 0.5), overlapping a quarter of the target band (salary 0.25), remote when remote is wanted (location 1.0), and a non-target company (company 0.3) scores:

```
1.0×0.45 + 0.5×0.20 + 0.25×0.15 + 1.0×0.10 + 0.3×0.10 = 0.6425 → 0.64
```

## Rationale strings

Every listing carries a `rationale` array that explains its score in plain language. The strings a run can emit include:

- Title matches "<role>" / Title partly matches "<role>" (<terms>) / Title does not match the searched role.
- Company is excluded / Target company match.
- Salary fits target range / Salary outside target range.
- Remote friendly / On-site or hybrid role.
- Description covers: <keyword list>.

These strings are the audit trail for a score. When a score looks wrong, the rationale names the axis and the match that produced it, so an operator can correct the profile or the search rather than guess.

## Auto-apply and the stored listings envelope

Fit Ranking can auto-submit applications to roles that meet a fit bar:

- Set `autoApplyThreshold` to a score, and every ranked role at or above it is submitted through Apply to Jobs.
- `dryRun` defaults to true, so the default behaviour previews applications without submitting them.
- The ranked rows are persisted back into the shared listings file, merged by ID, so a later run builds on the last rather than replacing it.
- That file is an object envelope carrying `{ listings, total, byBoard, failures, failureCount, ranked, generatedAt }`, not a bare array. Preserving the envelope is what keeps the per-source ledger attached to the listings it describes.

A run that holds listings back by the relevance floor reports them in `droppedOffTarget`, so a search that hid forty listings can say which ones and why rather than looking like a market that had nothing.

## Configuring this

The weights, the role-match grades, and the relevance floor are defaults. Operators override the axis weights through the Rank Opportunities input (`weights`), widen or tighten the off-target floor with `minRoleScore`, and bound each source with `maxPerBoard`, `maxPages`, and `detailLimit` on Job Discovery. Board-specific targeting is pinned through `boardTokens`, which names exact ATS board slugs per provider instead of probing company names automatically.
