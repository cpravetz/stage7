# Resume Parsing Standards

This handbook governs how the Career & Executive Search Assistant ingests, normalizes, and structures candidate resumes and cover letters. It defines the accepted document formats, the text normalization pipeline, the parsed profile schema, and the field-extraction rules that downstream skills depend on. Follow it when adding a new intake path, when a parsed profile is missing fields a caller expected, or when a template save behaves unexpectedly. The standards here are the contract between the Resume & Template Manager and the skills that read its output.

## Scope

These standards apply to every document the Career assistant touches:

- Resume and cover-letter templates saved through the Resume & Template Manager.
- File attachments uploaded as `resumeFile` (PDF, DOCX, MD, TXT).
- Free-text `content` pasted or authored in the template editor.
- The stored candidate profile read by Profile Intake and every positioning skill.

What is out of scope: the job-listing normalization performed by Job Discovery, which has its own pipeline and its own failure ledger, and the fit scoring performed by Rank Opportunities, which is covered by the ATS optimization rules.

## Accepted document formats

The Resume & Template Manager accepts a `resumeFile` attachment and free-text `content`. The attachment object carries three required fields: `name`, `mimeType`, and `content` (Base64 or plain text). Document classifications are `resume` and `cover-letter`; supported file types are PDF, DOCX, MD, and TXT. Free-text templates are stored as markdown or plain text and are parsed for `{{variable}}` tokens on save.

| Input field | Required | Notes |
|---|---|---|
| `name` | yes | Display name; also seeds the template ID slug |
| `mimeType` | yes | Part of the upload object |
| `content` | yes | Base64 or plain text |
| `type` | no | `resume` (default) or `cover-letter` |
| `tags` | no | Array of categorization labels |
| `variables` | derived | Auto-detected `{{var}}` tokens |

Saved template records carry `id`, `kind` (`resume` or `cover_letter`), `type`, `name`, `content`, `variables`, `tags`, `profileId`, `createdAt`, `updatedAt`, and a monotonic `version` that increments on each update. Listing accepts a `typeFilter` of `all`, `resume`, or `cover-letter`.

## Text normalization pipeline

Every document body passes through the same normalization steps before it is scored or stored:

- Strip `<script>` and `<style>` blocks, then all remaining HTML tags.
- Decode HTML entities — numeric decimal (`&#38;`), numeric hex (`&#x26;`), and the named set.
- Collapse whitespace runs to single spaces and trim.
- Parse free-text salary strings into a normalized `{min, max, currency, raw}` range.

The entity decoder runs numeric forms before the named set: a combined decimal-or-hex regex misparses one form as the other, which is a known failure mode. The named set covers structure (`amp`, `lt`, `gt`, `quot`, `apos`), spacing (`nbsp`, `ndash`, `mdash`, `hellip`, `bull`, `middot`), legal (`copy`, `reg`, `trade`), currency (`euro`, `pound`, `yen`, `cent`), and accented characters (`eacute`, `egrave`, `ccedil`, `uuml`, `szlig`).

Salary parsing reads the numeric values out of free text, treats a trailing `k` or `K` as thousands, and detects currency from symbols (`$`, `€`, `£`) or ISO codes (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `INR`). Commas are stripped before extraction, so `"120,000 - 150,000"` parses as a 120000–150000 range.

## Parsed profile schema

The stored candidate profile — read by Profile Intake and every positioning skill — carries this shape:

- `personal.headline` — the parsed headline, used to derive search terms when no target titles are saved.
- `targetTitles` — explicit target roles; the first choice for discovery queries.
- `preferences.targetCompanies` — employers scored as named targets.
- `preferences.targetRoles` — the fallback role list when `targetTitles` is empty.
- `preferences.locations` — target locations, including `remote`.
- `preferences.minSalary`, `preferences.maxSalary` — the compensation band used by the salary axis.
- `preferences.keywords` — description keywords matched against listing text.
- `preferences.excludeCompanies` — companies scored zero.
- `preferences.workArrangement` — `remote`, `onsite`, `hybrid`.
- `resume.rawText` / `resume.parsedText` — the normalized document body.

When a discovery run has no queries and no companies, search terms are derived from the profile: `targetTitles` first, then the headline parsed out of the resume text. That is what lets "find roles that fit my resume" work without restating a job title.

## Field extraction rules

- Seniority and employment noise (`senior`, `sr`, `junior`, `jr`, `entry`, `entrylevel`, `graduate`, `intern`, `contract`, `permanent`, `fulltime`, `parttime`, `freelance`) is stripped from titles before comparison.
- Level words (`manager`, `director`, `lead`) are kept, because they are the role rather than the seniority.
- Derived forms match: `engineering`/`engineer`, `managers`/`manager` via prefix and stemming rules.
- A listing whose title matches none of the searched roles is held back as off-target, not shown with a low score.
- Template variables are detected with the pattern `\{\{\s*([a-zA-Z0-9_]+)\s*\}\}` and stored as a de-duplicated list on the template record.
- A template ID is slugified from the name (lowercased, non-alphanumerics collapsed to hyphens) when not supplied explicitly, so two templates with the same name update the same record.

## Normalized listing shape

Although listings come from many sources, every one is normalized to a single shape before it is ranked or stored. A normalized listing carries:

- `id` — a stable identifier, prefixed by source (for example `gh_`, `ash_`, `lev_`).
- `title`, `company`, `location` — stripped of HTML and entities.
- `remote` — true when the listing or its location says remote.
- `description` — the normalized body text.
- `applyUrl` — an https link the candidate can act on.
- `source` — the provider that supplied it, distinct from `applyUrl`.
- `sourceUrl` — the canonical page on the source.
- `postedAt`, `employmentType`, `department`, `salary` — as available.

A listing without a title or an `applyUrl` is not usable and is dropped rather than passed downstream.

## Quality gates and failure handling

- A row missing `title` or `applyUrl` is dropped, never thrown — one bad row must not cost the target every other posting.
- An unparseable salary is `null`, not zero; an unconfigured salary range is unknown and scores neutral rather than zero.
- A resume text that cannot be read leaves positioning at "Profile parsed; limited market signals until you run Job Discovery."
- A template save requires both `name` and `content`; a missing field returns a structured error naming the missing field rather than a generic failure.
- A `get` or `delete` without a template ID, or with an ID that does not exist, returns a structured error rather than an empty success.
- A date that will not parse is `null`, never a falsy epoch that would silently drop a real posting.

## Template variable resolution

Templates are authored with `{{variable}}` placeholders that are filled at render time. The manager detects these tokens on save and stores them as the template's `variables` list, so a caller can see what a template expects before using it. Rules:

- A variable name is `[a-zA-Z0-9_]+`; surrounding whitespace inside the braces is ignored.
- The list is de-duplicated, so a template that repeats `{{name}}` reports it once.
- The Application Execution Orchestrator resolves a selected template to its `content` before submitting an application, so the rendered document carries the template body rather than its ID.
- A variable that is never supplied at render time is a caller error, not a parsing error; the manager does not invent a value for it.

## Document lifecycle and versioning

Every save writes a complete record, and the record is versioned:

- A new template starts at `version` 1 with a fresh `createdAt`.
- An update to an existing ID keeps the original `createdAt` and increments `version`.
- `updatedAt` is always refreshed, so the listing order reflects the most recent edit.
- `tags` are preserved across an update unless the caller supplies new ones.
- Delete removes the record and returns the remaining count, so the library size is always known.

Because a save is a full replace, an operator editing a long resume should read the current `content` first (`get`), edit it, and save the whole body back rather than assuming a partial merge.

## Common failure modes

- **Unreachable store.** The manager reads and writes through the persisted store; a store that cannot be read yields an empty template list, not an error, so the panel still renders.
- **Duplicate names.** Two templates with the same display name slugify to the same ID and silently update each other; supply an explicit `id` to keep them distinct.
- **Stale variables.** Renaming a variable in the body without re-saving leaves the stored `variables` list out of sync; re-save to refresh detection.
- **Mixed classifications.** A `cover-letter` body saved with `type: resume` is stored as a resume; the `kind` field follows the declared `type`, not the content.

## Configuring this

The formats, normalization rules, and profile fields above are the defaults the assistant ships with. Operators override intake behaviour through the Resume & Template Manager's persisted configuration — its `action`, `typeFilter`, and `resumeFile` inputs control what is listed, saved, or deleted — and through Profile Intake, which writes the stored profile that discovery and ranking read. The `maxPerBoard` and `detailLimit` caps on Job Discovery, and the `minRoleScore` floor on Fit Ranking, are the operator-facing knobs that change how much parsed material flows downstream.
