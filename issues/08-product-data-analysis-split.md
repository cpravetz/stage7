Title: Split `product-data-analysis` into user and scheduled Skills

Summary
-------
Proposed split:
- `product-data-analysis-user` — ad-hoc user queries.
- `product-insights-scheduled` — scheduled insights; `configSchema`: `metrics[]`, `segments[]`, `cadence`, `thresholds`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "metrics": { "type": "array", "items": { "type": "string" } },
    "segments": { "type": "array", "items": { "type": "string" } },
    "cadence": { "type": "string" },
    "thresholds": { "type": "object" }
  },
  "required": ["metrics"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm canonical metric names and segment definitions
- [ ] Engineering: implement scheduled Skill with config validation
