Title: Split `compliance-tracking` into user and scheduled Skills

Summary
-------
Proposed split:
- `compliance-tracking-user`
- `compliance-tracking-scheduled` with `configSchema`: `sources[]`, `policySetId`, `scanWindow`, `notifyOn[]`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "sources": { "type": "array", "items": { "type": "string" } },
    "policySetId": { "type": "string" },
    "scanWindow": { "type": "string" },
    "notifyOn": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["sources"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm owner
- [ ] Engineering: wire scanner to sources
- [ ] Tests: ensure required selectors present
