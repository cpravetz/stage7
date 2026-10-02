Title: Split `contract-document-advisory` into user and scheduled Skills

Summary
-------
Proposed split:
- `contract-document-advisory-user` — user-triggered; `inputSchema` accepts `contractText` or `contractId`.
- `contract-document-advisory-scheduled` — automated; `configSchema` persists `contractSources[]`, `tagFilters[]`, and `cadence`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "contractSources": { "type": "array", "items": { "type": "string" } },
    "tagFilters": { "type": "array", "items": { "type": "string" } },
    "cadence": { "type": "string" }
  },
  "required": ["contractSources"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm owner
- [ ] Product confirm canonical contract sources
- [ ] Engineering: add `-user` and `-scheduled` entries and schema
- [ ] Tests: config validation and CI guard against empty selectors
