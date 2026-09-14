# Skills Implementation Audit Report

> **Generated:** 2026-09-11
> **Scope:** All 249 skills across 20 categories in `services/tool-executor/src/data/skills/`
> **Purpose:** Audit per Engineering Brief §3.1 — classify every skill before bulk edits

---

## 1. Type System Analysis (Guardrail §2b)

**Current `Tool` interface** (`types/index.ts`):
```typescript
export interface Tool {
  id: string
  name: string
  description: string
  type: 'mcp' | 'openapi' | 'code'
  manifest: Record<string, unknown>
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  isSkill?: boolean
}
```

**Schema properties typed as `Record<string, unknown>`** — no support for:
- `title` / `label` / `x-label` (UI label distinct from key)
- `default` (pre-fill value)
- `examples` (placeholder/sample values)
- `format` (e.g., `date-time`, `email`, `password`, `textarea`)
- `sensitive` (mask in UI/logs)
- `order` / `group` (field ordering, section grouping)
- `multiline` (textarea vs input)
- `hint` / `placeholder` (inline help)

**Frontend reads** (EntityWorkspace.tsx): `title`, `label`, `x-label`, `description`, `hint`, `format`, `multiline`

**Finding:** **Type-system gap.** Schema types need extension to carry UI metadata. Recommend extending schema property type to proper JSON Schema shape with these fields.

---

## 2. Tag Definitions

| Tag | Meaning |
|-----|---------|
| **A** | Fine as internal action/tool-call; needs schema/description completion only |
| **B** | Currently user-facing but should be reclassified as internal tool-call, folded into higher-order Assistant capability |
| **C** | `type: 'code'` skill with stub/placeholder logic; needs real implementation |
| **D** | Schema plausibly missing config/input properties the real integration needs |
| **E** | Panel copy needs fixes (§2c: raw skill ID as heading, redundant "Settings" text, unhelpful "Run" label) |

A skill can have multiple tags.

---

## 3. Complete Skill Classification (All 249 Skills)

### Analytics (2 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `generate-report` | analytics | A, C, D, E | `type: 'code'` — writes empty `report: {}` to file; no LLM call. Missing `description` on `metric`, `period`. Config schema empty but should have output format, template, schedule options. |
| `identify-trends` | analytics | A, C, D, E | `type: 'code'` — writes empty `trends: {}`; no analysis logic. Missing `description` on `dataset`, `timeframe`. Config empty but should have data source, algorithm, granularity. |

### Career (19 skills)

| Skill ID | Category | Tags | Notes |
|---|---|---|---|
| `career_setup` | career | A, E | Has descriptions on most input props (good). Config empty — correct (one-time setup). |
| `career_scrape` | career | A, D, E | Input has `description` on most props. Config empty but should have portal credentials, rate limits, proxy config. |
| `career_apply` | career | A, D, E | Input has `description` on some props. Config empty — should have default resume/cover letter, ATS integrations. |
| `career_rank` | career | A, D, E | Input has `description` on `weights`. Config empty — should have scoring models, default weights. |
| `career_interview` | career | A, D, E | Input has `description` on some props. Config empty — should have question banks, prep templates. |
| `career_outcome` | career | A, D, E | Input has `description` on some props. Config empty — should have tracking integrations. |
| `career_expand` | career | A, D, E | Input has `description` on some props. Config empty — should have expansion sources, filters. |
| `career_upskill` | career | A, D, E | Input has `description` on some props. Config empty — should have learning platforms, skill taxonomies. |
| `career_html_report` | career | A, D, E | Input has `description` on `reportType`. Config empty — should have templates, branding. |
| `career_notion_sync` | career | A, D, E | Input has `description` on some props. Config empty — should have default database mappings. |
| `career_gmail_sync` | career | A, D, E | Input has `description` on some props. Config empty — should have OAuth config, label filters. |
| `career_add_template` | career | A, D, E | Input has `description` on some props. Config empty — should have template categories. |
| `career_add_portal` | career | A, D, E | Input has `description` on most props (good). Config empty — should have portal validation, test mode. |
| `career_reset` | career | A, E | Input has `description` on some props. Config empty — correct (destructive action). |
| `career-resume-optimizer` | career | B, D, E | **External action skill** — thin wrapper over API. Config has `endpointUrl`, `apiKey`, `provider`, `targetRole` — missing auth scopes, rate limits, output format defaults. |
| `career-resume-analyzer` | career | B, D, E | **External action skill** — thin wrapper. Config similar gaps. |
| `career-resume-formatter` | career | B, D, E | **External action skill** — thin wrapper. Config similar gaps. |
| `career-application-monitor` | career | B, D, E | **External action skill** — thin wrapper. Config missing webhook vs polling, notification channels. |
| `career-followup-advisor` | career | B, D, E | **External action skill** — thin wrapper. Config missing channel providers, templates. |
