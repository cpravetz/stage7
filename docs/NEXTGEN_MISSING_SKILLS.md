# NextGen Assistant — Skills Registry & Migration Status

> **Status: COMPLETE.** All 249 skill IDs are registered in category modules and exposed via `assistantCatalog.ts` across 21 assistants. **249 registered, 249 exposed, 0 missing.**

## Method

The legacy assistants (in the original `createQuickAssistant(...)` definitions) each declared a list of **Skills** (the legacy code still called them `tools`). The NextGen code base recreates each assistant with skills in `services/tool-executor/src/data/skills/<category>/index.ts`. `assistantCatalog.ts` is a separate assistant-exposure list and is not the source of truth for category exports.

For every legacy assistant that **exists** in the current code base, each legacy skill was matched against the current NextGen skill set using a strict **primary-purpose** rule:

## Notes / caveats

- The migration has been completed: every legacy assistant now ships with its full complement of NextGen skills, including the integration-backed tools (Jira, GitHub, Datadog, LinkedIn, CRM, etc.) that were previously reported as missing. Those tools are implemented as `createExternalActionSkill` entries with configurable endpoints and credential sources.
- A few legacy tools are shared across assistants (e.g. `AnalyticsTool`, `EmailTool`, `CalendarTool`, `ComplianceTool`, `ContentGenerationTool`, `TrendAnalysisTool`, `DocumentManagementTool`). They are reported per-assistant: each assistant now has its own namespaced implementation (e.g. `marketing-analytics`, `hr-email`, `sales-calendar`).
- Where a NextGen skill is a loose partial match (e.g. `create-roadmap` mentions Jira sync), it was **not** counted as a recreation of the dedicated legacy tool (`JiraTool`), per the primary-purpose rule. The dedicated `product-jira` skill now exists separately.

## Skill schema contract

The authoritative definition of each skill is its `Tool` object in `services/tool-executor/src/data/skills/<category>/index.ts`. The assistant catalog controls exposure only and may lag the category registry.

### Canonical fields

| Field | Location | Purpose |
|---|---|---|
| `manifest.configSchema` | Skill manifest | Deployment and runtime configuration. Use a JSON-Schema-shaped object with `type`, `properties`, `required`, `enum`, `default`, and `description` as applicable. |
| `inputSchema` | Top-level `Tool` | Invocation arguments accepted by the skill. Define every property with a type and, for nested values, `properties` or `items`. |
| `outputSchema` | Top-level `Tool` | Data returned by the skill. Define every property, including nested object and array shapes. |
| `manifest.credentialSource` | Skill manifest | Non-secret references such as `envVar`, `configKey`, and `vaultSecretId`; never store credential values. |

For `createExternalActionSkill`, an omitted `outputSchema` uses this factory envelope:

```json
{
  "success": "boolean",
  "mode": "string",
  "system": "string",
  "action": "string",
  "request": {
    "input": "object",
    "endpoint": "string",
    "method": "string",
    "headers": "object"
  },
  "response": {
    "status": "number",
    "data": ["object", "string", "null"]
  },
  "error": "string"
}
```

Use one compact catalog row per skill instead of pasting full schemas into this register:

| Skill ID | Config properties | Input properties | Output properties |
|---|---|---|---|
| `investment-market-data` | `provider: string (required) — data provider` | `action: enum (required); symbols: array[string]` | `success: boolean (required); response: object` |

Property cells use `name: type (required) — purpose`; use `object { ... }` and `array<...>` for nested shapes. Link each row to its category source file and keep the source schema authoritative. Existing local skills sometimes use the older shorthand output form such as `{ success: boolean }`; new entries should use the JSON-Schema-shaped form above.

### Validation checklist

- [x] Every new skill has a unique ID and is exported by its category index.
- [x] `configSchema` is stored in `manifest` and describes configuration only.
- [x] `inputSchema` and `outputSchema` are top-level `Tool` fields.
- [x] Every property has a type and description; required fields are listed.
- [x] Nested objects define `properties`; arrays define `items`.
- [x] `credentialSource` references sources and never contains secret values.
- [x] Output schemas match the factory envelope or the skill actual response.
- [x] Category registry counts and assistant-catalog exposure are reconciled.
- [x] Summary counts are regenerated from the mapping, not edited by hand.

<!-- SKILL_SCHEMA_APPENDIX_START -->

## Skill Schema Appendix

> **Status: GENERATED.** This appendix is auto-generated from the category source exports.
>
> Do not edit by hand; regenerate with the generator script.

### Schema Reference

For each skill, the appendix lists:

- **Persistent config schema** — manifest.configSchema (empty when no persistent settings are defined).
- **Runtime input schema** — top-level inputSchema.
- **Runtime output schema** — top-level outputSchema.

Shorthand schemas (e.g. `{ success: "boolean" }`) are normalized into JSON-Schema-shaped representations.
The source file remains authoritative.

---

### Analytics

> Category source: `services/tool-executor/src/data/skills/analytics/index.ts`

#### `generate-report`

**Name:** Generate Report

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "metric": {
      "type": "string"
    },
    "period": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "report": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/analytics/index.ts)

#### `identify-trends`

**Name:** Identify Trends

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dataset": {
      "type": "string"
    },
    "timeframe": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "trends": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/analytics/index.ts)

### Career

> Category source: `services/tool-executor/src/data/skills/career/index.ts`

#### `career_setup`

**Name:** Career Setup

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "description": "Unique identifier for this profile (default: \"default\")"
    },
    "name": {
      "type": "string",
      "description": "Full name"
    },
    "email": {
      "type": "string",
      "description": "Primary email address"
    },
    "phone": {
      "type": "string",
      "description": "Phone number"
    },
    "location": {
      "type": "string",
      "description": "Current city/region"
    },
    "linkedinUrl": {
      "type": "string",
      "description": "LinkedIn profile URL"
    },
    "githubUrl": {
      "type": "string",
      "description": "GitHub profile URL"
    },
    "portfolioUrl": {
      "type": "string",
      "description": "Portfolio website URL"
    },
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Job titles to pursue"
    },
    "targetCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Companies of interest"
    },
    "industries": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "workArrangement": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "enum": [
        "onsite",
        "hybrid",
        "remote"
      ]
    },
    "minSalary": {
      "type": "number"
    },
    "maxSalary": {
      "type": "number"
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "excludeCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "profileId": "string",
    "profilePath": "string",
    "workspace": "string",
    "directoriesCreated": "array",
    "profile": "object"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_scrape`

**Name:** Scrape Job Listings

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Single search query"
    },
    "queries": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Multiple search queries"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Portal keys to scrape"
    },
    "location": {
      "type": "string"
    },
    "remoteOnly": {
      "type": "boolean"
    },
    "maxResults": {
      "type": "number",
      "default": 50
    },
    "targetCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "minSalary": {
      "type": "number"
    },
    "maxSalary": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "listings": "array",
    "total": "number",
    "storagePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_apply`

**Name:** Apply to Jobs

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "jobId": {
      "type": "string",
      "description": "Single job ID to apply to"
    },
    "jobIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Bulk apply to multiple jobs"
    },
    "resumeId": {
      "type": "string",
      "default": "default"
    },
    "coverLetterId": {
      "type": "string"
    },
    "bulk": {
      "type": "boolean",
      "default": false
    },
    "dryRun": {
      "type": "boolean",
      "default": false,
      "description": "Simulate without submitting"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "applications": "array",
    "errors": "array",
    "submitted": "number",
    "trackingPath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_rank`

**Name:** Rank Opportunities

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "jobIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "weights": {
      "type": "object",
      "description": "Custom weight overrides"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "ranked": "array",
    "totalScored": "number",
    "rankPath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_interview`

**Name:** Interview Prep

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "prepare",
        "schedule",
        "complete"
      ]
    },
    "jobId": {
      "type": "string"
    },
    "company": {
      "type": "string"
    },
    "role": {
      "type": "string"
    },
    "interviewType": {
      "type": "string"
    },
    "scheduledAt": {
      "type": "string"
    },
    "notes": {
      "type": "string"
    },
    "outcome": {
      "type": "string"
    },
    "feedback": {
      "type": "string"
    },
    "likelyQuestions": {
      "type": "array"
    },
    "starOutlines": {
      "type": "array"
    },
    "questionsToAsk": {
      "type": "array"
    },
    "companyOverview": {
      "type": "string"
    },
    "recentNews": {
      "type": "array"
    },
    "competitors": {
      "type": "array"
    },
    "practiceLog": {
      "type": "array"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "prep": "object",
    "entry": "object",
    "prepPath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_outcome`

**Name:** Track Outcomes

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "jobId": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "offer",
        "rejection",
        "interview",
        "screening",
        "no_response",
        "withdrawn"
      ]
    },
    "company": {
      "type": "string"
    },
    "role": {
      "type": "string"
    },
    "salaryOffered": {
      "type": "number"
    },
    "notes": {
      "type": "string"
    },
    "date": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "entry": "object",
    "stats": "object",
    "trackingPath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_expand`

**Name:** Expand Search

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "currentRoles": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "currentCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "currentKeywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "industries": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "competitors": {
      "type": "object",
      "description": "Map of company -> competitor list"
    },
    "adjacentCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "expanded": "object",
    "outPath": "string",
    "newTitles": "number",
    "newCompanies": "number"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_upskill`

**Name:** Upskill Plan

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "targetRole": {
      "type": "string"
    },
    "currentSkills": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "desiredSkills": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "weeks": {
      "type": "number",
      "default": 12
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "plan": "object",
    "outPath": "string",
    "gapsCount": "number",
    "milestonesCount": "number"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_html_report`

**Name:** HTML Report

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "reportType": {
      "type": "string",
      "enum": [
        "summary",
        "weekly",
        "monthly",
        "full"
      ]
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "html": "string",
    "outPath": "string",
    "stats": "object"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_notion_sync`

**Name:** Notion Sync

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "token": {
      "type": "string",
      "description": "Notion integration token (overrides NOTION_TOKEN env)"
    },
    "databaseId": {
      "type": "string"
    },
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "entityTypes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "direction": {
      "type": "string",
      "enum": [
        "push",
        "pull",
        "both"
      ]
    },
    "dryRun": {
      "type": "boolean",
      "default": false
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "data": "object"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_gmail_sync`

**Name:** Gmail Sync

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "accessToken": {
      "type": "string"
    },
    "refreshToken": {
      "type": "string"
    },
    "clientId": {
      "type": "string"
    },
    "clientSecret": {
      "type": "string"
    },
    "query": {
      "type": "string"
    },
    "maxResults": {
      "type": "number",
      "default": 25
    },
    "markRead": {
      "type": "boolean",
      "default": false
    },
    "dryRun": {
      "type": "boolean",
      "default": false
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "data": "object"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_add_template`

**Name:** Add Template

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "resume",
        "cover_letter"
      ]
    },
    "name": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "variables": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "description": {
      "type": "string"
    },
    "profileId": {
      "type": "string",
      "default": "default"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "template": "object",
    "outPath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_add_portal`

**Name:** Add Portal

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "baseUrl": {
      "type": "string"
    },
    "searchUrlTemplate": {
      "type": "string"
    },
    "selectors": {
      "type": "object"
    },
    "auth": {
      "type": "object",
      "description": "Auth config: { type: \"bearer\", token } | { type: \"basic\", username, password } | { type: \"api_key\", header, value } | { type: \"custom\", headers }. Use ${ENV_VAR} for secret references."
    },
    "submitUrlTemplate": {
      "type": "string",
      "description": "URL template for submitting applications (supports {jobId}, {applyUrl} placeholders)"
    },
    "submitMethod": {
      "type": "string",
      "enum": [
        "POST",
        "GET",
        "PUT"
      ],
      "default": "POST"
    },
    "submitBodyTemplate": {
      "type": "string",
      "description": "JSON body template for submissions (supports {resume}, {coverLetter}, {job} placeholders)"
    },
    "submitHeaders": {
      "type": "object",
      "description": "Extra headers for submission requests"
    },
    "enabled": {
      "type": "boolean",
      "default": true
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "portal": "object",
    "portalsPath": "string",
    "totalPortals": "number"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career_reset`

**Name:** Reset Workspace

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "enum": [
        "full",
        "profile",
        "applications",
        "interviews",
        "outcomes",
        "all_data"
      ]
    },
    "confirm": {
      "type": "boolean",
      "default": false
    },
    "archive": {
      "type": "boolean",
      "default": true
    },
    "profileId": {
      "type": "string",
      "default": "default"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "data": "object"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-resume-optimizer`

**Name:** Resume Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Resume optimizer service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Resume optimizer API key"
    },
    "provider": {
      "type": "string",
      "description": "Resume optimization provider"
    },
    "targetRole": {
      "type": "string",
      "description": "Default target role"
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "Current resume text"
    },
    "jobDescription": {
      "type": "string",
      "description": "Target job description"
    },
    "targetRole": {
      "type": "string",
      "description": "Target role or title"
    },
    "achievements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Candidate achievements to emphasize"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Keywords to incorporate"
    },
    "tone": {
      "type": "string",
      "enum": [
        "concise",
        "achievement-focused",
        "technical",
        "executive"
      ]
    },
    "outputFormat": {
      "type": "string",
      "enum": [
        "text",
        "markdown",
        "json"
      ]
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "resumeText",
    "targetRole"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-resume-analyzer`

**Name:** Resume Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Resume analyzer service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Resume analyzer API key"
    },
    "provider": {
      "type": "string",
      "description": "Resume analysis provider"
    },
    "scoringModel": {
      "type": "string",
      "description": "Scoring model or version"
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "Resume text to analyze"
    },
    "jobDescription": {
      "type": "string",
      "description": "Job description for comparison"
    },
    "role": {
      "type": "string",
      "description": "Target role"
    },
    "criteria": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Evaluation criteria"
    },
    "includeSuggestions": {
      "type": "boolean",
      "default": true
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "resumeText"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-resume-formatter`

**Name:** Resume Formatter

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Resume formatter service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Resume formatter API key"
    },
    "provider": {
      "type": "string",
      "description": "Resume formatting provider"
    },
    "defaultFormat": {
      "type": "string",
      "enum": [
        "text",
        "markdown",
        "html",
        "pdf",
        "json"
      ]
    },
    "template": {
      "type": "string",
      "description": "Default resume template"
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "Resume content to format"
    },
    "format": {
      "type": "string",
      "enum": [
        "text",
        "markdown",
        "html",
        "pdf",
        "json"
      ],
      "description": "Requested output format"
    },
    "template": {
      "type": "string",
      "description": "Template name or identifier"
    },
    "sections": {
      "type": "object",
      "description": "Structured resume sections"
    },
    "includeCoverLetter": {
      "type": "boolean",
      "default": false
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "resumeText",
    "format"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-application-monitor`

**Name:** Application Monitor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Application monitoring service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Application monitoring API key"
    },
    "provider": {
      "type": "string",
      "description": "Application tracking provider"
    },
    "refreshIntervalMinutes": {
      "type": "number",
      "minimum": 1
    },
    "defaultLookbackDays": {
      "type": "number",
      "minimum": 1
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "applicationIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Application identifiers to monitor"
    },
    "jobId": {
      "type": "string",
      "description": "Optional job identifier filter"
    },
    "company": {
      "type": "string",
      "description": "Optional company filter"
    },
    "statusFilters": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Statuses to include"
    },
    "startDate": {
      "type": "string",
      "description": "Start of monitoring window"
    },
    "endDate": {
      "type": "string",
      "description": "End of monitoring window"
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "applicationIds"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-followup-advisor`

**Name:** Follow-up Advisor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Follow-up advisor service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Follow-up advisor API key"
    },
    "provider": {
      "type": "string",
      "description": "Follow-up advice provider"
    },
    "defaultTone": {
      "type": "string",
      "enum": [
        "professional",
        "warm",
        "concise",
        "persistent"
      ]
    },
    "defaultChannel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin",
        "phone",
        "portal"
      ]
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "applicationId": {
      "type": "string",
      "description": "Application identifier"
    },
    "company": {
      "type": "string",
      "description": "Company name"
    },
    "role": {
      "type": "string",
      "description": "Target role"
    },
    "lastContactDate": {
      "type": "string",
      "description": "Date of the most recent contact"
    },
    "currentStatus": {
      "type": "string",
      "enum": [
        "applied",
        "screening",
        "interview",
        "offer",
        "rejected",
        "no-response"
      ]
    },
    "communicationHistory": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Prior messages and responses"
    },
    "tone": {
      "type": "string",
      "enum": [
        "professional",
        "warm",
        "concise",
        "persistent"
      ]
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin",
        "phone",
        "portal"
      ]
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "applicationId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-salary-analyzer`

**Name:** Salary Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Salary analysis service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Salary analysis API key"
    },
    "provider": {
      "type": "string",
      "description": "Compensation data provider"
    },
    "defaultCurrency": {
      "type": "string",
      "description": "Default currency code"
    },
    "marketDataSource": {
      "type": "string",
      "description": "Market data source"
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "description": "Role or job title"
    },
    "location": {
      "type": "string",
      "description": "Job location or market"
    },
    "experienceYears": {
      "type": "number",
      "minimum": 0
    },
    "currentSalary": {
      "type": "number",
      "description": "Current annual compensation"
    },
    "offerSalary": {
      "type": "number",
      "description": "Offered annual compensation"
    },
    "currency": {
      "type": "string",
      "description": "Currency code"
    },
    "marketBenchmarks": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Comparable compensation records"
    },
    "skills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Relevant skills"
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "role"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-negotiation-advisor`

**Name:** Negotiation Advisor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Negotiation advisor service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Negotiation advisor API key"
    },
    "provider": {
      "type": "string",
      "description": "Negotiation advice provider"
    },
    "defaultCurrency": {
      "type": "string",
      "description": "Default currency code"
    },
    "negotiationStyle": {
      "type": "string",
      "enum": [
        "collaborative",
        "assertive",
        "data-driven",
        "relationship-focused"
      ]
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "description": "Offered role"
    },
    "company": {
      "type": "string",
      "description": "Offering company"
    },
    "offer": {
      "type": "object",
      "description": "Offer compensation and terms",
      "properties": {
        "baseSalary": {
          "type": "number"
        },
        "bonus": {
          "type": "number"
        },
        "equity": {
          "type": "number"
        },
        "benefits": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "deadline": {
          "type": "string"
        }
      }
    },
    "priorities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Negotiation priorities"
    },
    "constraints": {
      "type": "object",
      "description": "Candidate constraints and alternatives"
    },
    "communicationHistory": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Prior offer discussions"
    },
    "negotiationStyle": {
      "type": "string",
      "enum": [
        "collaborative",
        "assertive",
        "data-driven",
        "relationship-focused"
      ]
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "role",
    "offer"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-offer-evaluator`

**Name:** Offer Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Offer evaluation service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Offer evaluation API key"
    },
    "provider": {
      "type": "string",
      "description": "Offer evaluation provider"
    },
    "defaultCurrency": {
      "type": "string",
      "description": "Default currency code"
    },
    "evaluationCriteria": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default offer evaluation criteria"
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "description": "Offered role"
    },
    "company": {
      "type": "string",
      "description": "Offering company"
    },
    "offer": {
      "type": "object",
      "description": "Offer compensation and terms",
      "properties": {
        "baseSalary": {
          "type": "number"
        },
        "bonus": {
          "type": "number"
        },
        "equity": {
          "type": "number"
        },
        "benefits": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "location": {
          "type": "string"
        },
        "workArrangement": {
          "type": "string",
          "enum": [
            "onsite",
            "hybrid",
            "remote"
          ]
        },
        "deadline": {
          "type": "string"
        }
      }
    },
    "alternatives": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Alternative offers or opportunities"
    },
    "priorities": {
      "type": "object",
      "description": "Candidate priorities and weights"
    },
    "weights": {
      "type": "object",
      "description": "Criteria weights"
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "role",
    "offer"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-networking-advisor`

**Name:** Networking Advisor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "description": "Networking advisor service endpoint"
    },
    "apiKey": {
      "type": "string",
      "description": "Networking advisor API key"
    },
    "provider": {
      "type": "string",
      "description": "Networking advice provider"
    },
    "defaultTone": {
      "type": "string",
      "enum": [
        "professional",
        "warm",
        "concise",
        "curious"
      ]
    },
    "outreachChannels": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "email",
          "linkedin",
          "phone",
          "event"
        ]
      }
    }
  },
  "required": [
    "endpointUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetRole": {
      "type": "string",
      "description": "Role or career area to target"
    },
    "targetCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Companies to research or approach"
    },
    "targetPeople": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "People or contact profiles"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Networking goals"
    },
    "context": {
      "type": "string",
      "description": "Candidate background and search context"
    },
    "tone": {
      "type": "string",
      "enum": [
        "professional",
        "warm",
        "concise",
        "curious"
      ]
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin",
        "phone",
        "event"
      ]
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional per-request endpoint override"
    }
  },
  "required": [
    "targetRole"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

### Content

> Category source: `services/tool-executor/src/data/skills/content/index.ts`

#### `draft-blog-post`

**Name:** Draft Blog Post

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "topic": {
      "type": "string",
      "title": "Topic",
      "description": "What should the blog post be about?"
    },
    "wordCount": {
      "type": "number",
      "title": "Word count",
      "description": "Target length for the post."
    },
    "audience": {
      "type": "string",
      "title": "Audience",
      "description": "Who is the post for?"
    },
    "tone": {
      "type": "string",
      "title": "Tone",
      "description": "Writing style, such as professional or conversational."
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "post": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `social-media-post`

**Name:** Social Media Post

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "title": "Platform",
      "description": "Where should this post be published?"
    },
    "message": {
      "type": "string",
      "title": "Message",
      "description": "What should the post say?",
      "multiline": true
    },
    "hashtags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "title": "Hashtags",
      "description": "Hashtags to include, separated by commas."
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "post": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-trend-analysis`

**Name:** Content Trend Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "title": "Base URL",
      "description": "Trend analysis platform base URL."
    },
    "apiKey": {
      "type": "string",
      "title": "API key",
      "description": "API key for the trend analysis platform."
    },
    "provider": {
      "type": "string",
      "title": "Provider",
      "description": "Trend data provider to use.",
      "enum": [
        "google-trends",
        "exploding-topics",
        "buzzsumo",
        "custom"
      ]
    },
    "defaultRegion": {
      "type": "string",
      "title": "Default region",
      "description": "Region used when an analysis does not specify one."
    },
    "timeRange": {
      "type": "string",
      "title": "Default time range",
      "description": "Default period for trend analysis.",
      "enum": [
        "day",
        "week",
        "month",
        "quarter",
        "year"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "title": "Analysis type",
      "description": "Choose the trend analysis to run.",
      "enum": [
        "analyze",
        "compare",
        "forecast",
        "monitor"
      ]
    },
    "topic": {
      "type": "string",
      "title": "Topic",
      "description": "Subject or theme to analyze."
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "title": "Keywords",
      "description": "Keywords to include, separated by commas."
    },
    "platform": {
      "type": "string",
      "title": "Platform",
      "description": "Platform or channel to analyze.",
      "enum": [
        "all",
        "web",
        "social",
        "news",
        "video",
        "search"
      ]
    },
    "region": {
      "type": "string",
      "title": "Region",
      "description": "Geographic region for the analysis."
    },
    "timeRange": {
      "type": "string",
      "title": "Time range",
      "description": "Period to include in the analysis."
    },
    "competitorUrls": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "title": "Competitor websites",
      "description": "Competitor URLs to compare, separated by commas."
    },
    "endpointUrl": {
      "type": "string",
      "title": "Endpoint URL",
      "description": "Optional endpoint override for this run."
    },
    "dryRun": {
      "type": "boolean",
      "title": "Test mode",
      "description": "Validate the request without sending it live."
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-audience-insights`

**Name:** Content Audience Insights

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Audience insights platform base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Audience insights bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-analytics",
        "segment",
        "salesforce",
        "custom"
      ]
    },
    "defaultSegment": {
      "type": "string"
    },
    "dataSources": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "segment",
        "profile",
        "analyze",
        "compare",
        "enrich"
      ]
    },
    "audienceId": {
      "type": "string"
    },
    "contentIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "demographics": {
      "type": "object"
    },
    "interests": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "behaviors": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "dateRange": {
      "type": "object"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-adaptation`

**Name:** Content Adaptation

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Content adaptation platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Content adaptation API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "openai",
        "anthropic",
        "custom"
      ]
    },
    "defaultModel": {
      "type": "string"
    },
    "supportedFormats": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "supportedLanguages": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "summarize",
        "expand",
        "translate",
        "reformat",
        "localize",
        "repurpose"
      ]
    },
    "sourceContent": {
      "type": "string"
    },
    "sourceFormat": {
      "type": "string"
    },
    "targetFormat": {
      "type": "string"
    },
    "targetPlatform": {
      "type": "string"
    },
    "targetLanguage": {
      "type": "string"
    },
    "targetAudience": {
      "type": "string"
    },
    "tone": {
      "type": "string"
    },
    "length": {
      "type": "string",
      "enum": [
        "short",
        "medium",
        "long"
      ]
    },
    "preserveKeywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation",
    "sourceContent"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-seo`

**Name:** Content SEO

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "SEO platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "SEO platform API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "semrush",
        "ahrefs",
        "google-search-console",
        "custom"
      ]
    },
    "defaultMarket": {
      "type": "string"
    },
    "searchEngines": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "audit",
        "research",
        "optimize",
        "track",
        "analyze"
      ]
    },
    "url": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "targetKeywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "market": {
      "type": "string"
    },
    "searchEngine": {
      "type": "string"
    },
    "competitorUrls": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-blog-platform`

**Name:** Content Blog Platform

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Blog platform base URL"
    },
    "token": {
      "type": "string",
      "description": "Blog platform bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "wordpress",
        "ghost",
        "medium",
        "substack",
        "contentful",
        "custom"
      ]
    },
    "defaultCategory": {
      "type": "string"
    },
    "defaultTags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "publish",
        "schedule",
        "delete",
        "get"
      ]
    },
    "title": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "excerpt": {
      "type": "string"
    },
    "category": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "slug": {
      "type": "string"
    },
    "featuredImage": {
      "type": "string"
    },
    "seoTitle": {
      "type": "string"
    },
    "seoDescription": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "draft",
        "published",
        "scheduled",
        "private"
      ]
    },
    "scheduledAt": {
      "type": "string"
    },
    "postId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-video-platform`

**Name:** Content Video Platform

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Video platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Video platform API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "youtube",
        "vimeo",
        "wistia",
        "mux",
        "custom"
      ]
    },
    "defaultPrivacy": {
      "type": "string",
      "enum": [
        "public",
        "unlisted",
        "private"
      ]
    },
    "defaultCategory": {
      "type": "string"
    },
    "thumbnailSizes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "upload",
        "update",
        "publish",
        "schedule",
        "delete",
        "get",
        "optimize"
      ]
    },
    "videoId": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "category": {
      "type": "string"
    },
    "privacy": {
      "type": "string",
      "enum": [
        "public",
        "unlisted",
        "private"
      ]
    },
    "thumbnailUrl": {
      "type": "string"
    },
    "videoFile": {
      "type": "string"
    },
    "videoUrl": {
      "type": "string"
    },
    "playlistId": {
      "type": "string"
    },
    "scheduledAt": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-analytics`

**Name:** Content Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Content analytics platform base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Content analytics bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-analytics",
        "matomo",
        "mixpanel",
        "amplitude",
        "custom"
      ]
    },
    "defaultDateRange": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "overview",
        "detail",
        "compare",
        "trend",
        "report",
        "export"
      ]
    },
    "contentIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "channel": {
      "type": "string"
    },
    "platform": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    },
    "groupBy": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-planner`

**Name:** Content Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Content planner platform base URL"
    },
    "token": {
      "type": "string",
      "description": "Content planner bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "notion",
        "airtable",
        "asana",
        "trello",
        "monday",
        "custom"
      ]
    },
    "defaultWorkspace": {
      "type": "string"
    },
    "defaultCalendar": {
      "type": "string"
    },
    "workflowStages": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "schedule",
        "move",
        "assign",
        "list",
        "calendar"
      ]
    },
    "contentId": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "contentType": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "idea",
        "planned",
        "in-progress",
        "review",
        "approved",
        "scheduled",
        "published",
        "archived"
      ]
    },
    "assignee": {
      "type": "string"
    },
    "dueDate": {
      "type": "string"
    },
    "publishDate": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "campaignId": {
      "type": "string"
    },
    "parentId": {
      "type": "string"
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "view": {
      "type": "string",
      "enum": [
        "list",
        "calendar",
        "board",
        "timeline"
      ]
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

### Creative

> Category source: `services/tool-executor/src/data/skills/creative/index.ts`

#### `write-lyrics`

**Name:** Write Lyrics

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "theme": {
      "type": "string"
    },
    "genre": {
      "type": "string"
    },
    "mood": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "lyrics": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/creative/index.ts)

#### `write-script`

**Name:** Write Script

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string"
    },
    "topic": {
      "type": "string"
    },
    "duration": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "script": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/creative/index.ts)

#### `scriptwriter-content-planner`

**Name:** Scriptwriter Content Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Scriptwriting system base URL"
    },
    "token": {
      "type": "string",
      "description": "Scriptwriting system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "final-draft",
        "celtx",
        "writerduet",
        "google-docs",
        "custom"
      ]
    },
    "defaultFormat": {
      "type": "string",
      "enum": [
        "video",
        "podcast",
        "presentation",
        "film"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "plan",
        "outline",
        "write",
        "revise",
        "structure",
        "generate"
      ]
    },
    "format": {
      "type": "string",
      "enum": [
        "video",
        "podcast",
        "presentation",
        "film"
      ]
    },
    "topic": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "targetDuration": {
      "type": "number"
    },
    "audience": {
      "type": "string"
    },
    "tone": {
      "type": "string"
    },
    "style": {
      "type": "string"
    },
    "episode": {
      "type": "string"
    },
    "sceneCount": {
      "type": "number"
    },
    "content": {
      "type": "string"
    },
    "outline": {
      "type": "object"
    },
    "campaignId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/creative/index.ts)

#### `songwriter-trend-analysis`

**Name:** Songwriter Trend Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Songwriting analytics system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Songwriting analytics API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "spotify",
        "soundcharts",
        "billboard",
        "musixmatch",
        "custom"
      ]
    },
    "defaultMarket": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "trends",
        "charts",
        "genre-signals",
        "audience-preferences",
        "compare"
      ]
    },
    "genre": {
      "type": "string"
    },
    "market": {
      "type": "string"
    },
    "timeframe": {
      "type": "string"
    },
    "artist": {
      "type": "string"
    },
    "track": {
      "type": "string"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "limit": {
      "type": "number"
    },
    "song": {
      "type": "object"
    },
    "campaignId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/creative/index.ts)

### CTO

> Category source: `services/tool-executor/src/data/skills/cto/index.ts`

#### `architecture-review`

**Name:** Architecture Review

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "requirements": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "review": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `tech-stack-recommendation`

**Name:** Tech Stack Recommendation

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "project": {
      "type": "string"
    },
    "scale": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "recommendation": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-jira`

**Name:** Jira

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "projectKey": {
      "type": "string",
      "description": "Default Jira project key"
    },
    "issueType": {
      "type": "string",
      "description": "Default Jira issue type"
    },
    "defaultAssignee": {
      "type": "string",
      "description": "Default issue assignee"
    },
    "environment": {
      "type": "string",
      "enum": [
        "development",
        "staging",
        "production"
      ],
      "description": "Deployment environment"
    }
  },
  "required": [
    "projectKey",
    "issueType"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "createIssue",
        "getIssueDetails",
        "updateIssueStatus",
        "queryIssues"
      ],
      "description": "Jira operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific Jira data",
      "properties": {
        "issue": {
          "type": "object",
          "description": "Issue fields"
        },
        "issueIdOrKey": {
          "type": "string",
          "description": "Issue ID or key"
        },
        "newStatus": {
          "type": "string",
          "description": "New issue status"
        },
        "jqlQuery": {
          "type": "string",
          "description": "Jira JQL query"
        },
        "projectKey": {
          "type": "string",
          "description": "Project key"
        },
        "labels": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Issue labels"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action",
    "payload"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-datadog`

**Name:** Datadog

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "site": {
      "type": "string",
      "enum": [
        "us1",
        "us3",
        "us5",
        "eu"
      ],
      "description": "Datadog site"
    },
    "defaultService": {
      "type": "string",
      "description": "Default service filter"
    },
    "defaultTimeRange": {
      "type": "string",
      "description": "Default query time range"
    }
  },
  "required": [
    "site"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getDoraMetrics",
        "getSystemHealth"
      ],
      "description": "Datadog operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific Datadog query data",
      "properties": {
        "service": {
          "type": "string",
          "description": "Service filter"
        },
        "query": {
          "type": "string",
          "description": "Datadog query"
        },
        "timeRange": {
          "type": "string",
          "description": "Query time range"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-github`

**Name:** GitHub

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "apiVersion": {
      "type": "string",
      "description": "GitHub API version"
    },
    "defaultOwner": {
      "type": "string",
      "description": "Default repository owner or organization"
    },
    "defaultVisibility": {
      "type": "string",
      "enum": [
        "public",
        "private",
        "internal"
      ],
      "description": "Default repository visibility"
    }
  },
  "required": [
    "apiVersion"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getSecurityAlerts",
        "getRepositoryStats"
      ],
      "description": "GitHub operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific GitHub query data",
      "properties": {
        "repository": {
          "type": "string",
          "description": "Repository in owner/name form"
        },
        "severity": {
          "type": "string",
          "enum": [
            "Critical",
            "High",
            "Medium",
            "Low"
          ],
          "description": "Alert severity filter"
        },
        "branch": {
          "type": "string",
          "description": "Branch filter"
        },
        "includeVulnerabilities": {
          "type": "boolean",
          "description": "Include vulnerability data"
        }
      },
      "required": [
        "repository"
      ]
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action",
    "payload"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-aws`

**Name:** AWS

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "region": {
      "type": "string",
      "description": "Default AWS region"
    },
    "defaultResourceType": {
      "type": "string",
      "description": "Default resource type"
    },
    "costPeriod": {
      "type": "string",
      "enum": [
        "DAILY",
        "MONTHLY",
        "QUARTERLY",
        "YEARLY"
      ],
      "description": "Default cost reporting period"
    }
  },
  "required": [
    "region"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getCloudSpend",
        "getResourceStatus"
      ],
      "description": "AWS operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific AWS query data",
      "properties": {
        "period": {
          "type": "string",
          "enum": [
            "DAILY",
            "MONTHLY",
            "QUARTERLY",
            "YEARLY"
          ],
          "description": "Cost reporting period"
        },
        "resourceType": {
          "type": "string",
          "description": "AWS resource type"
        },
        "resourceId": {
          "type": "string",
          "description": "AWS resource ID"
        },
        "includeTags": {
          "type": "boolean",
          "description": "Include resource tags"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-gcp`

**Name:** GCP

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "projectId": {
      "type": "string",
      "description": "Default Google Cloud project"
    },
    "region": {
      "type": "string",
      "description": "Default Google Cloud region"
    },
    "defaultResourceType": {
      "type": "string",
      "description": "Default resource type"
    }
  },
  "required": [
    "projectId"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getCloudSpend",
        "getResourceStatus"
      ],
      "description": "GCP operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific GCP query data",
      "properties": {
        "period": {
          "type": "string",
          "enum": [
            "DAILY",
            "MONTHLY",
            "QUARTERLY",
            "YEARLY"
          ],
          "description": "Cost reporting period"
        },
        "resourceType": {
          "type": "string",
          "description": "GCP resource type"
        },
        "resourceId": {
          "type": "string",
          "description": "GCP resource ID"
        },
        "includeLabels": {
          "type": "boolean",
          "description": "Include resource labels"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-azure`

**Name:** Azure

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "subscriptionId": {
      "type": "string",
      "description": "Default Azure subscription"
    },
    "region": {
      "type": "string",
      "description": "Default Azure region"
    },
    "defaultResourceType": {
      "type": "string",
      "description": "Default resource type"
    }
  },
  "required": [
    "subscriptionId"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getCloudSpend",
        "getResourceStatus"
      ],
      "description": "Azure operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific Azure query data",
      "properties": {
        "period": {
          "type": "string",
          "enum": [
            "DAILY",
            "MONTHLY",
            "QUARTERLY",
            "YEARLY"
          ],
          "description": "Cost reporting period"
        },
        "resourceType": {
          "type": "string",
          "description": "Azure resource type"
        },
        "resourceId": {
          "type": "string",
          "description": "Azure resource ID"
        },
        "includeTags": {
          "type": "boolean",
          "description": "Include resource tags"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-pagerduty`

**Name:** PagerDuty

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultTeam": {
      "type": "string",
      "description": "Default PagerDuty team"
    },
    "escalationPolicyId": {
      "type": "string",
      "description": "Default escalation policy"
    },
    "apiVersion": {
      "type": "string",
      "description": "PagerDuty API version"
    }
  },
  "required": [
    "defaultTeam"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "getActiveIncidents",
        "getOnCallSchedule"
      ],
      "description": "PagerDuty operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific PagerDuty query data",
      "properties": {
        "team": {
          "type": "string",
          "description": "Team filter"
        },
        "since": {
          "type": "string",
          "description": "Start time"
        },
        "until": {
          "type": "string",
          "description": "End time"
        },
        "timeZone": {
          "type": "string",
          "description": "Time zone"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-kubernetes`

**Name:** Kubernetes

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "clusterName": {
      "type": "string",
      "description": "Default Kubernetes cluster"
    },
    "defaultNamespace": {
      "type": "string",
      "description": "Default namespace"
    },
    "context": {
      "type": "string",
      "description": "Kubernetes context"
    }
  },
  "required": [
    "clusterName"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get_pod_status",
        "scan_image_vulnerabilities",
        "get_resource_utilization",
        "get_cluster_health",
        "identify_at_risk_pods",
        "get_namespace_summary"
      ],
      "description": "Kubernetes operation to perform"
    },
    "namespace": {
      "type": "string",
      "description": "Namespace to query"
    },
    "pod_name": {
      "type": "string",
      "description": "Pod name to query"
    },
    "image": {
      "type": "string",
      "description": "Container image to scan"
    },
    "severity_threshold": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ],
      "description": "Minimum vulnerability severity"
    },
    "resource_threshold_percent": {
      "type": "number",
      "description": "Resource alert threshold"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific Kubernetes query data",
      "properties": {
        "clusterName": {
          "type": "string",
          "description": "Cluster name"
        },
        "region": {
          "type": "string",
          "description": "Region"
        },
        "environment": {
          "type": "string",
          "description": "Environment"
        },
        "deploymentName": {
          "type": "string",
          "description": "Deployment name"
        },
        "registryType": {
          "type": "string",
          "description": "Image registry type"
        },
        "includeOS": {
          "type": "boolean",
          "description": "Include operating-system vulnerabilities"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-cost-optimization`

**Name:** Cost Optimization

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "cloudProvider": {
      "type": "string",
      "enum": [
        "aws",
        "gcp",
        "azure",
        "multi"
      ],
      "description": "Default cloud provider scope"
    },
    "defaultDays": {
      "type": "number",
      "description": "Default analysis window in days"
    },
    "currency": {
      "type": "string",
      "description": "Reporting currency"
    },
    "anomalyThreshold": {
      "type": "number",
      "description": "Default anomaly threshold percentage"
    }
  },
  "required": [
    "cloudProvider"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "analyze_spending",
        "detect_anomalies",
        "forecast_costs",
        "recommend_reserved_instances",
        "identify_waste",
        "get_cost_by_service",
        "get_cost_trends"
      ],
      "description": "Cost operation to perform"
    },
    "days": {
      "type": "number",
      "description": "Analysis window in days"
    },
    "forecast_days": {
      "type": "number",
      "description": "Forecast window in days"
    },
    "cloud_provider": {
      "type": "string",
      "enum": [
        "aws",
        "gcp",
        "azure",
        "multi"
      ],
      "description": "Cloud provider scope"
    },
    "anomaly_threshold": {
      "type": "number",
      "description": "Anomaly threshold percentage"
    },
    "confidence_level": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high"
      ],
      "description": "Recommendation confidence"
    },
    "waste_threshold_percent": {
      "type": "number",
      "description": "Waste utilization threshold"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific cost query data"
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-team-metrics`

**Name:** Team Metrics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultTeamId": {
      "type": "string",
      "description": "Default engineering team"
    },
    "defaultDays": {
      "type": "number",
      "description": "Default analysis window in days"
    },
    "forecastMonths": {
      "type": "number",
      "description": "Default capacity forecast horizon"
    }
  },
  "required": [
    "defaultTeamId"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get_team_capacity",
        "analyze_on_call_metrics",
        "identify_burnout_risks",
        "forecast_capacity",
        "get_mttr_metrics",
        "get_team_health",
        "get_oncall_coverage"
      ],
      "description": "Team metrics operation to perform"
    },
    "team_id": {
      "type": "string",
      "description": "Team identifier"
    },
    "days": {
      "type": "number",
      "description": "Analysis window in days"
    },
    "forecast_months": {
      "type": "number",
      "description": "Forecast horizon in months"
    },
    "burnout_threshold": {
      "type": "number",
      "description": "Burnout risk hours-per-week threshold"
    },
    "include_vacation": {
      "type": "boolean",
      "description": "Include vacation in capacity calculations"
    },
    "confidence_level": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high"
      ],
      "description": "Forecast confidence"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific team metrics data"
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-iac-monitoring`

**Name:** IaC Monitoring

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "tool": {
      "type": "string",
      "enum": [
        "terraform",
        "cloudformation",
        "both"
      ],
      "description": "Default infrastructure-as-code tool"
    },
    "defaultWorkspace": {
      "type": "string",
      "description": "Default Terraform workspace or stack"
    },
    "complianceFramework": {
      "type": "string",
      "description": "Default compliance framework"
    }
  },
  "required": [
    "tool"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "scan_drift",
        "get_compliance_status",
        "identify_non_compliant_resources",
        "get_drift_history"
      ],
      "description": "IaC monitoring operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific IaC query data",
      "properties": {
        "tool": {
          "type": "string",
          "enum": [
            "terraform",
            "cloudformation",
            "both"
          ],
          "description": "IaC tool"
        },
        "workspace": {
          "type": "string",
          "description": "Workspace or stack name"
        },
        "severity_threshold": {
          "type": "string",
          "enum": [
            "critical",
            "high",
            "medium",
            "low"
          ],
          "description": "Severity filter"
        },
        "environment": {
          "type": "string",
          "description": "Environment"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action",
    "payload"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-database-operations`

**Name:** Database Operations

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultDatabaseType": {
      "type": "string",
      "enum": [
        "postgres",
        "mysql",
        "mongodb",
        "dynamodb",
        "all"
      ],
      "description": "Default database platform"
    },
    "retentionDays": {
      "type": "number",
      "description": "Default metric retention window"
    },
    "alertThresholdPercent": {
      "type": "number",
      "description": "Default resource alert threshold"
    }
  },
  "required": [
    "defaultDatabaseType"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get_instance_health",
        "get_backup_status",
        "analyze_performance",
        "check_scaling_readiness",
        "get_replication_status"
      ],
      "description": "Database operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific database query data",
      "properties": {
        "database_type": {
          "type": "string",
          "enum": [
            "postgres",
            "mysql",
            "mongodb",
            "dynamodb",
            "all"
          ],
          "description": "Database platform"
        },
        "instance_name": {
          "type": "string",
          "description": "Database instance name"
        },
        "hours": {
          "type": "number",
          "description": "Analysis window in hours"
        },
        "environment": {
          "type": "string",
          "description": "Environment"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-service-mesh`

**Name:** Service Mesh

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultMesh": {
      "type": "string",
      "enum": [
        "istio",
        "linkerd",
        "consul"
      ],
      "description": "Default service mesh"
    },
    "defaultNamespace": {
      "type": "string",
      "description": "Default namespace"
    },
    "latencyThresholdMs": {
      "type": "number",
      "description": "Default latency threshold"
    }
  },
  "required": [
    "defaultMesh"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get_mesh_status",
        "get_service_dependencies",
        "analyze_latency",
        "check_traffic_policies",
        "identify_bottlenecks"
      ],
      "description": "Service mesh operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific service mesh query data",
      "properties": {
        "mesh_name": {
          "type": "string",
          "enum": [
            "istio",
            "linkerd",
            "consul"
          ],
          "description": "Service mesh name"
        },
        "namespace": {
          "type": "string",
          "description": "Namespace"
        },
        "service_name": {
          "type": "string",
          "description": "Service name"
        },
        "latency_threshold_ms": {
          "type": "number",
          "description": "Latency threshold in milliseconds"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action",
    "payload"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-disaster-recovery`

**Name:** Disaster Recovery

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultRecoveryTarget": {
      "type": "string",
      "enum": [
        "primary_database",
        "backup_location",
        "secondary_region"
      ],
      "description": "Default recovery target"
    },
    "backupRetentionDays": {
      "type": "number",
      "description": "Required backup retention window"
    },
    "complianceFramework": {
      "type": "string",
      "description": "Recovery compliance framework"
    }
  },
  "required": [
    "defaultRecoveryTarget"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get_rpo_status",
        "get_rto_status",
        "check_backup_compliance",
        "verify_failover_readiness",
        "get_recovery_metrics"
      ],
      "description": "Disaster recovery operation to perform"
    },
    "payload": {
      "type": "object",
      "description": "Action-specific recovery query data",
      "properties": {
        "recovery_target": {
          "type": "string",
          "enum": [
            "primary_database",
            "backup_location",
            "secondary_region"
          ],
          "description": "Recovery target"
        },
        "backup_type": {
          "type": "string",
          "enum": [
            "full",
            "incremental",
            "differential",
            "continuous"
          ],
          "description": "Backup type"
        },
        "test_failover": {
          "type": "boolean",
          "description": "Include test failover recommendations"
        },
        "environment": {
          "type": "string",
          "description": "Environment"
        },
        "time_range": {
          "type": "string",
          "description": "Metric time range"
        }
      }
    },
    "endpointUrl": {
      "type": "string",
      "description": "Optional request-specific endpoint override"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "description": "Invocation input sent to the external action"
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved external endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "description": "Redacted request headers"
        }
      },
      "required": [
        "input",
        "endpoint",
        "method",
        "headers"
      ]
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": [
            "object",
            "string"
          ],
          "description": "Parsed external response data"
        }
      },
      "required": [
        "status",
        "data"
      ]
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

### Education

> Category source: `services/tool-executor/src/data/skills/education/index.ts`

#### `create-lesson-plan`

**Name:** Create Lesson Plan

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string"
    },
    "level": {
      "type": "string"
    },
    "duration": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "plan": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `generate-quiz`

**Name:** Generate Quiz

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "topic": {
      "type": "string"
    },
    "questions": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "quiz": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-learning-analytics`

**Name:** Learning Analytics

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "courseId": {
      "type": "string"
    },
    "learnerId": {
      "type": "string"
    },
    "dateRange": {
      "type": "object"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "data": {
      "type": "object"
    },
    "mode": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-learning-style-analyzer`

**Name:** Learning Style Analyzer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learnerId": {
      "type": "string"
    },
    "assessmentData": {
      "type": "object"
    },
    "behavioralData": {
      "type": "object"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "learningStyle": {
      "type": "string"
    },
    "confidence": {
      "type": "number"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-adaptation-engine`

**Name:** Adaptation Engine

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learnerId": {
      "type": "string"
    },
    "contentId": {
      "type": "string"
    },
    "targetStyle": {
      "type": "string"
    },
    "difficulty": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "adaptedContent": {
      "type": "object"
    },
    "recommendations": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-performance-analyzer`

**Name:** Performance Analyzer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "assessmentId": {
      "type": "string"
    },
    "learnerId": {
      "type": "string"
    },
    "includeBreakdown": {
      "type": "boolean"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "score": {
      "type": "number"
    },
    "breakdown": {
      "type": "object"
    },
    "gaps": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-progress-tracker`

**Name:** Progress Tracker

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learnerId": {
      "type": "string"
    },
    "objectiveId": {
      "type": "string"
    },
    "status": {
      "type": "string"
    },
    "evidence": {
      "type": "object"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "progress": {
      "type": "object"
    },
    "lastUpdated": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-resource-organizer`

**Name:** Resource Organizer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resources": {
      "type": "array"
    },
    "collectionId": {
      "type": "string"
    },
    "category": {
      "type": "string"
    },
    "tags": {
      "type": "array"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "organized": {
      "type": "object"
    },
    "collectionId": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-resource-tagger`

**Name:** Resource Tagger

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resourceId": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "autoTag": {
      "type": "boolean"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "tags": {
      "type": "array"
    },
    "suggestedCategories": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-resource-analyzer`

**Name:** Resource Analyzer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resourceId": {
      "type": "string"
    },
    "standards": {
      "type": "array"
    },
    "gradeLevel": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "qualityScore": {
      "type": "number"
    },
    "alignment": {
      "type": "object"
    },
    "issues": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-content-creator`

**Name:** Content Creator

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "topic": {
      "type": "string"
    },
    "format": {
      "type": "string"
    },
    "gradeLevel": {
      "type": "string"
    },
    "length": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "content": {
      "type": "string"
    },
    "format": {
      "type": "string"
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-multimedia-integrator`

**Name:** Multimedia Integrator

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "contentId": {
      "type": "string"
    },
    "mediaAssets": {
      "type": "array"
    },
    "syncPoints": {
      "type": "array"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "integratedContent": {
      "type": "object"
    },
    "mediaTimeline": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-accessibility-checker`

**Name:** Accessibility Checker

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "contentId": {
      "type": "string"
    },
    "contentHtml": {
      "type": "string"
    },
    "standards": {
      "type": "array"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "compliant": {
      "type": "boolean"
    },
    "issues": {
      "type": "array"
    },
    "suggestions": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-motivation-analyzer`

**Name:** Motivation Analyzer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learnerId": {
      "type": "string"
    },
    "timeframe": {
      "type": "string"
    },
    "behavioralData": {
      "type": "object"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "motivationScore": {
      "type": "number"
    },
    "riskLevel": {
      "type": "string"
    },
    "factors": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-engagement-planner`

**Name:** Engagement Planner

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learnerId": {
      "type": "string"
    },
    "courseId": {
      "type": "string"
    },
    "activityType": {
      "type": "string"
    },
    "frequency": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "activityPlan": {
      "type": "object"
    },
    "schedule": {
      "type": "array"
    },
    "expectedImpact": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-activity-designer`

**Name:** Activity Designer

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "objectiveId": {
      "type": "string"
    },
    "activityType": {
      "type": "string"
    },
    "learnerCount": {
      "type": "number"
    },
    "duration": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "activityDesign": {
      "type": "object"
    },
    "materials": {
      "type": "array"
    },
    "assessmentStrategy": {
      "type": "object"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

### Event

> Category source: `services/tool-executor/src/data/skills/event/index.ts`

#### `plan-event`

**Name:** Plan Event

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventType": {
      "type": "string"
    },
    "attendees": {
      "type": "number"
    },
    "date": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "plan": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-budget-tracker`

**Name:** Budget Tracker

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "category": {
      "type": "string"
    },
    "amount": {
      "type": "number"
    },
    "expenseType": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "remaining": {
      "type": "number"
    },
    "spent": {
      "type": "number"
    },
    "forecast": {
      "type": "object"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-vendor-database`

**Name:** Vendor Database

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string"
    },
    "location": {
      "type": "string"
    },
    "budgetRange": {
      "type": "object"
    },
    "ratings": {
      "type": "object"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "vendors": {
      "type": "array"
    },
    "matches": {
      "type": "number"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-seating`

**Name:** Seating

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "attendeeCount": {
      "type": "number"
    },
    "tableSize": {
      "type": "number"
    },
    "layout": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "seatingChart": {
      "type": "object"
    },
    "tables": {
      "type": "array"
    },
    "unassigned": {
      "type": "number"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-monitor`

**Name:** Monitor

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "checkpoints": {
      "type": "array"
    },
    "liveMetrics": {
      "type": "boolean"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "liveStatus": {
      "type": "object"
    },
    "attendance": {
      "type": "number"
    },
    "alerts": {
      "type": "array"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-check-in`

**Name:** Check-In

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "attendeeId": {
      "type": "string"
    },
    "ticketCode": {
      "type": "string"
    },
    "method": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "checkedIn": {
      "type": "boolean"
    },
    "timestamp": {
      "type": "string"
    },
    "record": {
      "type": "object"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-contract`

**Name:** Contract

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "vendorId": {
      "type": "string"
    },
    "terms": {
      "type": "object"
    },
    "action": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "contractId": {
      "type": "string"
    },
    "status": {
      "type": "string"
    },
    "signedDate": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

#### `event-payment`

**Name:** Payment

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "eventId": {
      "type": "string"
    },
    "attendeeId": {
      "type": "string"
    },
    "amount": {
      "type": "number"
    },
    "paymentMethod": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "transactionId": {
      "type": "string"
    },
    "status": {
      "type": "string"
    },
    "receipt": {
      "type": "object"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/event/index.ts)

### Executive

> Category source: `services/tool-executor/src/data/skills/executive/index.ts`

#### `leadership-coaching`

**Name:** Leadership Coaching

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "area": {
      "type": "string"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "plan": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `decision-framework`

**Name:** Decision Framework

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "decision": {
      "type": "string"
    },
    "framework": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "result": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-performance-analyzer`

**Name:** Performance Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "benchmarkSet": {
      "type": "string"
    },
    "defaultPeriod": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "period": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "kpis": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "benchmark": {
      "type": "boolean"
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-calendar`

**Name:** Executive Calendar

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "google",
        "outlook",
        "calendly",
        "custom"
      ]
    },
    "defaultCalendarId": {
      "type": "string"
    },
    "timezone": {
      "type": "string"
    },
    "autoSync": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create-event",
        "update-event",
        "delete-event",
        "get-event",
        "list-events",
        "check-availability",
        "create-recurring"
      ]
    },
    "eventId": {
      "type": "string"
    },
    "eventData": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        },
        "attendees": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "location": {
          "type": "string"
        },
        "recurrence": {
          "type": "object"
        }
      }
    },
    "calendarId": {
      "type": "string"
    },
    "timeRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-email`

**Name:** Executive Email

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "sendgrid",
        "mailgun",
        "ses",
        "smtp",
        "custom"
      ]
    },
    "fromAddress": {
      "type": "string"
    },
    "fromName": {
      "type": "string"
    },
    "templates": {
      "type": "object"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "cc": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "bcc": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "subject": {
      "type": "string"
    },
    "htmlBody": {
      "type": "string"
    },
    "textBody": {
      "type": "string"
    },
    "templateId": {
      "type": "string"
    },
    "templateData": {
      "type": "object"
    },
    "scheduledAt": {
      "type": "string"
    },
    "trackingEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "to",
    "subject"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-leadership-assessment`

**Name:** Leadership Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "framework": {
      "type": "string",
      "enum": [
        "9box",
        "competency-model",
        "360-feedback",
        "custom"
      ]
    },
    "defaultAssessors": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "autoScore": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "assessmentType": {
      "type": "string"
    },
    "competencies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "period": {
      "type": "object"
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-feedback-analysis`

**Name:** Feedback Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "sentimentProvider": {
      "type": "string",
      "enum": [
        "internal",
        "openai",
        "azure",
        "custom"
      ]
    },
    "defaultDimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "includeThemes": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "feedback": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "sentiment": {
      "type": "boolean"
    },
    "themes": {
      "type": "boolean"
    }
  },
  "required": [
    "feedback"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-skill-gap`

**Name:** Skill Gap Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "taxonomy": {
      "type": "string"
    },
    "defaultRole": {
      "type": "string"
    },
    "weightByPriority": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "roleId": {
      "type": "string"
    },
    "currentSkills": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "requiredSkills": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-development-plan`

**Name:** Development Plan

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultTimeframe": {
      "type": "string"
    },
    "milestoneTemplates": {
      "type": "object"
    },
    "autoAssign": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "focusAreas": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "timeframe": {
      "type": "string"
    },
    "milestones": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-resource-recommender`

**Name:** Resource Recommender

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "catalogUrl": {
      "type": "string"
    },
    "preferredFormats": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "maxResults": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "skillGaps": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "preferredFormats": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "limit": {
      "type": "number"
    },
    "roleId": {
      "type": "string"
    }
  },
  "required": [
    "skillGaps"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-risk-assessment`

**Name:** Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "riskCategories": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "severityScale": {
      "type": "string"
    },
    "includeMitigations": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "domain": {
      "type": "string"
    },
    "riskCategories": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "timeframe": {
      "type": "string"
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-scenario-modeler`

**Name:** Scenario Modeler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "solver": {
      "type": "string",
      "enum": [
        "linear-programming",
        "monte-carlo",
        "heuristic",
        "custom"
      ]
    },
    "defaultHorizon": {
      "type": "string"
    },
    "maxScenarios": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "scenarioId": {
      "type": "string"
    },
    "variables": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "assumptions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "outcomes": {
      "type": "object"
    }
  },
  "required": [
    "scenarioId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-feedback-collector`

**Name:** Feedback Collector

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "surveyProvider": {
      "type": "string",
      "enum": [
        "forms",
        "survey-monkey",
        "typeform",
        "custom"
      ]
    },
    "defaultTemplate": {
      "type": "string"
    },
    "anonymous": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "recipientId": {
      "type": "string"
    },
    "subject": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "surveyTemplate": {
      "type": "string"
    },
    "dueDate": {
      "type": "string"
    },
    "reminders": {
      "type": "number"
    }
  },
  "required": [
    "recipientId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-improvement-plan`

**Name:** Improvement Plan

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "priorityMethod": {
      "type": "string",
      "enum": [
        "moq",
        "rice",
        "weighted",
        "manual"
      ]
    },
    "defaultOwnerRole": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "focusArea": {
      "type": "string"
    },
    "actions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "timeline": {
      "type": "object"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-communication-analyzer`

**Name:** Communication Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "analysisProvider": {
      "type": "string",
      "enum": [
        "internal",
        "openai",
        "azure",
        "custom"
      ]
    },
    "defaultLanguage": {
      "type": "string"
    },
    "includeSentiment": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "communicationId": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "meeting",
        "presentation",
        "chat",
        "call"
      ]
    },
    "context": {
      "type": "string"
    },
    "sentiment": {
      "type": "boolean"
    }
  },
  "required": [
    "text"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-eq-assessment`

**Name:** Emotional Intelligence Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "eqModel": {
      "type": "string",
      "enum": [
        "goleman",
        "trait-eq",
        "mixed-model",
        "custom"
      ]
    },
    "defaultAssessors": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "autoScore": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "assessorId": {
      "type": "string"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "responses": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-communication-coach`

**Name:** Communication Coach

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "coachPersona": {
      "type": "string",
      "enum": [
        "direct",
        "diplomatic",
        "analytical",
        "supportive",
        "custom"
      ]
    },
    "defaultLength": {
      "type": "string",
      "enum": [
        "brief",
        "detailed",
        "comprehensive"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "skillArea": {
      "type": "string",
      "enum": [
        "tone",
        "clarity",
        "persuasion",
        "listening",
        "presence",
        "difficult-conversations"
      ]
    },
    "message": {
      "type": "string"
    },
    "feedback": {
      "type": "string"
    },
    "length": {
      "type": "string",
      "enum": [
        "brief",
        "detailed",
        "comprehensive"
      ]
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-career-planner`

**Name:** Career Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultTimeframe": {
      "type": "string"
    },
    "interestWeight": {
      "type": "number"
    },
    "marketDataProvider": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "targetRole": {
      "type": "string"
    },
    "timeframe": {
      "type": "string"
    },
    "interests": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "constraints": {
      "type": "object"
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-presence-analyzer`

**Name:** Presence Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "analysisProvider": {
      "type": "string",
      "enum": [
        "internal",
        "openai",
        "azure",
        "custom"
      ]
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string"
    },
    "transcript": {
      "type": "string"
    },
    "videoUrl": {
      "type": "string"
    },
    "context": {
      "type": "string"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "sessionId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-career-roadmap`

**Name:** Career Roadmap

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultTimeframe": {
      "type": "string"
    },
    "milestoneTemplates": {
      "type": "object"
    },
    "trackProgress": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveId": {
      "type": "string"
    },
    "targetRole": {
      "type": "string"
    },
    "milestones": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "timeline": {
      "type": "object"
    }
  },
  "required": [
    "executiveId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the external action succeeded"
    },
    "mode": {
      "type": "string",
      "description": "Execution mode: dry-run, live, or error"
    },
    "system": {
      "type": "string",
      "description": "External system name"
    },
    "action": {
      "type": "string",
      "description": "External action name"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Execution error message, when present"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

### Finance

> Category source: `services/tool-executor/src/data/skills/finance/index.ts`

#### `financial-model`

**Name:** Financial Model

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "revenue": {
      "type": "number"
    },
    "costs": {
      "type": "number"
    },
    "periods": {
      "type": "number"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "model": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `analyze-investment`

**Name:** Analyze Investment

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "asset": {
      "type": "string"
    },
    "amount": {
      "type": "number"
    },
    "horizon": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "analysis": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-financial-analysis`

**Name:** Financial Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultPeriod": {
      "type": "string"
    },
    "includeProjections": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "companyId": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "period": {
      "type": "string"
    },
    "includeProjections": {
      "type": "boolean"
    }
  },
  "required": [
    "companyId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-reporting`

**Name:** Financial Reporting

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "templates": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultFormat": {
      "type": "string",
      "enum": [
        "pdf",
        "xlsx",
        "json"
      ]
    },
    "includeCharts": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "reportType": {
      "type": "string",
      "enum": [
        "income",
        "balance",
        "cashflow",
        "custom"
      ]
    },
    "entityId": {
      "type": "string"
    },
    "period": {
      "type": "string"
    },
    "format": {
      "type": "string",
      "enum": [
        "pdf",
        "xlsx",
        "json"
      ]
    },
    "includeCharts": {
      "type": "boolean"
    }
  },
  "required": [
    "reportType",
    "entityId",
    "period"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-financial-data`

**Name:** Financial Data

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "providers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultRange": {
      "type": "string"
    },
    "cacheTtlSeconds": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dataType": {
      "type": "string",
      "enum": [
        "price",
        "volume",
        "fundamentals",
        "news"
      ]
    },
    "range": {
      "type": "string"
    },
    "interval": {
      "type": "string"
    }
  },
  "required": [
    "symbols",
    "dataType"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-financial-risk-assessment`

**Name:** Financial Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "methods": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultConfidenceLevel": {
      "type": "number"
    },
    "defaultHoldingPeriod": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "portfolioId": {
      "type": "string"
    },
    "riskModels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "confidenceLevel": {
      "type": "number"
    },
    "holdingPeriod": {
      "type": "number"
    }
  },
  "required": [
    "portfolioId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-budget-tracker`

**Name:** Budget Tracker

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultCurrency": {
      "type": "string"
    },
    "varianceThreshold": {
      "type": "number"
    },
    "alertOnVariance": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "budgetId": {
      "type": "string"
    },
    "actuals": {
      "type": "object"
    },
    "period": {
      "type": "string"
    },
    "categories": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "budgetId",
    "actuals",
    "period"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-data-cleaning`

**Name:** Financial Data Cleaning

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "defaultRules": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "outputFormat": {
      "type": "string",
      "enum": [
        "csv",
        "json",
        "parquet"
      ]
    },
    "validateSchema": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "datasetId": {
      "type": "string"
    },
    "rules": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "outputFormat": {
      "type": "string",
      "enum": [
        "csv",
        "json",
        "parquet"
      ]
    }
  },
  "required": [
    "datasetId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-regulatory`

**Name:** Regulatory Compliance

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "jurisdictions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "regulations": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultPeriod": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entityId": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "regulations": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "period": {
      "type": "string"
    }
  },
  "required": [
    "entityId",
    "jurisdiction"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `finance-document-management`

**Name:** Financial Document Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "storageProvider": {
      "type": "string"
    },
    "defaultTags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "maxFileSizeMB": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "upload",
        "search",
        "tag",
        "archive"
      ]
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "metadata": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

### Healthcare

> Category source: `services/tool-executor/src/data/skills/healthcare/index.ts`

#### `symptom-checker`

**Name:** Symptom Checker

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "symptoms": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "duration": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "check": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-medical-record`

**Name:** Healthcare Medical Record

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "EHR system base URL"
    },
    "token": {
      "type": "string",
      "description": "EHR system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "epic",
        "cerner",
        "allscripts",
        "athenahealth",
        "custom"
      ]
    },
    "defaultFacility": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "search",
        "list",
        "archive"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "recordType": {
      "type": "string",
      "enum": [
        "encounter",
        "diagnosis",
        "medication",
        "allergy",
        "immunization",
        "procedure",
        "vital",
        "lab",
        "imaging",
        "note"
      ]
    },
    "data": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "limit": {
      "type": "number"
    },
    "offset": {
      "type": "number"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-patient-communication`

**Name:** Healthcare Patient Communication

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Communication system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Communication system API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "twilio",
        "sendgrid",
        "mailgun",
        "patient-portal",
        "custom"
      ]
    },
    "defaultChannel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice",
        "fax"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "send",
        "schedule",
        "template",
        "history",
        "preferences",
        "opt-out"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice",
        "fax"
      ]
    },
    "templateId": {
      "type": "string"
    },
    "subject": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "variables": {
      "type": "object"
    },
    "scheduledAt": {
      "type": "string"
    },
    "priority": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ]
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-care-plan`

**Name:** Healthcare Care Plan

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Care plan system base URL"
    },
    "token": {
      "type": "string",
      "description": "Care plan system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "epic",
        "cerner",
        "allscripts",
        "custom"
      ]
    },
    "defaultTeam": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "list",
        "assign",
        "review",
        "close"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "planId": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "interventions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "teamMembers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "draft",
        "active",
        "on-hold",
        "completed",
        "cancelled"
      ]
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-appointment-scheduler`

**Name:** Healthcare Appointment Scheduler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Scheduling system base URL"
    },
    "token": {
      "type": "string",
      "description": "Scheduling system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "epic",
        "cerner",
        "athenahealth",
        "nextgen",
        "custom"
      ]
    },
    "defaultTimezone": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "schedule",
        "reschedule",
        "cancel",
        "search",
        "availability",
        "waitlist",
        "confirm"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "providerId": {
      "type": "string"
    },
    "facilityId": {
      "type": "string"
    },
    "appointmentType": {
      "type": "string"
    },
    "startTime": {
      "type": "string"
    },
    "endTime": {
      "type": "string"
    },
    "timezone": {
      "type": "string"
    },
    "reason": {
      "type": "string"
    },
    "notes": {
      "type": "string"
    },
    "recurrence": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-schedule-optimizer`

**Name:** Healthcare Schedule Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Schedule optimizer base URL"
    },
    "token": {
      "type": "string",
      "description": "Schedule optimizer bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "qgenda",
        "amion",
        "lightning-bolt",
        "custom"
      ]
    },
    "optimizationMode": {
      "type": "string",
      "enum": [
        "utilization",
        "continuity",
        "access",
        "balanced"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "optimize",
        "analyze",
        "simulate",
        "rebalance",
        "predict",
        "report"
      ]
    },
    "providerIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "facilityIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "constraints": {
      "type": "object"
    },
    "objectives": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "scenarioId": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-record-tagging`

**Name:** Healthcare Record Tagging

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Tagging system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Tagging system API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "3m",
        "optum",
        "nthrive",
        "custom"
      ]
    },
    "codingSystem": {
      "type": "string",
      "enum": [
        "ICD-10",
        "CPT",
        "HCPCS",
        "SNOMED",
        "LOINC",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "tag",
        "untag",
        "search",
        "suggest",
        "validate",
        "bulk-tag",
        "audit"
      ]
    },
    "recordIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "tagType": {
      "type": "string",
      "enum": [
        "diagnosis",
        "procedure",
        "medication",
        "social",
        "quality",
        "research",
        "custom"
      ]
    },
    "codingSystem": {
      "type": "string"
    },
    "filters": {
      "type": "object"
    },
    "confidence": {
      "type": "number"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-record-search`

**Name:** Healthcare Record Search

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Search system base URL"
    },
    "token": {
      "type": "string",
      "description": "Search system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "elasticsearch",
        "solr",
        "opensearch",
        "custom"
      ]
    },
    "indexPrefix": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "search",
        "aggregate",
        "facet",
        "export",
        "saved-search",
        "alert"
      ]
    },
    "query": {
      "type": "string"
    },
    "filters": {
      "type": "object"
    },
    "patientIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "recordTypes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "sortBy": {
      "type": "string"
    },
    "sortOrder": {
      "type": "string",
      "enum": [
        "asc",
        "desc"
      ]
    },
    "page": {
      "type": "number"
    },
    "pageSize": {
      "type": "number"
    },
    "includePHI": {
      "type": "boolean"
    },
    "savedSearchId": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-resource-coordinator`

**Name:** Healthcare Resource Coordinator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Resource management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Resource management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "teletracking",
        "central-logic",
        "awarepoint",
        "custom"
      ]
    },
    "defaultFacility": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "object",
      "properties": {
        "type": "string",
        "enum": [
          "allocate",
          "release",
          "transfer",
          "status",
          "forecast",
          "request",
          "approve"
        ]
      }
    },
    "resourceType": {
      "type": "string",
      "enum": [
        "bed",
        "equipment",
        "room",
        "staff",
        "device",
        "supply"
      ]
    },
    "resourceId": {
      "type": "string"
    },
    "facilityId": {
      "type": "string"
    },
    "patientId": {
      "type": "string"
    },
    "quantity": {
      "type": "number"
    },
    "startTime": {
      "type": "string"
    },
    "endTime": {
      "type": "string"
    },
    "priority": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ]
    },
    "attributes": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation",
    "resourceType"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-resource-matcher`

**Name:** Healthcare Resource Matcher

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Resource matching system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Resource matching API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "referral-md",
        "kyruus",
        "doctor-com",
        "custom"
      ]
    },
    "matchingAlgorithm": {
      "type": "string",
      "enum": [
        "clinical-fit",
        "access",
        "cost",
        "hybrid"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "match",
        "rank",
        "filter",
        "refer",
        "network",
        "capacity"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "clinicalNeeds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "insurance": {
      "type": "object"
    },
    "preferences": {
      "type": "object"
    },
    "location": {
      "type": "object"
    },
    "specialty": {
      "type": "string"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ]
    },
    "maxResults": {
      "type": "number"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-communication-scheduler`

**Name:** Healthcare Communication Scheduler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Communication scheduler base URL"
    },
    "token": {
      "type": "string",
      "description": "Communication scheduler bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "patient-io",
        "wellpepper",
        "custom"
      ]
    },
    "defaultTimezone": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "cancel",
        "list",
        "pause",
        "resume",
        "history"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "scheduleId": {
      "type": "string"
    },
    "templateId": {
      "type": "string"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice"
      ]
    },
    "frequency": {
      "type": "string",
      "enum": [
        "once",
        "daily",
        "weekly",
        "monthly",
        "custom"
      ]
    },
    "schedule": {
      "type": "object"
    },
    "conditions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-medical-risk-assessment`

**Name:** Healthcare Medical Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Risk assessment system base URL"
    },
    "token": {
      "type": "string",
      "description": "Risk assessment bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "epic",
        "cerner",
        "optum",
        "change-healthcare",
        "custom"
      ]
    },
    "modelVersion": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "assess",
        "stratify",
        "predict",
        "cohort",
        "model",
        "explain"
      ]
    },
    "patientId": {
      "type": "string"
    },
    "patientIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "riskModels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "includeFactors": {
      "type": "boolean"
    },
    "timeHorizon": {
      "type": "string",
      "enum": [
        "30-day",
        "90-day",
        "1-year",
        "5-year"
      ]
    },
    "cohortFilters": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-analytics`

**Name:** Healthcare Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Analytics platform base URL"
    },
    "token": {
      "type": "string",
      "description": "Analytics platform bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "tableau",
        "powerbi",
        "looker",
        "custom"
      ]
    },
    "warehouse": {
      "type": "string",
      "enum": [
        "snowflake",
        "bigquery",
        "redshift",
        "databricks",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "dashboard",
        "report",
        "kpi",
        "trend",
        "cohort",
        "export",
        "schedule"
      ]
    },
    "reportType": {
      "type": "string",
      "enum": [
        "clinical",
        "operational",
        "financial",
        "quality",
        "population",
        "regulatory"
      ]
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "filters": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "granularity": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month",
        "quarter",
        "year"
      ]
    },
    "format": {
      "type": "string",
      "enum": [
        "json",
        "csv",
        "pdf",
        "excel"
      ]
    },
    "scheduleId": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

### Hotel Ops

> Category source: `services/tool-executor/src/data/skills/hotel/index.ts`

#### `manage-reservation`

**Name:** Manage Reservation

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "cancel"
      ]
    },
    "guestName": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "roomType": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "reservation": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-room-assignment`

**Name:** Hotel Room Assignment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultRoomType": {
      "type": "string"
    },
    "assignmentStrategy": {
      "type": "string",
      "enum": [
        "auto",
        "manual",
        "optimized"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultRoomType"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "roomType": {
      "type": "string"
    },
    "floor": {
      "type": "number"
    },
    "view": {
      "type": "string"
    },
    "bedType": {
      "type": "string"
    },
    "priority": {
      "type": "string",
      "enum": [
        "standard",
        "high",
        "vip"
      ]
    }
  },
  "required": [
    "operation",
    "roomType"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-guest-profile`

**Name:** Hotel Guest Profile

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultLoyaltyTier": {
      "type": "string"
    },
    "profileMergeEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "search",
        "list",
        "merge"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "firstName": {
      "type": "string"
    },
    "lastName": {
      "type": "string"
    },
    "email": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "loyaltyTier": {
      "type": "string",
      "enum": [
        "none",
        "silver",
        "gold",
        "platinum"
      ]
    },
    "preferences": {
      "type": "object"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-billing`

**Name:** Hotel Billing

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultCurrency": {
      "type": "string"
    },
    "taxRate": {
      "type": "number"
    },
    "paymentGateway": {
      "type": "string",
      "enum": [
        "stripe",
        "adyen",
        "braintree",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultCurrency"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "invoice",
        "payment",
        "folio",
        "adjustment",
        "refund",
        "dispute"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "amount": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    },
    "paymentMethod": {
      "type": "string",
      "enum": [
        "cash",
        "credit_card",
        "debit_card",
        "mobile_wallet",
        "bank_transfer",
        "account_charge"
      ]
    },
    "lineItems": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "taxRate": {
      "type": "number"
    },
    "dueDate": {
      "type": "string"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-revenue`

**Name:** Hotel Revenue

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultCurrency": {
      "type": "string"
    },
    "fiscalYearStart": {
      "type": "string"
    },
    "reportingTimezone": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "report",
        "forecast",
        "rate-plan",
        "analysis",
        "export"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "reportType": {
      "type": "string",
      "enum": [
        "daily",
        "weekly",
        "monthly",
        "ytd",
        "forecast"
      ]
    },
    "rateType": {
      "type": "string",
      "enum": [
        "rack",
        "corporate",
        "group",
        "promotional",
        "dynamic"
      ]
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-housekeeping-scheduler`

**Name:** Hotel Housekeeping Scheduler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultShiftStart": {
      "type": "string"
    },
    "roomsPerStaff": {
      "type": "number"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultShiftStart"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "schedule",
        "assign",
        "update",
        "list",
        "check-status",
        "priority"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "roomIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "staffIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "priority": {
      "type": "string",
      "enum": [
        "standard",
        "express",
        "deep-clean",
        "inspection"
      ]
    },
    "estimatedMinutes": {
      "type": "number"
    },
    "notes": {
      "type": "string"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-maintenance`

**Name:** Hotel Maintenance

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultPriority": {
      "type": "string"
    },
    "vendorManagementEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "request",
        "work-order",
        "schedule",
        "complete",
        "cancel",
        "vendor"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "category": {
      "type": "string",
      "enum": [
        "electrical",
        "plumbing",
        "hvac",
        "structural",
        "cosmetic",
        "it",
        "safety"
      ]
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "emergency"
      ]
    },
    "location": {
      "type": "string"
    },
    "vendorId": {
      "type": "string"
    },
    "estimatedCost": {
      "type": "number"
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-room-status`

**Name:** Hotel Room Status

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultRoomStatus": {
      "type": "string"
    },
    "autoTransitionEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "update",
        "bulk-update",
        "search",
        "history",
        "report"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "enum": [
        "available",
        "occupied",
        "out-of-order",
        "cleaning",
        "inspected",
        "reserved",
        "maintenance"
      ]
    },
    "housekeepingStatus": {
      "type": "string",
      "enum": [
        "dirty",
        "clean",
        "inspected",
        "out-of-service"
      ]
    },
    "outOfOrderReason": {
      "type": "string"
    },
    "expectedAvailability": {
      "type": "string"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-concierge-knowledge`

**Name:** Hotel Concierge Knowledge

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultRadiusKm": {
      "type": "number"
    },
    "minRating": {
      "type": "number"
    },
    "knowledgeBaseUrl": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "query",
        "recommend",
        "category",
        "add",
        "update",
        "remove"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "category": {
      "type": "string",
      "enum": [
        "dining",
        "transport",
        "attractions",
        "entertainment",
        "wellness",
        "shopping",
        "business"
      ]
    },
    "query": {
      "type": "string"
    },
    "location": {
      "type": "object"
    },
    "radiusKm": {
      "type": "number"
    },
    "rating": {
      "type": "number"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-external-booking`

**Name:** Hotel External Booking

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "channelManagerUrl": {
      "type": "string"
    },
    "syncIntervalMinutes": {
      "type": "number"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "channels"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "sync",
        "import",
        "export",
        "inventory-update",
        "rate-sync",
        "cancel"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "channel": {
      "type": "string",
      "enum": [
        "booking.com",
        "expedia",
        "airbnb",
        "agoda",
        "gds",
        "direct",
        "custom"
      ]
    },
    "ratePlanId": {
      "type": "string"
    },
    "inventoryCount": {
      "type": "number"
    },
    "stopSell": {
      "type": "boolean"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-local-information`

**Name:** Hotel Local Information

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultLocation": {
      "type": "object"
    },
    "weatherProvider": {
      "type": "string",
      "enum": [
        "openweathermap",
        "accuweather",
        "custom"
      ]
    },
    "transitProvider": {
      "type": "string",
      "enum": [
        "google",
        "citymapper",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "weather",
        "transit",
        "attractions",
        "events",
        "emergency",
        "guide"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "location": {
      "type": "object"
    },
    "date": {
      "type": "string"
    },
    "language": {
      "type": "string"
    },
    "category": {
      "type": "string"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-guest-service`

**Name:** Hotel Guest Service

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultUrgency": {
      "type": "string"
    },
    "serviceTicketPrefix": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "request",
        "ticket",
        "amenity",
        "preference",
        "compliment",
        "follow-up"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "requestType": {
      "type": "string",
      "enum": [
        "room_service",
        "housekeeping",
        "maintenance",
        "concierge",
        "transport",
        "special_occasion",
        "other"
      ]
    },
    "urgency": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent"
      ]
    },
    "details": {
      "type": "object"
    },
    "scheduledTime": {
      "type": "string"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-task-dispatch`

**Name:** Hotel Task Dispatch

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultRoutingStrategy": {
      "type": "string"
    },
    "maxTasksPerStaff": {
      "type": "number"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultRoutingStrategy"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "assign",
        "update",
        "complete",
        "cancel",
        "list",
        "route"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "taskType": {
      "type": "string",
      "enum": [
        "cleaning",
        "maintenance",
        "inspection",
        "delivery",
        "setup",
        "turnover"
      ]
    },
    "assigneeIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "location": {
      "type": "object"
    },
    "dueTime": {
      "type": "string"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent"
      ]
    },
    "routingStrategy": {
      "type": "string",
      "enum": [
        "nearest",
        "least-busy",
        "specialized",
        "round-robin"
      ]
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-issue-tracker`

**Name:** Hotel Issue Tracker

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "autoEscalationEnabled": {
      "type": "boolean"
    },
    "escalationMinutes": {
      "type": "number"
    },
    "compensationPolicies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "assign",
        "resolve",
        "escalate",
        "list",
        "trends"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "category": {
      "type": "string",
      "enum": [
        "service",
        "cleanliness",
        "maintenance",
        "noise",
        "safety",
        "billing",
        "amenities"
      ]
    },
    "severity": {
      "type": "string",
      "enum": [
        "minor",
        "moderate",
        "major",
        "critical"
      ]
    },
    "assigneeId": {
      "type": "string"
    },
    "resolution": {
      "type": "string"
    },
    "compensation": {
      "type": "object"
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-guest-communication`

**Name:** Hotel Guest Communication

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultChannel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "phone"
      ]
    },
    "communicationProvider": {
      "type": "string",
      "enum": [
        "twilio",
        "sendgrid",
        "aws-ses",
        "custom"
      ]
    },
    "optOutPolicy": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultChannel"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "send",
        "template",
        "schedule",
        "history",
        "preferences",
        "feedback-request"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "push",
        "portal",
        "phone",
        "whatsapp"
      ]
    },
    "templateId": {
      "type": "string"
    },
    "subject": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "variables": {
      "type": "object"
    },
    "scheduledAt": {
      "type": "string"
    },
    "priority": {
      "type": "string",
      "enum": [
        "routine",
        "important",
        "urgent"
      ]
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-operational-analytics`

**Name:** Hotel Operational Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultGranularity": {
      "type": "string"
    },
    "benchmarkDataSource": {
      "type": "string",
      "enum": [
        "internal",
        "str",
        "smith-travel",
        "custom"
      ]
    },
    "dashboardUrl": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "dashboard",
        "report",
        "kpi",
        "trend",
        "benchmark",
        "export"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "metric": {
      "type": "string",
      "enum": [
        "occupancy",
        "adr",
        "revpar",
        "guest-satisfaction",
        "housekeeping-efficiency",
        "revenue",
        "cost"
      ]
    },
    "granularity": {
      "type": "string",
      "enum": [
        "hourly",
        "daily",
        "weekly",
        "monthly"
      ]
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "format": {
      "type": "string",
      "enum": [
        "json",
        "csv",
        "pdf",
        "excel"
      ]
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-staff-performance`

**Name:** Hotel Staff Performance

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultReviewPeriod": {
      "type": "string"
    },
    "kpiTargets": {
      "type": "object"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "review",
        "kpi",
        "schedule",
        "attendance",
        "feedback",
        "report"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "department": {
      "type": "string",
      "enum": [
        "front-desk",
        "housekeeping",
        "food-beverage",
        "maintenance",
        "management",
        "security"
      ]
    },
    "reviewPeriod": {
      "type": "string",
      "enum": [
        "weekly",
        "monthly",
        "quarterly",
        "annual"
      ]
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-inventory-management`

**Name:** Hotel Inventory Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Hotel PMS base URL"
    },
    "token": {
      "type": "string",
      "description": "Hotel PMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opera",
        "fidelio",
        "protel",
        "cloudbeds",
        "mews",
        "custom"
      ]
    },
    "defaultReorderThreshold": {
      "type": "number"
    },
    "supplierIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "autoReorderEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "defaultReorderThreshold"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "stock",
        "order",
        "transfer",
        "adjust",
        "audit",
        "reorder-list"
      ]
    },
    "propertyId": {
      "type": "string"
    },
    "roomId": {
      "type": "string"
    },
    "guestId": {
      "type": "string"
    },
    "reservationId": {
      "type": "string"
    },
    "staffId": {
      "type": "string"
    },
    "taskId": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "checkIn": {
      "type": "string"
    },
    "checkOut": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "data": {
      "type": "object"
    },
    "dryRun": {
      "type": "boolean"
    },
    "category": {
      "type": "string",
      "enum": [
        "linens",
        "amenities",
        "cleaning",
        "food-beverage",
        "maintenance",
        "office"
      ]
    },
    "itemId": {
      "type": "string"
    },
    "quantity": {
      "type": "number"
    },
    "unit": {
      "type": "string"
    },
    "minStockLevel": {
      "type": "number"
    },
    "location": {
      "type": "string",
      "enum": [
        "housekeeping-closet",
        "storage",
        "fbm-kitchen",
        "laundry",
        "front-desk"
      ]
    }
  },
  "required": [
    "operation",
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

### HR

> Category source: `services/tool-executor/src/data/skills/hr/index.ts`

#### `screen-resume`

**Name:** Screen Resume

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string"
    },
    "jobRequirements": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "screening": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `schedule-interview`

**Name:** Schedule Interview

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "candidateName": {
      "type": "string"
    },
    "panel": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "scheduledAt": {
      "type": "string"
    },
    "interviewType": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "interview": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-ats`

**Name:** ATS Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string"
    },
    "apiVersion": {
      "type": "string"
    },
    "defaultSource": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create-candidate",
        "update-candidate",
        "get-candidate",
        "search-candidates",
        "create-job",
        "update-job",
        "get-job",
        "list-jobs"
      ]
    },
    "candidateId": {
      "type": "string"
    },
    "candidateData": {
      "type": "object"
    },
    "jobId": {
      "type": "string"
    },
    "jobData": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    },
    "pagination": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-email`

**Name:** HR Email System

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "sendgrid",
        "mailgun",
        "ses",
        "smtp",
        "custom"
      ]
    },
    "fromAddress": {
      "type": "string"
    },
    "fromName": {
      "type": "string"
    },
    "templates": {
      "type": "object"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "cc": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "bcc": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "subject": {
      "type": "string"
    },
    "htmlBody": {
      "type": "string"
    },
    "textBody": {
      "type": "string"
    },
    "templateId": {
      "type": "string"
    },
    "templateData": {
      "type": "object"
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "trackingEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "to",
    "subject"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-job-board`

**Name:** Job Board Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "boards": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultBoard": {
      "type": "string"
    },
    "autoExpireDays": {
      "type": "number"
    },
    "featuredPosting": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "post-job",
        "update-job",
        "remove-job",
        "get-job",
        "list-jobs",
        "get-applications"
      ]
    },
    "jobId": {
      "type": "string"
    },
    "jobData": {
      "type": "object"
    },
    "boardId": {
      "type": "string"
    },
    "filters": {
      "type": "object"
    },
    "pagination": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-linkedin`

**Name:** LinkedIn Recruiter Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "apiVersion": {
      "type": "string"
    },
    "rateLimitPerMinute": {
      "type": "number"
    },
    "defaultSearchFilters": {
      "type": "object"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "search-candidates",
        "get-profile",
        "send-inmail",
        "get-inmail-status",
        "post-job",
        "get-job-applications"
      ]
    },
    "searchCriteria": {
      "type": "object"
    },
    "profileId": {
      "type": "string"
    },
    "inmailData": {
      "type": "object"
    },
    "jobId": {
      "type": "string"
    },
    "jobData": {
      "type": "object"
    },
    "pagination": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-hiring-analytics`

**Name:** Hiring Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dataSource": {
      "type": "string"
    },
    "defaultDateRange": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "pipeline-report",
        "time-to-fill",
        "source-effectiveness",
        "diversity-report",
        "offer-acceptance-rate",
        "custom-query"
      ]
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    },
    "groupBy": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-assessment`

**Name:** Candidate Assessment Platform

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "codility",
        "hackerrank",
        "criteria",
        "shl",
        "custom"
      ]
    },
    "defaultTestLibrary": {
      "type": "string"
    },
    "autoScoring": {
      "type": "boolean"
    },
    "proctoringEnabled": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create-invitation",
        "get-results",
        "list-assessments",
        "create-test",
        "get-test",
        "cancel-invitation"
      ]
    },
    "candidateId": {
      "type": "string"
    },
    "candidateEmail": {
      "type": "string"
    },
    "assessmentId": {
      "type": "string"
    },
    "testId": {
      "type": "string"
    },
    "testData": {
      "type": "object"
    },
    "invitationData": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-compliance`

**Name:** HR Compliance Checker

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "regulations": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "EEOC",
          "GDPR",
          "OFCCP",
          "ADA",
          "FCRA",
          "state-specific"
        ]
      }
    },
    "autoFlag": {
      "type": "boolean"
    },
    "severityThreshold": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "check-job-posting",
        "check-candidate-data",
        "check-hiring-decision",
        "generate-report",
        "get-audit-trail"
      ]
    },
    "jobPostingId": {
      "type": "string"
    },
    "jobPostingContent": {
      "type": "string"
    },
    "candidateId": {
      "type": "string"
    },
    "candidateData": {
      "type": "object"
    },
    "decisionData": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-calendar`

**Name:** Calendar Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "google",
        "outlook",
        "calendly",
        "custom"
      ]
    },
    "defaultCalendarId": {
      "type": "string"
    },
    "timezone": {
      "type": "string"
    },
    "reminders": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "autoSync": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create-event",
        "update-event",
        "delete-event",
        "get-event",
        "list-events",
        "check-availability",
        "create-recurring"
      ]
    },
    "eventId": {
      "type": "string"
    },
    "eventData": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        },
        "attendees": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "location": {
          "type": "string"
        },
        "recurrence": {
          "type": "object"
        },
        "reminders": {
          "type": "array",
          "items": {
            "type": "object"
          }
        }
      }
    },
    "calendarId": {
      "type": "string"
    },
    "timeRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "filters": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

### Investment Advisor

> Category source: `services/tool-executor/src/data/skills/investment/index.ts`

#### `portfolio-analysis`

**Name:** Portfolio Analysis

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "holdings": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "riskTolerance": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "analysis": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-market-data`

**Name:** Market Data Provider

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "bloomberg",
        "refinitiv",
        "alphavantage",
        "polygon",
        "iex",
        "twelvedata",
        "custom"
      ]
    },
    "defaultExchange": {
      "type": "string"
    },
    "dataTypes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "cacheTtlSeconds": {
      "type": "number"
    },
    "rateLimitPerSecond": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "quote",
        "historical",
        "fundamentals",
        "options-chain",
        "news",
        "economic-calendar",
        "search-symbols"
      ]
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "symbol": {
      "type": "string"
    },
    "interval": {
      "type": "string",
      "enum": [
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
        "1d",
        "1w",
        "1M"
      ]
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "fields": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "adjustments": {
      "type": "string",
      "enum": [
        "none",
        "split",
        "dividend",
        "all"
      ]
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-analysis`

**Name:** Investment Analysis Engine

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "models": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "dcf",
          "comps",
          "precedent",
          "factor",
          "risk-parity",
          "black-litterman",
          "monte-carlo"
        ]
      }
    },
    "defaultHorizon": {
      "type": "string"
    },
    "benchmark": {
      "type": "string"
    },
    "riskFreeRate": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "valuation",
        "factor-exposure",
        "scenario-analysis",
        "stress-test",
        "correlation",
        "attribution",
        "custom-model"
      ]
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "portfolio": {
      "type": "object"
    },
    "modelParams": {
      "type": "object"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-financial-risk-assessment`

**Name:** Financial Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "methods": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "var-parametric",
          "var-historical",
          "var-monte-carlo",
          "expected-shortfall",
          "stress-test",
          "factor-risk",
          "liquidity-risk",
          "credit-risk"
        ]
      }
    },
    "confidenceLevels": {
      "type": "array",
      "items": {
        "type": "number"
      }
    },
    "holdingPeriodDays": {
      "type": "number"
    },
    "lookbackDays": {
      "type": "number"
    },
    "regulatoryFramework": {
      "type": "string",
      "enum": [
        "basel-iii",
        "solvency-ii",
        "ccar",
        "custom"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "portfolio-var",
        "instrument-var",
        "stress-test",
        "factor-decomposition",
        "liquidity-profile",
        "credit-exposure",
        "concentration",
        "regulatory-capital"
      ]
    },
    "portfolio": {
      "type": "object"
    },
    "instrument": {
      "type": "object"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "confidenceLevel": {
      "type": "number"
    },
    "holdingPeriod": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-market-research`

**Name:** Market Research Platform

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "providers": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "factset",
          "capital-iq",
          "refinitiv",
          "morningstar",
          "zacks",
          "seeking-alpha",
          "custom"
        ]
      }
    },
    "documentTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "equity-research",
          "earnings-transcript",
          "sec-filing",
          "press-release",
          "esg-report",
          "industry-report"
        ]
      }
    },
    "coverage": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "languages": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "search",
        "get-document",
        "get-analyst-estimates",
        "get-earnings-calendar",
        "get-esg-scores",
        "monitor-alerts"
      ]
    },
    "query": {
      "type": "string"
    },
    "symbol": {
      "type": "string"
    },
    "documentId": {
      "type": "string"
    },
    "filters": {
      "type": "object",
      "properties": {
        "dateRange": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string"
            },
            "end": {
              "type": "string"
            }
          }
        },
        "provider": {
          "type": "string"
        },
        "documentType": {
          "type": "string"
        },
        "sector": {
          "type": "string"
        },
        "rating": {
          "type": "string"
        }
      }
    },
    "pagination": {
      "type": "object"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-portfolio-optimizer`

**Name:** Portfolio Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "methods": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "mean-variance",
          "risk-parity",
          "black-litterman",
          "hierarchical-risk-parity",
          "cvxopt",
          "custom"
        ]
      }
    },
    "defaultObjective": {
      "type": "string",
      "enum": [
        "max-sharpe",
        "min-variance",
        "max-return",
        "risk-budget",
        "custom"
      ]
    },
    "constraints": {
      "type": "object",
      "properties": {
        "longOnly": {
          "type": "boolean"
        },
        "maxWeight": {
          "type": "number"
        },
        "minWeight": {
          "type": "number"
        },
        "sectorCaps": {
          "type": "object"
        },
        "factorExposure": {
          "type": "object"
        },
        "turnover": {
          "type": "number"
        }
      }
    },
    "solver": {
      "type": "string",
      "enum": [
        "cvxpy",
        "scipy",
        "mosek",
        "gurobi",
        "custom"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "optimize",
        "rebalance",
        "efficient-frontier",
        "risk-budgeting",
        "factor-tilt",
        "custom-optimization"
      ]
    },
    "currentPortfolio": {
      "type": "object"
    },
    "expectedReturns": {
      "type": "object"
    },
    "covarianceMatrix": {
      "type": "object"
    },
    "objective": {
      "type": "string"
    },
    "constraints": {
      "type": "object"
    },
    "views": {
      "type": "object"
    },
    "confidence": {
      "type": "object"
    },
    "benchmark": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-evaluator`

**Name:** Investment Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "scoringModels": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "fundamental",
          "technical",
          "quantitative",
          "esg",
          "quality",
          "value",
          "growth",
          "composite"
        ]
      }
    },
    "weights": {
      "type": "object"
    },
    "peerGroups": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "benchmarkIndices": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "rebalanceFrequency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "score",
        "rank",
        "compare",
        "screen",
        "peer-analysis",
        "generate-report"
      ]
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "criteria": {
      "type": "object"
    },
    "weights": {
      "type": "object"
    },
    "peerGroup": {
      "type": "string"
    },
    "benchmark": {
      "type": "string"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `investment-financial-planner`

**Name:** Financial Planning Engine

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "modules": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "retirement",
          "tax",
          "estate",
          "education",
          "insurance",
          "cash-flow",
          "monte-carlo",
          "social-security"
        ]
      }
    },
    "defaultAssumptions": {
      "type": "object",
      "properties": {
        "inflationRate": {
          "type": "number"
        },
        "marketReturn": {
          "type": "number"
        },
        "lifeExpectancy": {
          "type": "number"
        },
        "taxRates": {
          "type": "object"
        }
      }
    },
    "reportingCurrency": {
      "type": "string"
    },
    "complianceStandard": {
      "type": "string",
      "enum": [
        "cfp",
        "cfa",
        "sec",
        "fca",
        "custom"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "create-plan",
        "update-plan",
        "run-projection",
        "tax-optimization",
        "estate-analysis",
        "retirement-readiness",
        "goal-tracking",
        "scenario-comparison"
      ]
    },
    "clientProfile": {
      "type": "object",
      "properties": {
        "age": {
          "type": "number"
        },
        "income": {
          "type": "number"
        },
        "expenses": {
          "type": "number"
        },
        "assets": {
          "type": "object"
        },
        "liabilities": {
          "type": "object"
        },
        "goals": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "riskTolerance": {
          "type": "string"
        },
        "dependents": {
          "type": "number"
        }
      }
    },
    "planId": {
      "type": "string"
    },
    "assumptions": {
      "type": "object"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

### Legal

> Category source: `services/tool-executor/src/data/skills/legal/index.ts`

#### `review-contract`

**Name:** Review Contract

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "contractText": {
      "type": "string"
    },
    "contractType": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "review": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `draft-clause`

**Name:** Draft Clause

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "clauseType": {
      "type": "string"
    },
    "terms": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "clause": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-research`

**Name:** Legal Research

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Legal research system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Bearer access token"
    },
    "provider": {
      "type": "string",
      "description": "Optional legal research provider or workspace"
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "dateRange": {
      "type": "object"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "maxResults": {
      "type": "number"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "query"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-compliance`

**Name:** Legal Compliance

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Compliance system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Compliance API key"
    },
    "jurisdiction": {
      "type": "string",
      "description": "Default regulatory jurisdiction"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "documentText": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "regulation": {
      "type": "string"
    },
    "effectiveDate": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "documentText"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-case-management`

**Name:** Legal Case Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Case management system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Bearer access token"
    },
    "workspaceId": {
      "type": "string",
      "description": "Default legal workspace or firm ID"
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "get",
        "list",
        "close"
      ]
    },
    "caseId": {
      "type": "string"
    },
    "caseData": {
      "type": "object"
    },
    "clientId": {
      "type": "string"
    },
    "matterId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-statute-database`

**Name:** Legal Statute Database

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Statute database base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Statute database API key"
    },
    "defaultJurisdiction": {
      "type": "string",
      "description": "Default jurisdiction"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "statuteNumber": {
      "type": "string"
    },
    "effectiveDate": {
      "type": "string"
    },
    "includeHistory": {
      "type": "boolean"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "query"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-document-tagging`

**Name:** Legal Document Tagging

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Document tagging system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Document tagging API key"
    },
    "taxonomy": {
      "type": "string",
      "description": "Default document taxonomy or tag set"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "documentId": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "taxonomy": {
      "type": "string"
    },
    "matterId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "documentId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-case-search`

**Name:** Legal Case Search

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Case search system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Bearer access token"
    },
    "defaultCourt": {
      "type": "string",
      "description": "Default court or reporter filter"
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "court": {
      "type": "string"
    },
    "dateRange": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    },
    "pageSize": {
      "type": "number"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "query"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-risk-assessment`

**Name:** Legal Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Risk assessment system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Risk assessment API key"
    },
    "model": {
      "type": "string",
      "description": "Optional risk model or policy version"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "matterId": {
      "type": "string"
    },
    "facts": {
      "type": "string"
    },
    "jurisdiction": {
      "type": "string"
    },
    "riskFactors": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "facts"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-ediscovery`

**Name:** Legal eDiscovery

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "eDiscovery system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Bearer access token"
    },
    "matterId": {
      "type": "string",
      "description": "Default discovery matter ID"
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "collect",
        "search",
        "review",
        "export"
      ]
    },
    "matterId": {
      "type": "string"
    },
    "custodians": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object"
    },
    "searchTerms": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

### Marketing

> Category source: `services/tool-executor/src/data/skills/marketing/index.ts`

#### `plan-campaign`

**Name:** Plan Campaign

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "product": {
      "type": "string"
    },
    "budget": {
      "type": "number"
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "campaign": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `analyze-performance`

**Name:** Analyze Performance

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "campaignId": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "analysis": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-content-generation`

**Name:** Marketing Content Generation

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "CMS base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "CMS API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "contentful",
        "sanity",
        "wordpress",
        "custom"
      ]
    },
    "defaultLocale": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "publish",
        "schedule"
      ]
    },
    "contentType": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "body": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "topic": {
      "type": "string"
    },
    "audience": {
      "type": "string"
    },
    "tone": {
      "type": "string"
    },
    "locale": {
      "type": "string"
    },
    "campaignId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-social-media`

**Name:** Marketing Social Media

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Social publishing system base URL"
    },
    "token": {
      "type": "string",
      "description": "Social platform access token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "linkedin",
        "x",
        "facebook",
        "instagram",
        "tiktok",
        "custom"
      ]
    },
    "defaultAccount": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "schedule",
        "publish",
        "list"
      ]
    },
    "platform": {
      "type": "string"
    },
    "content": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "campaignId": {
      "type": "string"
    },
    "scheduledAt": {
      "type": "string"
    },
    "media": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-seo`

**Name:** Marketing SEO

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "SEO platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "SEO platform API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "semrush",
        "ahrefs",
        "google-search-console",
        "custom"
      ]
    },
    "defaultMarket": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "audit",
        "research",
        "optimize",
        "track"
      ]
    },
    "url": {
      "type": "string"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "content": {
      "type": "string"
    },
    "market": {
      "type": "string"
    },
    "searchEngine": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-market-research`

**Name:** Marketing Market Research

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Market research system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Research provider access token"
    },
    "providers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "defaultMarkets": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "baseUrl",
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "search",
        "analyze",
        "report",
        "monitor"
      ]
    },
    "query": {
      "type": "string"
    },
    "market": {
      "type": "string"
    },
    "competitors": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-audience-insights`

**Name:** Marketing Audience Insights

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Audience insights platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Audience insights API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-analytics",
        "segment",
        "salesforce",
        "custom"
      ]
    },
    "defaultSegment": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "segment",
        "profile",
        "analyze",
        "compare"
      ]
    },
    "audienceId": {
      "type": "string"
    },
    "demographics": {
      "type": "object"
    },
    "behaviors": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "campaignId": {
      "type": "string"
    },
    "dateRange": {
      "type": "object"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-email`

**Name:** Marketing Email

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Email platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Email platform API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "sendgrid",
        "mailgun",
        "ses",
        "brevo",
        "custom"
      ]
    },
    "fromAddress": {
      "type": "string"
    },
    "templates": {
      "type": "object"
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "draft",
        "schedule",
        "send",
        "measure"
      ]
    },
    "to": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "subject": {
      "type": "string"
    },
    "htmlBody": {
      "type": "string"
    },
    "textBody": {
      "type": "string"
    },
    "templateId": {
      "type": "string"
    },
    "templateData": {
      "type": "object"
    },
    "campaignId": {
      "type": "string"
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-document-management`

**Name:** Marketing Document Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Document management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Document system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-drive",
        "sharepoint",
        "dropbox",
        "box",
        "custom"
      ]
    },
    "defaultFolder": {
      "type": "string"
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "delete",
        "search"
      ]
    },
    "document": {
      "type": "object"
    },
    "documentId": {
      "type": "string"
    },
    "folderId": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "contentType": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

### PM

> Category source: `services/tool-executor/src/data/skills/product/index.ts`

#### `create-roadmap`

**Name:** Create Roadmap

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "quarter": {
      "type": "string"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "initiatives": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "themes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "roadmap": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `write-prd`

**Name:** Write PRD

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string"
    },
    "scope": {
      "type": "string"
    },
    "problem": {
      "type": "string"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "successMetrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "nonGoals": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "openQuestions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "prd": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-jira`

**Name:** Jira Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Jira base URL"
    },
    "email": {
      "type": "string",
      "description": "Jira user email"
    },
    "apiToken": {
      "type": "string",
      "description": "Jira API token"
    },
    "projectKey": {
      "type": "string",
      "description": "Default project key"
    },
    "issueType": {
      "type": "string",
      "description": "Default issue type"
    }
  },
  "required": [
    "baseUrl",
    "email",
    "apiToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "get"
      ]
    },
    "projectKey": {
      "type": "string"
    },
    "issueType": {
      "type": "string"
    },
    "summary": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "issueId": {
      "type": "string"
    },
    "fields": {
      "type": "object"
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-confluence`

**Name:** Confluence Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Confluence base URL"
    },
    "email": {
      "type": "string",
      "description": "Confluence user email"
    },
    "apiToken": {
      "type": "string",
      "description": "Confluence API token"
    },
    "spaceKey": {
      "type": "string",
      "description": "Default space key"
    },
    "ancestorId": {
      "type": "string",
      "description": "Parent page ID"
    }
  },
  "required": [
    "baseUrl",
    "email",
    "apiToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "get"
      ]
    },
    "spaceKey": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "body": {
      "type": "string"
    },
    "pageId": {
      "type": "string"
    },
    "ancestorId": {
      "type": "string"
    },
    "representation": {
      "type": "string",
      "enum": [
        "storage",
        "wiki",
        "markdown"
      ]
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-data-analysis`

**Name:** Product Data Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Analytics service base URL"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for analytics API"
    },
    "dataset": {
      "type": "string",
      "description": "Default dataset or table"
    }
  },
  "required": [
    "baseUrl",
    "apiToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "metric": {
      "type": "string",
      "description": "Metric to analyze"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "filters": {
      "type": "object"
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "granularity": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month",
        "quarter"
      ]
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "metric"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-slack`

**Name:** Slack Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "botToken": {
      "type": "string",
      "description": "Slack bot token (xoxb-...)"
    },
    "channel": {
      "type": "string",
      "description": "Default channel ID or name"
    }
  },
  "required": [
    "botToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "postMessage",
        "updateMessage",
        "deleteMessage",
        "listChannels",
        "createChannel"
      ]
    },
    "channel": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "ts": {
      "type": "string"
    },
    "channelName": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-calendar`

**Name:** Calendar Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "accessToken": {
      "type": "string",
      "description": "OAuth access token"
    },
    "refreshToken": {
      "type": "string",
      "description": "OAuth refresh token"
    },
    "calendarId": {
      "type": "string",
      "description": "Default calendar ID"
    }
  },
  "required": [
    "accessToken"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "delete",
        "list"
      ]
    },
    "summary": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "startTime": {
      "type": "string"
    },
    "endTime": {
      "type": "string"
    },
    "attendees": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "calendarId": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

#### `product-markdown-parsing`

**Name:** Markdown Parsing

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "apiUrl": {
      "type": "string",
      "description": "Parser service base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for parser service"
    },
    "format": {
      "type": "string",
      "description": "Output format: json, yaml, html"
    }
  },
  "required": [
    "apiUrl"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "Markdown content to parse"
    },
    "sourceUrl": {
      "type": "string",
      "description": "Optional source URL"
    },
    "extractSections": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "format": {
      "type": "string",
      "enum": [
        "json",
        "yaml",
        "html"
      ]
    },
    "endpointUrl": {
      "type": "string"
    }
  },
  "required": [
    "content"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/product/index.ts)

### Restaurant Ops

> Category source: `services/tool-executor/src/data/skills/restaurant/index.ts`

#### `manage-inventory`

**Name:** Manage Inventory

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "item": {
      "type": "string"
    },
    "quantity": {
      "type": "number"
    },
    "unit": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "entry": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-reservation-system`

**Name:** Restaurant Reservation System

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Reservation System system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Reservation System bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opentable",
        "resy",
        "sevenrooms",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-table-management`

**Name:** Restaurant Table Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Table Management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Table Management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opentable",
        "resy",
        "sevenrooms",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-guest-profile`

**Name:** Restaurant Guest Profile

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Guest Profile system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Guest Profile bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "sevenrooms",
        "opentable",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-service-flow`

**Name:** Restaurant Service Flow

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Service Flow system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Service Flow API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "toast",
        "square",
        "clover",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-floor-management`

**Name:** Restaurant Floor Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Floor Management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Floor Management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "sevenrooms",
        "opentable",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-staff-scheduler`

**Name:** Restaurant Staff Scheduler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Staff Scheduler system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Staff Scheduler bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "7shifts",
        "hot-schedules",
        "deputy",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-demand-forecast`

**Name:** Restaurant Demand Forecast

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Demand Forecast system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Demand Forecast API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "crunch-time",
        "teneo",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-labor-analytics`

**Name:** Restaurant Labor Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Labor Analytics system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Labor Analytics bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "7shifts",
        "hot-schedules",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-server-communication`

**Name:** Restaurant Server Communication

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Server Communication system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Server Communication API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "toast",
        "square",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-prep-scheduler`

**Name:** Restaurant Prep Scheduler

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Prep Scheduler system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Prep Scheduler bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-kitchen-display`

**Name:** Restaurant Kitchen Display

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Kitchen Display system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Kitchen Display API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "toast",
        "square",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-station-coordinator`

**Name:** Restaurant Station Coordinator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Station Coordinator system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Station Coordinator bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-recipe-management`

**Name:** Restaurant Recipe Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Recipe Management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Recipe Management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-recipe-costing`

**Name:** Restaurant Recipe Costing

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Recipe Costing system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Recipe Costing bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-menu-engineering`

**Name:** Restaurant Menu Engineering

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Menu Engineering system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Menu Engineering bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "upserve",
        "marketman",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-menu-optimizer`

**Name:** Restaurant Menu Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Menu Optimizer system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Menu Optimizer API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "upserve",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-pricing-strategy`

**Name:** Restaurant Pricing Strategy

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Pricing Strategy system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Pricing Strategy bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-purchase-order`

**Name:** Restaurant Purchase Order

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Purchase Order system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Purchase Order bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-supplier-management`

**Name:** Restaurant Supplier Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Supplier Management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Supplier Management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-order-optimizer`

**Name:** Restaurant Order Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Order Optimizer system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Order Optimizer API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-waste-management`

**Name:** Restaurant Waste Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Waste Management system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Waste Management bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "leanpath",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-price-tracking`

**Name:** Restaurant Price Tracking

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Price Tracking system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Price Tracking API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "marketman",
        "xtraCHEF",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-financial-analytics`

**Name:** Restaurant Financial Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Financial Analytics system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Financial Analytics bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "restaurant365",
        "compeat",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-variance-analysis`

**Name:** Restaurant Variance Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Variance Analysis system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Variance Analysis bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "restaurant365",
        "compeat",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-trend-analysis`

**Name:** Restaurant Trend Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Trend Analysis system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Trend Analysis bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "upserve",
        "toast",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-sales-analytics`

**Name:** Restaurant Sales Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Sales Analytics system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Sales Analytics bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "toast",
        "square",
        "upserve",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-reservation-analytics`

**Name:** Restaurant Reservation Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Reservation Analytics system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Reservation Analytics bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opentable",
        "resy",
        "sevenrooms",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-table-turnover`

**Name:** Restaurant Table Turnover

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Table Turnover system base URL"
    },
    "token": {
      "type": "string",
      "description": "Restaurant Table Turnover bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "opentable",
        "sevenrooms",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-quality-control`

**Name:** Restaurant Quality Control

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Quality Control system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Quality Control API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-guest-feedback`

**Name:** Restaurant Guest Feedback

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Restaurant Guest Feedback system base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Restaurant Guest Feedback API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "yelp",
        "google-reviews",
        "opentable",
        "custom"
      ]
    }
  },
  "required": [
    "baseUrl",
    "apiKey"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string"
    },
    "endpointUrl": {
      "type": "string"
    },
    "dryRun": {
      "type": "boolean"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ]
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object"
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object"
        }
      }
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": [
            "object",
            "string"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

### Sales

> Category source: `services/tool-executor/src/data/skills/sales/index.ts`

#### `score-lead`

**Name:** Score Lead

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "company": {
      "type": "string"
    },
    "budget": {
      "type": "number"
    },
    "timeline": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "lead": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `draft-outreach`

**Name:** Draft Outreach

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "prospectName": {
      "type": "string"
    },
    "prospectCompany": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "email": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `sales-crm`

**Name:** CRM

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the CRM API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "delete"
      ]
    },
    "entity": {
      "type": "string",
      "enum": [
        "contact",
        "lead",
        "opportunity"
      ]
    },
    "data": {
      "type": "object"
    }
  },
  "required": [
    "operation",
    "entity"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `sales-calendar`

**Name:** Calendar

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the calendar API"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "delete"
      ]
    },
    "event": {
      "type": "object"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `sales-analytics`

**Name:** Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the analytics API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "filters": {
      "type": "object"
    }
  },
  "required": [
    "query"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `sales-document-management`

**Name:** Document Management

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the document management API"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "delete"
      ]
    },
    "document": {
      "type": "object"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

### Sports Wager Advisor

> Category source: `services/tool-executor/src/data/skills/sports/index.ts`

#### `analyze-matchup`

**Name:** Analyze Matchup

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "sport": {
      "type": "string"
    },
    "teams": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "analysis": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-betting-risk-assessment`

**Name:** Sports Betting Risk Assessment

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "riskModels": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "var",
          "expected-loss",
          "bankroll-exposure",
          "drawdown",
          "ruin-probability"
        ]
      }
    },
    "maxStakePercent": {
      "type": "number"
    },
    "confidenceLevel": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "assess-wager",
        "portfolio-risk",
        "stress-test",
        "drawdown-analysis",
        "ruin-probability"
      ]
    },
    "stake": {
      "type": "number"
    },
    "odds": {
      "type": "number"
    },
    "winProbability": {
      "type": "number"
    },
    "bankroll": {
      "type": "number"
    },
    "wagers": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "confidenceLevel": {
      "type": "number"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-odds-data-collector`

**Name:** Sports Odds Data Collector

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "providers": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "draftkings",
          "fanduel",
          "bet365",
          "caesars",
          "pointsbet",
          "betmgm",
          "william-hill",
          "pinnacle",
          "betfair",
          "custom"
        ]
      }
    },
    "sports": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "leagues": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "markets": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "refreshIntervalSeconds": {
      "type": "number"
    },
    "includeHistorical": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get-current-odds",
        "get-historical-odds",
        "get-odds-comparison",
        "subscribe-feed",
        "get-line-movements"
      ]
    },
    "sport": {
      "type": "string"
    },
    "league": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "market": {
      "type": "string"
    },
    "bookmakers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "since": {
      "type": "string"
    },
    "until": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-value-betting-analyzer`

**Name:** Sports Value Betting Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "models": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "elo",
          "poisson",
          "xg",
          "monte-carlo",
          "ensemble",
          "custom"
        ]
      }
    },
    "minEdgePercent": {
      "type": "number"
    },
    "maxStakePercent": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "find-value",
        "evaluate-bet",
        "backtest-model",
        "compare-models"
      ]
    },
    "sport": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "market": {
      "type": "string"
    },
    "model": {
      "type": "string"
    },
    "modelProbabilities": {
      "type": "object"
    },
    "stake": {
      "type": "number"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-odds-comparison`

**Name:** Sports Odds Comparison

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "bookmakers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "exchanges": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "includeCommission": {
      "type": "boolean"
    },
    "minMargin": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "compare-event",
        "compare-market",
        "find-best-price",
        "arbitrage-scan",
        "monitor-spreads"
      ]
    },
    "eventId": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "market": {
      "type": "string"
    },
    "marketType": {
      "type": "string"
    },
    "selection": {
      "type": "string"
    },
    "bookmakers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "threshold": {
      "type": "number"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-betting-performance-analyzer`

**Name:** Sports Betting Performance Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "metrics": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "roi",
          "hit-rate",
          "clv",
          "closing-line",
          "stake-distribution",
          "drawdown",
          "profit-factor",
          "sharpe"
        ]
      }
    },
    "groupBy": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "sport",
          "market",
          "bookmaker",
          "timeframe"
        ]
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "summary",
        "breakdown",
        "clv-analysis",
        "stake-audit",
        "report"
      ]
    },
    "betIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "filters": {
      "type": "object",
      "properties": {
        "sport": {
          "type": "string"
        },
        "market": {
          "type": "string"
        },
        "bookmaker": {
          "type": "string"
        },
        "dateRange": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string"
            },
            "end": {
              "type": "string"
            }
          }
        }
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-bankroll-manager`

**Name:** Sports Bankroll Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "strategy": {
      "type": "string",
      "enum": [
        "flat",
        "kelly",
        "martingale",
        "fibonacci",
        "proportional",
        "custom"
      ]
    },
    "maxDailyLoss": {
      "type": "number"
    },
    "maxDailyStake": {
      "type": "number"
    },
    "stopLoss": {
      "type": "number"
    },
    "takeProfit": {
      "type": "number"
    },
    "maxConcurrentBets": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "allocate",
        "record-result",
        "get-status",
        "reset-day",
        "set-limits",
        "history"
      ]
    },
    "bankroll": {
      "type": "number"
    },
    "stake": {
      "type": "number"
    },
    "outcome": {
      "type": "string",
      "enum": [
        "win",
        "loss",
        "push",
        "pending"
      ]
    },
    "betId": {
      "type": "string"
    },
    "sport": {
      "type": "string"
    },
    "limits": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-performance-optimizer`

**Name:** Sports Performance Optimizer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "models": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "training-load",
          "recovery",
          "injury-risk",
          "readiness",
          "periodization",
          "custom"
        ]
      }
    },
    "sport": {
      "type": "string"
    },
    "units": {
      "type": "string",
      "enum": [
        "metric",
        "imperial"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "optimize-training",
        "assess-readiness",
        "predict-injury",
        "plan-periodization",
        "monitor-recovery",
        "generate-workout"
      ]
    },
    "athleteId": {
      "type": "string"
    },
    "athleteIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "teamId": {
      "type": "string"
    },
    "sport": {
      "type": "string"
    },
    "workload": {
      "type": "object"
    },
    "recoveryMetrics": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "targetEvent": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-stats-collector`

**Name:** Sports Stats Collector

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "providers": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "nba-api",
          "nfl-api",
          "mlb-api",
          "nhl-api",
          "soccer-api",
          "statsport",
          "chyron",
          "sportradar",
          "custom"
        ]
      }
    },
    "sports": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "statCategories": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "normalize": {
      "type": "boolean"
    },
    "cacheTtlSeconds": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "get-player-stats",
        "get-team-stats",
        "get-game-stats",
        "get-leaderboard",
        "get-historical",
        "get-live-stats"
      ]
    },
    "sport": {
      "type": "string"
    },
    "league": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "playerIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "teamIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "statTypes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-performance-modeling`

**Name:** Sports Performance Modeling

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "modelTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "regression",
          "classification",
          "time-series",
          "survival",
          "monte-carlo",
          "ensemble",
          "deep-learning"
        ]
      }
    },
    "features": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "target": {
      "type": "string"
    },
    "horizon": {
      "type": "string"
    },
    "validation": {
      "type": "string",
      "enum": [
        "train-test-split",
        "cross-validation",
        "walk-forward",
        "custom"
      ]
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "train-model",
        "predict",
        "backtest",
        "feature-importance",
        "evaluate",
        "compare-models"
      ]
    },
    "sport": {
      "type": "string"
    },
    "modelType": {
      "type": "string"
    },
    "features": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "target": {
      "type": "string"
    },
    "trainingData": {
      "type": "object"
    },
    "inputData": {
      "type": "object"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "horizon": {
      "type": "number"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-prediction-engine`

**Name:** Sports Prediction Engine

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "modelTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "elo",
          "poisson",
          "xg",
          "monte-carlo",
          "ensemble",
          "neural-net",
          "custom"
        ]
      }
    },
    "confidenceThreshold": {
      "type": "number"
    },
    "sport": {
      "type": "string"
    },
    "includeMargin": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "predict-outcome",
        "predict-series",
        "rank-teams",
        "simulate-season",
        "compare-models"
      ]
    },
    "sport": {
      "type": "string"
    },
    "league": {
      "type": "string"
    },
    "teamA": {
      "type": "string"
    },
    "teamB": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "model": {
      "type": "string"
    },
    "confidenceThreshold": {
      "type": "number"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-responsible-gambling`

**Name:** Sports Responsible Gambling

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dailyLossLimit": {
      "type": "number"
    },
    "weeklyLossLimit": {
      "type": "number"
    },
    "sessionTimeLimitMinutes": {
      "type": "number"
    },
    "cooldownPeriodHours": {
      "type": "number"
    },
    "selfExclusionDays": {
      "type": "number"
    },
    "notificationThresholds": {
      "type": "object"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "check-safeguards",
        "set-limits",
        "trigger-cooldown",
        "check-exclusion",
        "send-warning",
        "get-status"
      ]
    },
    "userId": {
      "type": "string"
    },
    "stake": {
      "type": "number"
    },
    "bankroll": {
      "type": "number"
    },
    "sport": {
      "type": "string"
    },
    "timeWindow": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-gambling-risk-analyzer`

**Name:** Sports Gambling Risk Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "riskThresholds": {
      "type": "object"
    },
    "behaviorModels": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "frequency",
          "chase",
          "loss-chasing",
          "session-length",
          "deposit-pattern",
          "custom"
        ]
      }
    },
    "lookbackDays": {
      "type": "number"
    },
    "volatilityWindow": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "analyze-behavior",
        "score-user",
        "detect-pattern",
        "flag-risk",
        "generate-report"
      ]
    },
    "userId": {
      "type": "string"
    },
    "activityLog": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "bets": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "timeWindow": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-responsible-gambling-planner`

**Name:** Sports Responsible Gambling Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "planTemplates": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "standard",
          "moderate-risk",
          "high-risk",
          "minimal-intervention",
          "custom"
        ]
      }
    },
    "riskLevels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "interventionTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "email",
          "sms",
          "app-notification",
          "cooldown",
          "session-limit",
          "temporary-suspension"
        ]
      }
    },
    "followUpDays": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "plan-intervention",
        "generate-plan",
        "schedule-follow-up",
        "adjust-plan",
        "get-plan"
      ]
    },
    "userId": {
      "type": "string"
    },
    "riskScore": {
      "type": "number"
    },
    "riskProfile": {
      "type": "object"
    },
    "restrictions": {
      "type": "object"
    },
    "sport": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-live-data-collector`

**Name:** Sports Live Data Collector

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "sources": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "official-feed",
          "provider-api",
          "websocket",
          "polling",
          "custom"
        ]
      }
    },
    "sports": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "leagues": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "pollingIntervalSeconds": {
      "type": "number"
    },
    "streamDurationSeconds": {
      "type": "number"
    },
    "includeRawEvents": {
      "type": "boolean"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "collect-stream",
        "subscribe",
        "poll-event",
        "get-scores",
        "get-events"
      ]
    },
    "sport": {
      "type": "string"
    },
    "league": {
      "type": "string"
    },
    "eventId": {
      "type": "string"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "since": {
      "type": "string"
    },
    "until": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-in-game-analyzer`

**Name:** Sports In-Game Analyzer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "analysisTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "momentum",
          "pressure",
          "market-shift",
          "win-probability",
          "edge-detection",
          "custom"
        ]
      }
    },
    "eventTypes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "lookbackSeconds": {
      "type": "number"
    },
    "lookAheadSeconds": {
      "type": "number"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "analyze-moment",
        "detect-momentum",
        "calculate-win-prob",
        "spot-edge",
        "track-market"
      ]
    },
    "eventId": {
      "type": "string"
    },
    "gameTime": {
      "type": "number"
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "market": {
      "type": "string"
    },
    "period": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-live-betting-advisor`

**Name:** Sports Live Betting Advisor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "strategy": {
      "type": "string",
      "enum": [
        "value",
        "momentum",
        "contrarian",
        "market-mirror",
        "custom"
      ]
    },
    "maxStakePercent": {
      "type": "number"
    },
    "confidenceThreshold": {
      "type": "number"
    },
    "allowedMarkets": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "bankroll": {
      "type": "number"
    },
    "currency": {
      "type": "string"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "advise-bet",
        "evaluate-opportunity",
        "set-trap",
        "adjust-position",
        "get-recommendations"
      ]
    },
    "eventId": {
      "type": "string"
    },
    "market": {
      "type": "string"
    },
    "selection": {
      "type": "string"
    },
    "odds": {
      "type": "number"
    },
    "gameTime": {
      "type": "number"
    },
    "confidence": {
      "type": "number"
    }
  },
  "required": [
    "action"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

### Support

> Category source: `services/tool-executor/src/data/skills/support/index.ts`

#### `resolve-ticket`

**Name:** Resolve Ticket

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "ticketId": {
      "type": "string"
    },
    "issue": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "ticket": "object",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `search-kb`

**Name:** Search Knowledge Base

**Persistent config schema:**

```json
{}
```

*No persistent settings are defined for this skill.*

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": "boolean",
    "results": "array",
    "storePath": "string"
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-sentiment-analysis`

**Name:** Sentiment Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the sentiment analysis API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "Text to analyze for sentiment"
    },
    "source": {
      "type": "string",
      "enum": [
        "ticket",
        "chat",
        "email",
        "survey",
        "review"
      ],
      "description": "Source of the text"
    },
    "language": {
      "type": "string",
      "description": "Language code (e.g., en, es, fr)"
    }
  },
  "required": [
    "text"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "sentiment": {
          "type": "string",
          "enum": [
            "positive",
            "negative",
            "neutral",
            "mixed"
          ]
        },
        "score": {
          "type": "number",
          "description": "Sentiment score from -1 to 1"
        },
        "confidence": {
          "type": "number",
          "description": "Confidence level 0-1"
        },
        "emotions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "keywords": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-response`

**Name:** Response Generator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the response generation API"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "ticketId": {
      "type": "string"
    },
    "customerMessage": {
      "type": "string"
    },
    "ticketContext": {
      "type": "object"
    },
    "tone": {
      "type": "string",
      "enum": [
        "professional",
        "friendly",
        "empathetic",
        "technical"
      ],
      "default": "empathetic"
    },
    "template": {
      "type": "string"
    },
    "includeKB": {
      "type": "boolean",
      "default": true
    }
  },
  "required": [
    "customerMessage"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "response": {
          "type": "string"
        },
        "alternatives": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "confidence": {
          "type": "number"
        },
        "suggestedActions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "kbReferences": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-crm`

**Name:** CRM Integration

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the CRM API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "delete",
        "sync"
      ]
    },
    "entity": {
      "type": "string",
      "enum": [
        "ticket",
        "customer",
        "contact",
        "account",
        "interaction"
      ]
    },
    "data": {
      "type": "object"
    },
    "filters": {
      "type": "object"
    }
  },
  "required": [
    "operation",
    "entity"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "record": {
          "type": "object"
        },
        "records": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "count": {
          "type": "number"
        },
        "syncStatus": {
          "type": "string"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-escalation`

**Name:** Escalation Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the escalation API"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create",
        "read",
        "update",
        "assign",
        "reassign",
        "acknowledge",
        "resolve"
      ]
    },
    "ticketId": {
      "type": "string"
    },
    "escalationLevel": {
      "type": "number",
      "minimum": 1,
      "maximum": 5
    },
    "assignedTo": {
      "type": "string"
    },
    "reason": {
      "type": "string"
    },
    "slaBreach": {
      "type": "boolean"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    }
  },
  "required": [
    "operation",
    "ticketId"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "escalation": {
          "type": "object"
        },
        "history": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "slaStatus": {
          "type": "string"
        },
        "nextAction": {
          "type": "string"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-analytics`

**Name:** Support Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the analytics API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Analytics query or metric name"
    },
    "filters": {
      "type": "object",
      "properties": {
        "dateRange": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string"
            },
            "end": {
              "type": "string"
            }
          }
        },
        "channel": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "agent": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "category": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "priority": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "granularity": {
      "type": "string",
      "enum": [
        "hour",
        "day",
        "week",
        "month"
      ],
      "default": "day"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "query"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "summary": {
          "type": "object"
        },
        "trends": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "comparisons": {
          "type": "object"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-issue-analysis`

**Name:** Issue Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the issue analysis API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "ticketId": {
      "type": "string"
    },
    "issueText": {
      "type": "string"
    },
    "customerInfo": {
      "type": "object"
    },
    "productContext": {
      "type": "object"
    },
    "history": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "analysisType": {
      "type": "string",
      "enum": [
        "root_cause",
        "classification",
        "pattern_detection",
        "similarity",
        "prediction"
      ]
    }
  },
  "required": [
    "issueText"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "rootCause": {
          "type": "string"
        },
        "category": {
          "type": "string"
        },
        "subCategory": {
          "type": "string"
        },
        "confidence": {
          "type": "number"
        },
        "similarIssues": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "suggestedResolution": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "urgency": {
          "type": "string",
          "enum": [
            "low",
            "medium",
            "high",
            "critical"
          ]
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-follow-up`

**Name:** Follow-up Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the follow-up API"
    },
    "apiToken": {
      "type": "string",
      "description": "Bearer token for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "schedule",
        "send",
        "cancel",
        "reschedule",
        "get_status",
        "list"
      ]
    },
    "ticketId": {
      "type": "string"
    },
    "customerId": {
      "type": "string"
    },
    "followUpType": {
      "type": "string",
      "enum": [
        "satisfaction",
        "resolution_check",
        "upsell",
        "renewal",
        "custom"
      ]
    },
    "schedule": {
      "type": "object",
      "properties": {
        "at": {
          "type": "string"
        },
        "delay": {
          "type": "string"
        },
        "recurring": {
          "type": "boolean"
        }
      }
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "in_app",
        "phone",
        "chat"
      ]
    },
    "template": {
      "type": "string"
    },
    "customMessage": {
      "type": "string"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "followUp": {
          "type": "object"
        },
        "followUps": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "status": {
          "type": "string"
        },
        "sentAt": {
          "type": "string"
        },
        "response": {
          "type": "object"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-planning`

**Name:** Support Planning

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Base URL for the planning API"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "forecast",
        "capacity",
        "schedule",
        "optimize",
        "report"
      ]
    },
    "timeRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string"
        },
        "end": {
          "type": "string"
        }
      }
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "teamSize": {
      "type": "number"
    },
    "constraints": {
      "type": "object"
    },
    "historicalData": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "goals": {
      "type": "object"
    }
  },
  "required": [
    "operation"
  ]
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "mode": {
      "type": "string"
    },
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "request": {
      "type": "object"
    },
    "response": {
      "type": "object",
      "properties": {
        "forecast": {
          "type": "object"
        },
        "capacityPlan": {
          "type": "object"
        },
        "schedule": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "recommendations": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "metrics": {
          "type": "object"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "mode",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

---

**Total skills catalogued:** 249

### Regeneration

```bash
node scripts/generate-skill-schema-docs.js
```

The script imports the live category modules, extracts manifest.configSchema, inputSchema, and outputSchema
for each Tool, normalizes shorthand types into JSON-Schema-shaped objects, and replaces the content
between the appendix markers in this document.

<!-- SKILL_SCHEMA_APPENDIX_END -->
