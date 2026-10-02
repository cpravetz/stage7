Title: Split HR interview scheduling into user and automated Skills

Summary
-------
Proposed split:
- `hr-interview-scheduling-user` — ad-hoc manual scheduling.
- `hr-interview-scheduling-automated` — automated; `configSchema`: `calendarId`, `roundTypes[]`, `timeWindowRules`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "calendarId": { "type": "string" },
    "roundTypes": { "type": "array", "items": { "type": "string" } },
    "timeWindowRules": { "type": "object" }
  },
  "required": ["calendarId"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product/HR confirm calendar and ATS integration
- [ ] Engineering: implement owner and permissions
