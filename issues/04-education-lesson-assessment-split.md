Title: Split `education-lesson-assessment-drafting` into user and scheduled Skills

Summary
-------
Proposed split:
- `education-lesson-assessment-drafting-user`
- `education-lesson-assessment-drafting-scheduled` with `configSchema`: `courseId[]`, `gradeLevels[]`, `cadence`.

Config schema (fragment):

```
{
  "type": "object",
  "properties": {
    "courseId": { "type": "array", "items": { "type": "string" } },
    "gradeLevels": { "type": "array", "items": { "type": "string" } },
    "cadence": { "type": "string" }
  },
  "required": ["courseId"],
  "additionalProperties": false
}
```

Checklist
- [ ] Product confirm LMS integration points
- [ ] Engineering: add scheduled Skill and validate config
