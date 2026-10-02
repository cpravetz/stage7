Title: Split `response-drafting` into user and notifier Skills

Summary
-------
Proposed split:
- `response-drafting-user` — ad-hoc, user provides context/input.
- `response-drafting-notifier` — automated; `configSchema`: `eventTypes[]`, `targetChannels[]`, `templateId`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "eventTypes": { "type": "array", "items": { "type": "string" } },
    "targetChannels": { "type": "array", "items": { "type": "string" } },
    "templateId": { "type": "string" }
  },
  "required": ["eventTypes"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm events and channels
- [ ] Engineering: implement notifier bindings and guardrails
