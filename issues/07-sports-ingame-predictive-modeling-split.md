Title: Split sports ingame predictive modeling into ad-hoc and scheduled Skills

Summary
-------
Proposed split:
- `sports-predictor-ad-hoc` — user provides `matchId` or `teamPair`.
- `sports-ingame-predictive-modeling-scheduled` — automated; **must** include scope selectors in `configSchema`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "sports": { "type": "array", "items": { "type": "string" } },
    "teams": { "type": "array", "items": { "type": "string" } },
    "matchIds": { "type": "array", "items": { "type": "string" } },
    "dateRange": { "type": "object", "properties": { "from": { "type": "string" }, "to": { "type": "string" } } },
    "cadence": { "type": "string" }
  },
  "anyOf": [ { "required": ["matchIds"] }, { "required": ["teams"] }, { "required": ["sports"] } ],
  "additionalProperties": false
}
```

Important: Reject enabling scheduled runs until owner assigns explicit selectors to avoid unconstrained runs across all sports/games.

Checklist
- [ ] Product/Data confirm canonical sport/team identifiers
- [ ] Engineering: implement config guard and CI validation
