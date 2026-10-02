Title: Split scriptwriting genre/market evaluator into user and scheduled Skills

Summary
-------
Proposed split:
- `scriptwriting-genre-market-evaluator-user` — ad-hoc, user supplies script sample.
- `scriptwriting-market-report-scheduled` — automated, `configSchema`: `genres[]`, `regions[]`, `cadence`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "genres": { "type": "array", "items": { "type": "string" } },
    "regions": { "type": "array", "items": { "type": "string" } },
    "cadence": { "type": "string" }
  },
  "required": ["genres"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm data sources for market signals
- [ ] Engineering: create scheduled Skill and ensure scope limits
