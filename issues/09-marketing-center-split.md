Title: Decompose `marketing-center` into scheduled reports and ad-hoc analysis Skills

Summary
-------
Recommendation: break `marketing-center` into focused Skills rather than a single hybrid Skill.

Examples
- `marketing-reports-scheduled` — configSchema: `campaignIds[]`, `channels[]`, `reportCadence`.
- `marketing-analysis-user` — inputSchema: `campaignId`, `timeRange`, `queryFilters`.

Checklist
- [ ] Product confirm list of report types and owners
- [ ] Engineering: create separate Skill entries and shared library
