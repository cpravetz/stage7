

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

#### `analytics-scheduled-trend-monitor`

**Name:** Scheduled Trend Monitor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Warehouse or BI query endpoint"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Warehouse or BI API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "snowflake",
        "bigquery",
        "redshift",
        "postgres",
        "mysql",
        "clickhouse",
        "looker",
        "tableau",
        "metabase",
        "custom"
      ],
      "description": "Warehouse or BI provider"
    },
    "defaultDatabase": {
      "type": "string",
      "description": "Default database or schema"
    },
    "defaultWarehouse": {
      "type": "string",
      "description": "Default compute warehouse or service"
    },
    "queryTimeoutMs": {
      "type": "number",
      "description": "Warehouse query timeout in milliseconds",
      "default": 120000
    },
    "metricsPath": {
      "type": "string",
      "description": "Local metric cache path",
      "default": "/tmp/analytics/metrics.json"
    },
    "warehouseConfigPath": {
      "type": "string",
      "description": "Optional JSON connector configuration path",
      "default": "/tmp/analytics/warehouse-config.json"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "metric": {
      "type": "string",
      "description": "Metric name to analyze, such as page_views, conversions, revenue, or occupancy"
    },
    "dataset": {
      "type": "string",
      "description": "Dataset or metric alias used for trend analysis"
    },
    "period": {
      "type": "string",
      "description": "Report period, such as 7d, 30d, 90d, YTD, or 1y",
      "default": "30d"
    },
    "timeframe": {
      "type": "string",
      "description": "Trend timeframe, such as 7d, 30d, 90d, or 1y",
      "default": "30d"
    },
    "provider": {
      "type": "string",
      "enum": [
        "snowflake",
        "bigquery",
        "redshift",
        "postgres",
        "mysql",
        "clickhouse",
        "looker",
        "tableau",
        "metabase",
        "custom"
      ],
      "description": "Warehouse or BI provider override"
    },
    "database": {
      "type": "string",
      "description": "Database or schema to query"
    },
    "warehouse": {
      "type": "string",
      "description": "Warehouse or compute resource to use"
    },
    "queryTimeoutMs": {
      "type": "number",
      "description": "Warehouse request timeout in milliseconds",
      "default": 120000,
      "minimum": 1000
    },
    "metricsPath": {
      "type": "string",
      "description": "Local metrics cache path override"
    },
    "warehouseConfigPath": {
      "type": "string",
      "description": "Warehouse connector configuration path override"
    },
    "query": {
      "type": "string",
      "multiline": true,
      "description": "SQL or analytical query to execute when mode is query"
    },
    "warehouseQuery": {
      "type": "string",
      "multiline": true,
      "description": "Optional warehouse query override"
    },
    "parameters": {
      "type": "object",
      "properties": {},
      "description": "Parameter values for the analytical query",
      "additionalProperties": true
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dimensions to include in grouping or explanation"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Metric or warehouse filters",
      "additionalProperties": true
    },
    "sourceMode": {
      "type": "string",
      "enum": [
        "auto",
        "warehouse",
        "local"
      ],
      "description": "Data source selection; auto tries the warehouse and then the local cache",
      "default": "auto"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Prepare the query plan without executing a warehouse request",
      "default": false
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional warehouse API key override; never include this in an explanation"
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether grounded analysis or a query plan was produced"
    },
    "source": {
      "type": "string",
      "enum": [
        "warehouse",
        "local",
        "local-fallback",
        "query-plan",
        "not-connected"
      ],
      "description": "Data source used for the result"
    },
    "warehouseConnected": {
      "type": "boolean",
      "description": "Whether a warehouse connector was available for this run"
    },
    "connectorStatus": {
      "type": "string",
      "enum": [
        "connected",
        "not-configured",
        "unavailable",
        "not-executed"
      ],
      "description": "Warehouse connector status"
    },
    "data": {
      "type": "object",
      "description": "Metric insight, trend analysis, query result, or query plan"
    },
    "error": {
      "type": "string",
      "description": "Explicit failure reason when no grounded result is available"
    },
    "note": {
      "type": "string",
      "description": "Source, fallback, or freshness disclosure"
    }
  },
  "required": [
    "success",
    "source",
    "warehouseConnected",
    "connectorStatus",
    "data",
    "error",
    "note"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/analytics/index.ts)

#### `analytics-adhoc-query-evaluator`

**Name:** Adhoc Query Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Warehouse or BI query endpoint"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Warehouse or BI API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "snowflake",
        "bigquery",
        "redshift",
        "postgres",
        "mysql",
        "clickhouse",
        "looker",
        "tableau",
        "metabase",
        "custom"
      ],
      "description": "Warehouse or BI provider"
    },
    "defaultDatabase": {
      "type": "string",
      "description": "Default database or schema"
    },
    "defaultWarehouse": {
      "type": "string",
      "description": "Default compute warehouse or service"
    },
    "queryTimeoutMs": {
      "type": "number",
      "description": "Warehouse query timeout in milliseconds",
      "default": 120000
    },
    "metricsPath": {
      "type": "string",
      "description": "Local metric cache path",
      "default": "/tmp/analytics/metrics.json"
    },
    "warehouseConfigPath": {
      "type": "string",
      "description": "Optional JSON connector configuration path",
      "default": "/tmp/analytics/warehouse-config.json"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "metric": {
      "type": "string",
      "description": "Metric name to analyze, such as page_views, conversions, revenue, or occupancy"
    },
    "dataset": {
      "type": "string",
      "description": "Dataset or metric alias used for trend analysis"
    },
    "period": {
      "type": "string",
      "description": "Report period, such as 7d, 30d, 90d, YTD, or 1y",
      "default": "30d"
    },
    "timeframe": {
      "type": "string",
      "description": "Trend timeframe, such as 7d, 30d, 90d, or 1y",
      "default": "30d"
    },
    "provider": {
      "type": "string",
      "enum": [
        "snowflake",
        "bigquery",
        "redshift",
        "postgres",
        "mysql",
        "clickhouse",
        "looker",
        "tableau",
        "metabase",
        "custom"
      ],
      "description": "Warehouse or BI provider override"
    },
    "database": {
      "type": "string",
      "description": "Database or schema to query"
    },
    "warehouse": {
      "type": "string",
      "description": "Warehouse or compute resource to use"
    },
    "queryTimeoutMs": {
      "type": "number",
      "description": "Warehouse request timeout in milliseconds",
      "default": 120000,
      "minimum": 1000
    },
    "metricsPath": {
      "type": "string",
      "description": "Local metrics cache path override"
    },
    "warehouseConfigPath": {
      "type": "string",
      "description": "Warehouse connector configuration path override"
    },
    "query": {
      "type": "string",
      "multiline": true,
      "description": "SQL or analytical query to execute when mode is query"
    },
    "warehouseQuery": {
      "type": "string",
      "multiline": true,
      "description": "Optional warehouse query override"
    },
    "parameters": {
      "type": "object",
      "properties": {},
      "description": "Parameter values for the analytical query",
      "additionalProperties": true
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dimensions to include in grouping or explanation"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Metric or warehouse filters",
      "additionalProperties": true
    },
    "sourceMode": {
      "type": "string",
      "enum": [
        "auto",
        "warehouse",
        "local"
      ],
      "description": "Data source selection; auto tries the warehouse and then the local cache",
      "default": "auto"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Prepare the query plan without executing a warehouse request",
      "default": false
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional warehouse API key override; never include this in an explanation"
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether grounded analysis or a query plan was produced"
    },
    "source": {
      "type": "string",
      "enum": [
        "warehouse",
        "local",
        "local-fallback",
        "query-plan",
        "not-connected"
      ],
      "description": "Data source used for the result"
    },
    "warehouseConnected": {
      "type": "boolean",
      "description": "Whether a warehouse connector was available for this run"
    },
    "connectorStatus": {
      "type": "string",
      "enum": [
        "connected",
        "not-configured",
        "unavailable",
        "not-executed"
      ],
      "description": "Warehouse connector status"
    },
    "data": {
      "type": "object",
      "description": "Metric insight, trend analysis, query result, or query plan"
    },
    "error": {
      "type": "string",
      "description": "Explicit failure reason when no grounded result is available"
    },
    "note": {
      "type": "string",
      "description": "Source, fallback, or freshness disclosure"
    }
  },
  "required": [
    "success",
    "source",
    "warehouseConnected",
    "connectorStatus",
    "data",
    "error",
    "note"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/analytics/index.ts)

### Career

> Category source: `services/tool-executor/src/data/skills/career/index.ts`

#### `career-job-market-positioning-evaluator`

**Name:** Resume & Market Positioning Advisor

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {}
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
    "status": {
      "type": "string",
      "description": "ok, partial, failed or blocked. \"partial\" means the market read is missing job sources that could not be retrieved, so it is not a complete view of the market."
    },
    "data": {
      "type": "object",
      "properties": {
        "marketSignals": {
          "type": "object"
        },
        "recommendation": {
          "type": "object"
        },
        "failures": {
          "type": "array",
          "description": "The job sources that could not be retrieved or read, carried through from discovery. Non-empty on a partial run."
        },
        "failureCount": {
          "type": "number"
        },
        "complete": {
          "type": "boolean",
          "description": "False when at least one job source could not be retrieved"
        },
        "delegatedTo": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "note": {
          "type": "string"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Null on a clean run. Non-null on partial, failed and blocked runs, naming what could not be retrieved"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks; a partial run always carries a block headed PARTIAL MARKET READ",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-interview-compensation-battlecard-creator`

**Name:** Interview & Negotiation Prep

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "company": {
      "type": "string",
      "description": "Company you are interviewing with",
      "title": "Company",
      "order": 1,
      "hint": "The company you are interviewing with"
    },
    "targetRole": {
      "type": "string",
      "description": "Target role title",
      "title": "Target Role",
      "order": 2,
      "hint": "The role you are interviewing for"
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Interview briefing with questions and negotiation guide, derived from inputs"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-governed-application-outreach-manager`

**Name:** Application & Outreach Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Roles to apply to",
      "title": "Target Roles",
      "order": 1,
      "hint": "Roles you want to apply for (optional; can pull from pipeline)"
    },
    "targetCompany": {
      "type": "string",
      "description": "",
      "title": "Target Company",
      "order": 2,
      "hint": "Company for outreach context"
    },
    "targetPerson": {
      "type": "string",
      "description": "",
      "title": "Contact Person",
      "order": 3,
      "hint": "Specific person to reach out to"
    },
    "relationshipStage": {
      "type": "string",
      "description": "",
      "title": "Relationship Stage",
      "order": 4,
      "hint": "e.g. cold, warm, referral"
    },
    "channel": {
      "type": "string",
      "description": "",
      "title": "Channel",
      "order": 5,
      "hint": "e.g. email, LinkedIn, referral"
    },
    "dryRun": {
      "type": "boolean",
      "description": "",
      "title": "Dry Run",
      "order": 6,
      "hint": "Stage only; do not send"
    }
  },
  "required": []
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
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-job-discovery-fit-ranking`

**Name:** Job Search & Fit Ranking

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "boardTokens": {
      "type": "object",
      "description": "Pin exact ATS board names, e.g. { \"greenhouse\": [\"stripe\"], \"ashby\": [\"ashby\"], \"lever\": [\"leverdemo\"] }. Optional - company names are probed automatically.",
      "properties": {
        "greenhouse": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "ashby": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "lever": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "maxPerBoard": {
      "type": "number",
      "default": 50,
      "description": "Maximum listings to take from each board"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "jobTitles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Job titles to search for. Defaults to your saved target titles/roles from your profile."
    },
    "companies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Company names to search. Checked against the public Greenhouse, Ashby and Lever job board APIs - no key needed. Defaults to your saved target companies."
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Target locations. Defaults to your saved preferences."
    },
    "minSalary": {
      "type": "number",
      "description": "Minimum target compensation. Defaults to your saved preference."
    },
    "maxSalary": {
      "type": "number",
      "description": "Maximum target compensation. Defaults to your saved preference."
    },
    "autoApplyThreshold": {
      "type": "number",
      "description": "If set, automatically submit an application (via Apply to Jobs) to every ranked job scoring at or above this fit score"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Preview auto-applications without submitting; defaults to true",
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
    "success": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "description": "ok, no-match, partial, failed or blocked. \"partial\" means some job sources could not be retrieved at all, so the ranking covers only the sources that answered; \"no-match\" means every source answered and genuinely had no matching roles."
    },
    "data": {
      "type": "object",
      "properties": {
        "ranked": {
          "type": "array"
        },
        "total": {
          "type": "number"
        },
        "rawDiscovered": {
          "type": "number",
          "description": "Listings found before profile ranking"
        },
        "queriesUsed": {
          "type": "array"
        },
        "companiesSearched": {
          "type": "array"
        },
        "byBoard": {
          "type": "array",
          "description": "Per-source status, so a real empty result is distinguishable from a source that never ran"
        },
        "boards": {
          "type": "array"
        },
        "failures": {
          "type": "array",
          "description": "The job sources that could not be retrieved or read, carried through from discovery. Non-empty on a partial run."
        },
        "failureCount": {
          "type": "number"
        },
        "discoveryStatus": {
          "type": "string",
          "description": "The upstream discovery run status this result came from"
        },
        "complete": {
          "type": "boolean",
          "description": "False when at least one job source could not be retrieved, so the ranking is incomplete"
        },
        "storagePath": {
          "type": "string"
        },
        "note": {
          "type": "string"
        },
        "autoApplied": {
          "type": "object"
        },
        "delegatedTo": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "error": {
      "type": "string",
      "description": "Null on a clean run. Non-null on partial, failed and blocked runs, naming what could not be retrieved"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks; a partial run always carries a block headed PARTIAL RESULT",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-application-execution-orchestrator`

**Name:** Apply to Selected Jobs

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Specific roles to apply to; if left blank, the pipeline will be used",
      "x-referenceSource": "career-job-discovery-fit-ranking"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Preview without submitting; defaults to true",
      "default": true
    },
    "customResume": {
      "type": "string",
      "description": "Custom resume text to use for this application when overriding your default resume",
      "multiline": true
    },
    "customCoverLetter": {
      "type": "string",
      "description": "Custom cover letter text to use for this application",
      "multiline": true
    },
    "customResumeFile": {
      "type": "object",
      "description": "Upload a resume file; text entry remains available as a fallback",
      "properties": {
        "name": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        },
        "content": {
          "type": "string"
        }
      },
      "required": [
        "name",
        "mimeType",
        "content"
      ]
    },
    "customCoverLetterFile": {
      "type": "object",
      "description": "Upload a cover letter file; text entry remains available as a fallback",
      "properties": {
        "name": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        },
        "content": {
          "type": "string"
        }
      },
      "required": [
        "name",
        "mimeType",
        "content"
      ]
    },
    "coverLetters": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Optional cover-letter variants to use"
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
    "status": {
      "type": "string",
      "description": "Execution status"
    },
    "data": {
      "type": "object",
      "properties": {
        "applications": {
          "type": "array"
        },
        "errors": {
          "type": "array"
        },
        "dryRun": {
          "type": "boolean"
        },
        "trackingPath": {
          "type": "string"
        },
        "delegatedTo": {
          "type": "string"
        },
        "orchestratedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-upskill-role-targeted-learning-planner`

**Name:** Upskill & Learning Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "jobTitle": {
      "type": "string",
      "description": "The job title you want to prepare for (e.g. Senior Data Scientist)",
      "title": "Target Role",
      "order": 1,
      "hint": "e.g. Senior Data Scientist"
    },
    "jobPosting": {
      "type": "string",
      "description": "Paste a specific job posting to tailor the plan to its exact requirements",
      "title": "Job Posting",
      "order": 2,
      "hint": "Optional: paste full job description",
      "multiline": true
    },
    "targetSkills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Skills you already have, to check against the role",
      "title": "Your Skills",
      "order": 3,
      "hint": "Comma-separated list of skills you possess"
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
    "status": {
      "type": "string",
      "description": "Execution status"
    },
    "data": {
      "type": "object",
      "properties": {
        "targetRole": {
          "type": "string"
        },
        "missingSkills": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "learningPlan": {
          "type": "object"
        },
        "delegatedTo": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-interview-practice-mock-interviewer`

**Name:** Interview Practice & Mock Interviewer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "stage": {
      "type": "string",
      "enum": [
        "phone_screen",
        "technical",
        "onsite",
        "final"
      ],
      "description": "Interview stage"
    },
    "targetRole": {
      "type": "string",
      "description": "Target role title"
    },
    "company": {
      "type": "string",
      "description": "Target company name"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Mock interview session data with practice material and session ID"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-pipeline-outcome-tracker`

**Name:** Pipeline & Outcome Tracker

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetRole": {
      "type": "string",
      "description": "Job title or role identifier to track or record an outcome for"
    },
    "company": {
      "type": "string",
      "description": "Company name for the application"
    },
    "status": {
      "type": "string",
      "enum": [
        "applied",
        "interviewing",
        "offer",
        "rejected",
        "withdrawn",
        "accepted",
        "no-response"
      ],
      "description": "Application outcome status",
      "default": "applied"
    },
    "feedback": {
      "type": "string",
      "description": "Interview or application feedback",
      "multiline": true
    },
    "appliedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When the application was submitted"
    },
    "offerDetails": {
      "type": "object",
      "description": "Offer details if applicable"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Pipeline data, outcome recording results, role info, and stale follow-ups"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-resume-template-manager`

**Name:** Resume & Template Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Template name"
    },
    "type": {
      "type": "string",
      "enum": [
        "resume",
        "cover-letter"
      ],
      "description": "Template type"
    },
    "content": {
      "type": "string",
      "description": "Template content"
    },
    "variables": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Template variable names (configuration, not run-time data)"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Template tags (configuration, not run-time data)"
    },
    "resumeFile": {
      "type": "object",
      "description": "Resume file used to create a resume template",
      "properties": {
        "name": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        },
        "content": {
          "type": "string",
          "description": "Base64 for binary formats, plain text for md/txt"
        }
      },
      "required": [
        "name",
        "mimeType",
        "content"
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Saved resume/template metadata without internal file paths"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-portal-recruiter-workflow`

**Name:** Application + Recruiter Outreach

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dryRun": {
      "type": "boolean",
      "description": "Preview without submitting; defaults to true",
      "default": true
    },
    "applyAt": {
      "type": "string",
      "description": "Where to apply: the job posting URL or application portal"
    },
    "targetCompany": {
      "type": "string",
      "description": "Target company for networking outreach"
    },
    "targetPerson": {
      "type": "string",
      "description": "Target person for networking outreach"
    },
    "relationshipStage": {
      "type": "string",
      "enum": [
        "cold_outreach",
        "follow_up",
        "thank_you",
        "referral_ask"
      ],
      "description": "Relationship stage"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin"
      ],
      "description": "Outreach channel"
    },
    "connectedSendTool": {
      "type": "string",
      "description": "MCP reference for a connected send channel"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "description": "Execution status"
    },
    "data": {
      "type": "object",
      "properties": {
        "applications": {
          "type": "object"
        },
        "outreach": {
          "type": "object"
        },
        "delegatedTo": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-profile-intake`

**Name:** Profile Intake

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "profileId": {
      "type": "string",
      "default": "default"
    },
    "name": {
      "type": "string"
    },
    "email": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "location": {
      "type": "string"
    },
    "headline": {
      "type": "string"
    },
    "targetTitles": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "skills": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "resumeText": {
      "type": "string"
    },
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "targetCompanies": {
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
    "success": {
      "type": "boolean"
    },
    "data": {
      "type": "object",
      "properties": {
        "profile": {
          "type": "object"
        },
        "profilePath": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-job-discovery`

**Name:** Job Discovery

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Job titles to search for"
    },
    "query": {
      "type": "string",
      "description": "Single search query"
    },
    "companies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Company names. Checked against the public Greenhouse, Ashby and Lever job board APIs."
    },
    "targetCompanies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Alias for companies"
    },
    "locations": {
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
    },
    "boardTokens": {
      "type": "object",
      "description": "Explicit ATS board names to pin, e.g. { \"greenhouse\": [\"stripe\"], \"ashby\": [\"ashby\"], \"lever\": [\"leverdemo\"] }",
      "properties": {
        "greenhouse": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "ashby": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "lever": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "maxPerBoard": {
      "type": "number",
      "default": 50
    },
    "enrichDescriptions": {
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Job listings, per-board source status (ok / no-match / error), the per-source retrieval failures, and search metadata"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-rank`

**Name:** Rank Opportunities

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "description": "Job listings to rank"
    },
    "profileId": {
      "type": "string",
      "default": "default"
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
    "success": {
      "type": "boolean"
    },
    "data": {
      "type": "object",
      "properties": {
        "ranked": {
          "type": "array"
        },
        "totalScored": {
          "type": "number"
        },
        "totalAfterFilter": {
          "type": "number"
        },
        "rankPath": {
          "type": "string"
        },
        "weights": {
          "type": "object"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-application-execution`

**Name:** Apply to Jobs

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "listings": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Job listing identifiers to apply to"
    },
    "dryRun": {
      "type": "boolean",
      "default": true
    },
    "coverLetters": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "customResume": {
      "type": "string",
      "multiline": true
    },
    "customCoverLetter": {
      "type": "string",
      "multiline": true
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
      "type": "object",
      "properties": {
        "applications": {
          "type": "array"
        },
        "errors": {
          "type": "array"
        },
        "submitted": {
          "type": "number"
        },
        "dryRun": {
          "type": "boolean"
        },
        "bulk": {
          "type": "boolean"
        },
        "trackingPath": {
          "type": "string"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-add-template`

**Name:** Add Template

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "templateId": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": [
        "resume",
        "cover-letter"
      ]
    },
    "kind": {
      "type": "string",
      "enum": [
        "resume",
        "cover_letter"
      ]
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
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
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
    "success": {
      "type": "boolean"
    },
    "data": {
      "type": "object",
      "properties": {
        "template": {
          "type": "object"
        },
        "outPath": {
          "type": "string"
        },
        "totalTemplates": {
          "type": "number"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-networking-outreach`

**Name:** Networking Outreach

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "targetCompany": {
      "type": "string"
    },
    "targetPerson": {
      "type": "string"
    },
    "relationshipStage": {
      "type": "string",
      "enum": [
        "cold_outreach",
        "follow_up",
        "thank_you",
        "referral_ask"
      ]
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin"
      ]
    },
    "connectedSendTool": {
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
    "data": {
      "type": "object",
      "properties": {
        "summary": {
          "type": "string"
        },
        "message": {
          "type": "string"
        },
        "channel": {
          "type": "string"
        },
        "subject": {
          "type": "string"
        },
        "tone": {
          "type": "string"
        },
        "options": {
          "type": "array"
        },
        "rationale": {
          "type": "string"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-pipeline-report`

**Name:** Pipeline Report

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {}
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
      "type": "object",
      "properties": {
        "tracking": {
          "type": "array"
        },
        "byStatus": {
          "type": "object"
        },
        "total": {
          "type": "number"
        },
        "staleFollowUps": {
          "type": "array"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-outcome`

**Name:** Track Outcomes

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "applicationId": {
      "type": "string"
    },
    "jobTitle": {
      "type": "string"
    },
    "company": {
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
    "feedback": {
      "type": "string"
    },
    "offerDetails": {
      "type": "object"
    },
    "date": {
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
    "success": {
      "type": "boolean"
    },
    "data": {
      "type": "object",
      "properties": {
        "entry": {
          "type": "object"
        },
        "stats": {
          "type": "object"
        },
        "trackingPath": {
          "type": "string"
        },
        "outcomesPath": {
          "type": "string"
        },
        "generatedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-interview-prep`

**Name:** Career Interview Prep

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
    "targetRole": {
      "type": "string"
    },
    "company": {
      "type": "string"
    },
    "stage": {
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
    "summary": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

#### `career-advisory`

**Name:** Career Advisory

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
    "question": {
      "type": "string"
    },
    "targetRole": {
      "type": "string"
    },
    "company": {
      "type": "string"
    },
    "jobDescription": {
      "type": "string",
      "multiline": true
    }
  }
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "string"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/career/index.ts)

### Content

> Category source: `services/tool-executor/src/data/skills/content/index.ts`

#### `content-drafting-adaptation`

**Name:** Content Drafting & Adaptation

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
    "task": {
      "type": "string",
      "enum": [
        "draft",
        "adapt",
        "repurpose"
      ],
      "description": "draft a brief, adapt existing content, or repurpose it"
    },
    "contentType": {
      "type": "string",
      "enum": [
        "blog",
        "social",
        "video",
        "email",
        "script",
        "whitepaper",
        "case-study",
        "newsletter"
      ],
      "description": "Type of content"
    },
    "topic": {
      "type": "string",
      "description": "Topic or title (required for draft)"
    },
    "sourceContent": {
      "type": "string",
      "description": "Existing content to measure (required for adapt and repurpose)",
      "multiline": true
    },
    "targetFormat": {
      "type": "string",
      "enum": [
        "blog",
        "social",
        "video",
        "email",
        "script",
        "thread",
        "carousel",
        "short-form",
        "long-form"
      ],
      "description": "Target format for adaptation"
    },
    "targetPlatform": {
      "type": "string",
      "enum": [
        "linkedin",
        "twitter",
        "instagram",
        "facebook",
        "youtube",
        "tiktok",
        "blog",
        "newsletter",
        "medium",
        "substack"
      ],
      "description": "Target platform"
    },
    "targetLanguage": {
      "type": "string",
      "description": "Target language for translation or localisation"
    },
    "targetAudience": {
      "type": "string",
      "description": "Target audience"
    },
    "tone": {
      "type": "string",
      "enum": [
        "professional",
        "conversational",
        "authoritative",
        "friendly",
        "witty",
        "empathetic",
        "technical",
        "persuasive"
      ],
      "description": "Writing tone",
      "default": "professional"
    },
    "length": {
      "type": "string",
      "enum": [
        "short",
        "medium",
        "long"
      ],
      "description": "Target length",
      "default": "medium"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Keywords to plan placement for"
    }
  },
  "required": [
    "task"
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
    "status": {
      "type": "string",
      "description": "ok, error, or not-connected"
    },
    "data": {
      "type": "object"
    },
    "error": {
      "type": "string"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-multi-channel-publishing`

**Name:** Multi-Channel Publishing

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Publishing platform base URL"
    },
    "token": {
      "type": "string",
      "description": "Publishing platform bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "wordpress",
        "ghost",
        "medium",
        "substack",
        "contentful",
        "strapi",
        "sanity",
        "custom"
      ],
      "description": "CMS/blog provider"
    },
    "socialProviders": {
      "type": "object",
      "description": "Connected social accounts",
      "properties": {
        "linkedin": {
          "type": "object"
        },
        "twitter": {
          "type": "object"
        },
        "instagram": {
          "type": "object"
        },
        "facebook": {
          "type": "object"
        },
        "youtube": {
          "type": "object"
        },
        "tiktok": {
          "type": "object"
        }
      }
    },
    "videoProviders": {
      "type": "object",
      "description": "Connected video platforms",
      "properties": {
        "youtube": {
          "type": "object"
        },
        "vimeo": {
          "type": "object"
        },
        "wistia": {
          "type": "object"
        },
        "mux": {
          "type": "object"
        }
      }
    },
    "newsletterProviders": {
      "type": "object",
      "description": "Connected newsletter platforms",
      "properties": {
        "mailchimp": {
          "type": "object"
        },
        "convertkit": {
          "type": "object"
        },
        "beehiiv": {
          "type": "object"
        },
        "custom": {
          "type": "object"
        }
      }
    },
    "defaultCategory": {
      "type": "string",
      "description": "Default blog category"
    },
    "defaultTags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default tags"
    },
    "defaultPrivacy": {
      "type": "string",
      "enum": [
        "public",
        "unlisted",
        "private"
      ],
      "description": "Default video privacy"
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
    "channel": {
      "type": "string",
      "enum": [
        "blog",
        "social",
        "video",
        "newsletter",
        "all"
      ],
      "description": "Channel to publish to"
    },
    "contentId": {
      "type": "string",
      "description": "Existing content ID for update/delete/get"
    },
    "title": {
      "type": "string",
      "description": "Content title"
    },
    "content": {
      "type": "string",
      "description": "Content body (markdown/HTML)",
      "multiline": true
    },
    "excerpt": {
      "type": "string",
      "description": "Short summary/excerpt"
    },
    "category": {
      "type": "string",
      "description": "Blog category"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags"
    },
    "slug": {
      "type": "string",
      "description": "URL slug"
    },
    "featuredImage": {
      "type": "string",
      "description": "Featured image URL"
    },
    "seoTitle": {
      "type": "string",
      "description": "SEO title"
    },
    "seoDescription": {
      "type": "string",
      "description": "SEO meta description"
    },
    "status": {
      "type": "string",
      "enum": [
        "draft",
        "published",
        "scheduled",
        "private"
      ],
      "description": "Publishing status",
      "default": "draft"
    },
    "scheduledAt": {
      "type": "string",
      "description": "Scheduled publish datetime (ISO 8601)"
    },
    "platform": {
      "type": "string",
      "enum": [
        "linkedin",
        "twitter",
        "instagram",
        "facebook",
        "youtube",
        "tiktok",
        "threads"
      ],
      "description": "Social platform (required for social channel)"
    },
    "message": {
      "type": "string",
      "description": "Social post message",
      "multiline": true
    },
    "hashtags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Hashtags"
    },
    "videoId": {
      "type": "string",
      "description": "Video ID for update/delete/get"
    },
    "videoTitle": {
      "type": "string",
      "description": "Video title"
    },
    "videoDescription": {
      "type": "string",
      "description": "Video description",
      "multiline": true
    },
    "videoTags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Video tags"
    },
    "videoCategory": {
      "type": "string",
      "description": "Video category"
    },
    "privacy": {
      "type": "string",
      "enum": [
        "public",
        "unlisted",
        "private"
      ],
      "description": "Video privacy"
    },
    "thumbnailUrl": {
      "type": "string",
      "description": "Thumbnail image URL"
    },
    "videoFile": {
      "type": "string",
      "description": "Video file path or URL"
    },
    "playlistId": {
      "type": "string",
      "description": "Playlist ID"
    },
    "newsletterId": {
      "type": "string",
      "description": "Newsletter/campaign ID"
    },
    "subject": {
      "type": "string",
      "description": "Email subject"
    },
    "htmlBody": {
      "type": "string",
      "description": "HTML email body",
      "multiline": true
    },
    "textBody": {
      "type": "string",
      "description": "Plain text email body",
      "multiline": true
    },
    "recipientList": {
      "type": "string",
      "description": "Recipient list/segment ID"
    },
    "fromName": {
      "type": "string",
      "description": "From name"
    },
    "fromEmail": {
      "type": "string",
      "description": "From email"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without publishing"
    }
  },
  "required": [
    "channel"
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
    "system",
    "action"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-performance-seo`

**Name:** Content Performance & SEO Insight

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Content intelligence platform base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "Content intelligence API key"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-analytics",
        "matomo",
        "mixpanel",
        "amplitude",
        "semrush",
        "ahrefs",
        "search-console",
        "custom"
      ],
      "description": "Primary analytics/SEO provider"
    },
    "secondaryProviders": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Additional connected providers"
    },
    "defaultDateRange": {
      "type": "string",
      "description": "Default analysis period"
    },
    "defaultMetrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default metrics to track"
    },
    "defaultDimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default dimensions to analyze"
    },
    "searchEngines": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Search engines for SEO tracking"
    },
    "defaultMarket": {
      "type": "string",
      "description": "Default market/region"
    }
  },
  "required": [
    "baseUrl",
    "apiKey",
    "provider"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "contentIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Content identifiers to analyze"
    },
    "channel": {
      "type": "string",
      "description": "Channel/platform (blog, social, video, email, organic, paid)"
    },
    "platform": {
      "type": "string",
      "description": "Specific platform (linkedin, youtube, google, etc.)"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Metrics to track"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dimensions to analyze"
    },
    "dateRange": {
      "type": "object",
      "description": "Date range for analysis"
    },
    "filters": {
      "type": "object",
      "description": "Filters to apply"
    },
    "groupBy": {
      "type": "string",
      "description": "Field to group results by"
    },
    "url": {
      "type": "string",
      "description": "URL for SEO audit/optimization"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Keywords for research/tracking"
    },
    "targetKeywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Target keywords for optimization"
    },
    "market": {
      "type": "string",
      "description": "Market/region for SEO"
    },
    "searchEngine": {
      "type": "string",
      "description": "Search engine (google, bing, etc.)"
    },
    "competitorUrls": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Competitor URLs for comparison"
    },
    "audienceId": {
      "type": "string",
      "description": "Audience identifier for segmentation"
    },
    "demographics": {
      "type": "object",
      "description": "Demographic filters"
    },
    "interests": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Interest categories"
    },
    "behaviors": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Behavioral signals"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing"
    }
  },
  "required": []
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
    "system",
    "action"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `content-strategy-seo-evaluator`

**Name:** Content Strategy & SEO Evaluator

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
    "contentItems": {
      "type": "array",
      "description": "Content performance records with impressions, clicks, conversions, and optionally keywordMatch",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "impressions": {
            "type": "number"
          },
          "clicks": {
            "type": "number"
          },
          "conversions": {
            "type": "number"
          },
          "keywordMatch": {
            "type": "number"
          }
        }
      }
    },
    "contentIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Content identifiers to request from connected analytics"
    },
    "channel": {
      "type": "string",
      "description": "Channel or platform"
    },
    "platform": {
      "type": "string",
      "description": "Specific analytics platform"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Metrics to request from connected analytics"
    },
    "dateRange": {
      "type": "object",
      "description": "Analysis date range"
    },
    "keywordMatch": {
      "type": "number",
      "description": "Fallback search-intent match score (0-100) applied to records that do not carry their own"
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Evaluated records, averages, and the coverage of connected analytics"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `editorial-calendar-article-copilot`

**Name:** Editorial Calendar & Article Co-Pilot

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
    "topics": {
      "type": "array",
      "description": "Editorial topics. Each needs a title; audience, intent, format, platform, keywords, tone, length, and deadline sharpen the brief.",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Topic title (required)"
          },
          "audience": {
            "type": "string",
            "description": "Target audience"
          },
          "intent": {
            "type": "string",
            "description": "Search intent (informational, commercial, transactional, navigational)"
          },
          "format": {
            "type": "string",
            "description": "Content format (blog, case-study, newsletter, whitepaper, script, video, email, social)"
          },
          "platform": {
            "type": "string",
            "description": "Target platform"
          },
          "keywords": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Target keywords"
          },
          "tone": {
            "type": "string",
            "description": "Writing tone"
          },
          "length": {
            "type": "string",
            "description": "Target length (short, medium, long)"
          },
          "deadline": {
            "type": "string",
            "description": "Publication deadline (ISO 8601 date)"
          }
        },
        "required": [
          "title"
        ]
      }
    },
    "startDate": {
      "type": "string",
      "description": "Calendar cycle start (ISO 8601 date); undated topics are placed from here"
    },
    "cadenceDays": {
      "type": "number",
      "description": "Days between undated topics (default 7)"
    }
  },
  "required": [
    "topics"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Calendar rows, per-topic draft outcomes, and delegation coverage"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

#### `governed-publishing-cms-dispatcher`

**Name:** Governed Publishing & CMS Dispatcher

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
    "channel": {
      "type": "string",
      "description": "Publishing channel (blog, social, video, newsletter)"
    },
    "contentId": {
      "type": "string",
      "description": "Existing content identifier to update"
    },
    "title": {
      "type": "string",
      "description": "Content title (required)"
    },
    "content": {
      "type": "string",
      "description": "Content body (required)",
      "multiline": true
    },
    "excerpt": {
      "type": "string",
      "description": "Content excerpt"
    },
    "category": {
      "type": "string",
      "description": "Content category"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Content tags"
    },
    "slug": {
      "type": "string",
      "description": "URL slug; derived from the title when omitted"
    },
    "seoTitle": {
      "type": "string",
      "description": "SEO title"
    },
    "seoDescription": {
      "type": "string",
      "description": "SEO meta description"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without publishing; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval required for a live publish",
      "default": false
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Payload measurements, pre-flight checks, and the dispatch outcome"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/content/index.ts)

### CTO

> Category source: `services/tool-executor/src/data/skills/cto/index.ts`

#### `cto-infrastructure-query`

**Name:** Infrastructure Query

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
    "provider": {
      "type": "string",
      "enum": [
        "datadog",
        "aws",
        "gcp",
        "azure",
        "kubernetes",
        "service-mesh",
        "cost-optimization",
        "iac-monitoring",
        "database-operations",
        "team-metrics",
        "github-read"
      ],
      "description": "Infrastructure provider to query",
      "required": true
    },
    "query": {
      "type": "string",
      "description": "Query string or structured query object for the provider",
      "required": true
    },
    "options": {
      "type": "object",
      "properties": {},
      "description": "Additional provider-specific options",
      "additionalProperties": true
    }
  },
  "required": [
    "provider",
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
      "type": "boolean",
      "description": "Whether the query succeeded"
    },
    "provider": {
      "type": "string",
      "description": "Provider that was queried"
    },
    "query": {
      "type": "string",
      "description": "Original query"
    },
    "result": {
      "type": "object",
      "properties": {},
      "description": "Query result data",
      "additionalProperties": true
    },
    "error": {
      "type": "string",
      "description": "Error message if failed"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-engineering-actions`

**Name:** Engineering Actions

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating requests",
      "default": true
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": [
        "jira",
        "pagerduty",
        "github-write"
      ],
      "description": "External engineering system to act upon",
      "required": true
    },
    "action": {
      "type": "string",
      "description": "Specific action to perform (e.g., create-issue, acknowledge-incident, create-pr)",
      "required": true
    },
    "params": {
      "type": "object",
      "properties": {},
      "description": "Action-specific parameters",
      "additionalProperties": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the action without making changes",
      "default": true
    }
  },
  "required": [
    "provider",
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
      "description": "Whether the action succeeded"
    },
    "system": {
      "type": "string",
      "description": "System that was targeted"
    },
    "action": {
      "type": "string",
      "description": "Action that was performed"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string"
        },
        "method": {
          "type": "string"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "additionalProperties": true
        }
      },
      "description": "Request details"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number"
        },
        "data": {
          "type": "object",
          "properties": {},
          "additionalProperties": true
        }
      },
      "description": "Response from the external system"
    },
    "error": {
      "type": "string",
      "description": "Error message if failed"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-incident-disaster-readiness`

**Name:** Incident & Disaster Readiness

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
    "provider": {
      "type": "string",
      "enum": [
        "disaster-recovery"
      ],
      "description": "Disaster recovery provider to use",
      "required": true
    },
    "config": {
      "type": "object",
      "properties": {},
      "description": "Operation-specific configuration",
      "additionalProperties": true
    }
  },
  "required": [
    "provider",
    "config"
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
      "description": "Whether the operation succeeded"
    },
    "provider": {
      "type": "string",
      "description": "Provider that was used"
    },
    "config": {
      "type": "object",
      "properties": {},
      "description": "Configuration used",
      "additionalProperties": true
    },
    "result": {
      "type": "object",
      "properties": {},
      "description": "Operation result data",
      "additionalProperties": true
    },
    "error": {
      "type": "string",
      "description": "Error message if failed"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-architecture-advisory`

**Name:** Architecture & Tech Stack Advisory

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
      "description": "Name or description of the system being architected",
      "required": true
    },
    "requirements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of functional and non-functional requirements",
      "minItems": 1
    },
    "context": {
      "type": "object",
      "properties": {
        "teamSize": {
          "type": "integer",
          "description": "Number of engineers on the team"
        },
        "currentStack": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Currently used technologies"
        },
        "constraints": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Technical, budget, or organizational constraints"
        },
        "timeline": {
          "type": "string",
          "description": "Expected timeline for implementation"
        },
        "scale": {
          "type": "string",
          "description": "Expected scale (users, requests, data volume)"
        }
      },
      "description": "Additional context for the advisory",
      "additionalProperties": true
    }
  },
  "required": [
    "system",
    "requirements"
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
      "description": "Whether the advisory completed"
    },
    "system": {
      "type": "string",
      "description": "System that was analyzed"
    },
    "requirements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Requirements that were considered"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Context that was provided",
      "additionalProperties": true
    },
    "result": {
      "type": "object",
      "properties": {
        "recommendations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "category": {
                "type": "string"
              },
              "suggestion": {
                "type": "string"
              },
              "rationale": {
                "type": "string"
              },
              "priority": {
                "type": "string",
                "enum": [
                  "high",
                  "medium",
                  "low"
                ]
              },
              "effort": {
                "type": "string",
                "enum": [
                  "low",
                  "medium",
                  "high"
                ]
              }
            }
          }
        },
        "risks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "area": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "mitigation": {
                "type": "string"
              }
            }
          }
        },
        "decisions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "topic": {
                "type": "string"
              },
              "decision": {
                "type": "string"
              },
              "alternatives": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "description": "Structured advisory output",
      "additionalProperties": true
    },
    "error": {
      "type": "string",
      "description": "Error message if failed"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-architecture-tech-debt-evaluator`

**Name:** Architecture & Tech Debt Evaluator

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
    "systems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "System or service name"
          },
          "reliability": {
            "type": "number",
            "description": "Reliability score from 0 to 5"
          },
          "security": {
            "type": "number",
            "description": "Security posture score from 0 to 5"
          },
          "scalability": {
            "type": "number",
            "description": "Scalability score from 0 to 5"
          },
          "maintainability": {
            "type": "number",
            "description": "Maintainability score from 0 to 5"
          },
          "cost": {
            "type": "number",
            "description": "Cost pressure score from 0 to 5"
          }
        }
      },
      "description": "System health and trade-off inputs"
    },
    "requirements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Requirements to evaluate per system"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Additional context passed to underlying architecture advisory",
      "additionalProperties": true
    }
  },
  "required": [
    "systems"
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
      "description": "Whether evaluation completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Scored systems and prioritized roadmap"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-cloud-spend-infrastructure-optimizer`

**Name:** Cloud Spend & Infrastructure Optimizer

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
    "billingRows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "service": {
            "type": "string",
            "description": "Cloud service or account name"
          },
          "spend": {
            "type": "number",
            "description": "Billing amount for the period"
          },
          "utilization": {
            "type": "number",
            "description": "Average resource utilization from 0 to 1"
          }
        }
      },
      "description": "Cloud billing and utilization records"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Additional context for cost analysis",
      "additionalProperties": true
    }
  },
  "required": [
    "billingRows"
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
      "description": "Whether optimization completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Recommendations and savings estimate"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-incident-war-room-synthesizer`

**Name:** Incident War Room Synthesizer

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
    "signals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "Telemetry, log, alert, or deployment source"
          },
          "evidence": {
            "type": "string",
            "description": "Observed evidence"
          },
          "hypothesis": {
            "type": "string",
            "description": "Optional root-cause hypothesis"
          },
          "confidence": {
            "type": "number",
            "description": "Confidence from 0 to 1"
          }
        }
      },
      "description": "Incident signals to correlate"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Additional incident context",
      "additionalProperties": true
    }
  },
  "required": [
    "signals"
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
      "description": "Whether synthesis completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Hypotheses and mitigations"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-engineering-action-iac-drift-remediation`

**Name:** Engineering Action & IaC Drift Remediation

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Configured engineering or IaC remediation endpoint"
    },
    "token": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the remediation endpoint"
    }
  },
  "required": [
    "endpointUrl",
    "token"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Approved remediation payload"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without applying; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for live execution",
      "default": false
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether action completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Remote response when available"
    },
    "error": {
      "type": "string",
      "description": "Failure or governance message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  }
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-team-delivery-health-evaluator`

**Name:** Team Delivery Health Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "deploymentFrequencyThreshold": {
      "type": "number",
      "description": "Minimum acceptable deployment frequency (deployments per week)",
      "default": 1
    },
    "leadTimeThresholdDays": {
      "type": "number",
      "description": "Maximum acceptable lead time for changes in days",
      "default": 7
    },
    "changeFailureRateThreshold": {
      "type": "number",
      "description": "Maximum acceptable change failure rate as decimal (0.0-1.0)",
      "default": 0.15
    },
    "mttrThresholdHours": {
      "type": "number",
      "description": "Maximum acceptable time to restore service in hours",
      "default": 24
    }
  },
  "description": "DORA metric evaluation thresholds"
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "systems": {
      "type": "array",
      "items": {
        "type": "string",
        "description": "System or team name to evaluate"
      },
      "description": "Teams or systems to assess"
    },
    "period": {
      "type": "string",
      "enum": [
        "week",
        "month",
        "quarter"
      ],
      "description": "Evaluation period",
      "default": "month"
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
      "type": "boolean",
      "description": "Whether evaluation completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "additionalProperties": true,
      "description": "DORA assessment, team capacity, and sprint velocity"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

#### `cto-disaster-recovery-planner`

**Name:** Disaster Recovery Planner

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "rtoTargetMinutes": {
      "type": "integer",
      "description": "Recovery Time Objective target in minutes",
      "default": 60
    },
    "rpoTargetMinutes": {
      "type": "integer",
      "description": "Recovery Point Objective target in minutes",
      "default": 15
    },
    "failoverAuto": {
      "type": "boolean",
      "description": "Allow automated failover during DR testing",
      "default": false
    },
    "includeTeams": {
      "type": "boolean",
      "description": "Include team notification in DR readiness assessment",
      "default": true
    }
  },
  "description": "Disaster recovery RTO/RPO targets and configuration"
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "systems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "System or service name"
          },
          "rto": {
            "type": "number",
            "description": "Current RTO in minutes"
          },
          "rpo": {
            "type": "number",
            "description": "Current RPO in minutes"
          },
          "backupVerified": {
            "type": "boolean",
            "description": "Whether backups are verified"
          },
          "lastTested": {
            "type": "string",
            "description": "Last DR test date"
          }
        }
      },
      "description": "Systems to assess for disaster recovery"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Additional incident context",
      "additionalProperties": true
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
      "type": "boolean",
      "description": "Whether readiness check completed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "additionalProperties": true,
      "description": "DR readiness assessment"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          },
          "body": {
            "type": "string"
          }
        }
      },
      "description": "Pre-formatted user-facing output blocks"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/cto/index.ts)

### Education

> Category source: `services/tool-executor/src/data/skills/education/index.ts`

#### `education-lesson-assessment-drafting`

**Name:** Lesson & Assessment Drafting

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
    "task": {
      "type": "string",
      "enum": [
        "lesson-plan",
        "quiz",
        "activity",
        "content",
        "multimedia"
      ],
      "description": "What to draft"
    },
    "subject": {
      "type": "string",
      "description": "Subject area (e.g., Mathematics, Science, ELA, History)"
    },
    "grade": {
      "type": "string",
      "description": "Grade level (e.g., \"5\", \"9-10\", \"11-12\")"
    },
    "topic": {
      "type": "string",
      "description": "Specific topic or unit"
    },
    "duration": {
      "type": "number",
      "description": "Lesson duration in minutes",
      "default": 60
    },
    "standards": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Curriculum standards codes (e.g., CCSS.MATH.CONTENT.5.NF.A.1)"
    },
    "objectives": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Learning objectives (will generate from Bloom's if empty)"
    },
    "learnerProfile": {
      "type": "object",
      "description": "Learner context: reading level, interests, accommodations, prior knowledge"
    },
    "quizType": {
      "type": "string",
      "enum": [
        "multiple-choice",
        "mixed",
        "formative",
        "summative"
      ],
      "description": "Quiz format",
      "default": "mixed"
    },
    "questionCount": {
      "type": "number",
      "description": "Number of questions",
      "default": 10
    },
    "difficulty": {
      "type": "string",
      "enum": [
        "easy",
        "medium",
        "hard",
        "mixed"
      ],
      "description": "Difficulty level",
      "default": "medium"
    },
    "activityType": {
      "type": "string",
      "enum": [
        "discussion",
        "group-work",
        "lab",
        "project-based",
        "game",
        "simulation",
        "writing",
        "digital-creation"
      ],
      "description": "Activity type",
      "default": "discussion"
    },
    "multimedia": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Multimedia elements to integrate: video, simulation, audio, interactive, vr-ar"
    },
    "contentFormat": {
      "type": "string",
      "enum": [
        "handout",
        "slide-deck",
        "worksheet",
        "study-guide",
        "anchor-chart"
      ],
      "description": "Content format",
      "default": "handout"
    }
  },
  "required": [
    "task",
    "subject",
    "topic"
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
      "description": "Whether the draft was generated and stored"
    },
    "data": {
      "type": "object",
      "description": "Generated lesson, assessment, activity, content, or multimedia draft"
    },
    "error": {
      "type": "string",
      "description": "Validation or generation error when unsuccessful"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-learner-insight`

**Name:** Learner Insight

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "LMS/analytics platform base URL"
    },
    "token": {
      "type": "string",
      "description": "LMS bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "canvas",
        "google-classroom",
        "schoology",
        "brightspace",
        "powerschool",
        "infinite-campus",
        "custom"
      ],
      "description": "LMS provider"
    },
    "defaultCourseId": {
      "type": "string",
      "description": "Default course context"
    },
    "dataSources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Enabled data sources: assignments, grades, attendance, discussions, logins, assessments"
    },
    "analyticsTypes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "enum": [
        "learning-styles",
        "performance",
        "progress",
        "motivation",
        "engagement",
        "at-risk"
      ],
      "description": "Analytics modules enabled"
    },
    "gradebookMapping": {
      "type": "object",
      "description": "Gradebook category mapping"
    }
  },
  "required": [
    "baseUrl",
    "token",
    "provider"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "learner": {
      "type": "string",
      "description": "Select learner"
    },
    "courseId": {
      "type": "string",
      "description": "Course identifier"
    },
    "dateRange": {
      "type": "object",
      "description": "Analysis period"
    },
    "includeComparisons": {
      "type": "boolean",
      "description": "Include class/cohort comparisons",
      "default": true
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Specific metrics to analyze"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing"
    }
  },
  "required": [
    "learner"
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
    "status": {
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
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-adaptive-personalization`

**Name:** Adaptive Personalization Advisory

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
    "learner": {
      "type": "string",
      "description": "Select learner"
    },
    "insightData": {
      "type": "object",
      "description": "Output from Learner Insight skill: learningStyle, performanceLevel, progressRate, motivationLevel, engagementScore, riskFlags"
    },
    "courseContext": {
      "type": "object",
      "description": "Course info: subject, grade, current unit, upcoming assessments"
    },
    "teacherGoals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Teacher priorities for this learner"
    }
  },
  "required": [
    "learner"
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
      "description": "Whether personalized recommendations were generated and stored"
    },
    "data": {
      "type": "object",
      "description": "Tiered pacing, content, process, product, and engagement adaptations"
    },
    "error": {
      "type": "string",
      "description": "Validation or adaptation error when unsuccessful"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

#### `education-resource-library`

**Name:** Resource Library Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Resource repository base URL"
    },
    "token": {
      "type": "string",
      "description": "Repository bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "google-drive",
        "sharepoint",
        "canvas-commons",
        "oer-commons",
        "custom"
      ],
      "description": "Repository provider"
    },
    "defaultFolder": {
      "type": "string",
      "description": "Default folder/path"
    },
    "taxonomy": {
      "type": "object",
      "description": "Tagging taxonomy: subjects, grades, standards, types, topics"
    },
    "accessibilityStandards": {
      "type": "string",
      "enum": [
        "WCAG-2.1-AA",
        "Section-508",
        "custom"
      ],
      "description": "Accessibility standard to enforce"
    },
    "allowedTypes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Allowed file types"
    },
    "maxFileSizeMb": {
      "type": "number",
      "description": "Max file size in MB"
    },
    "versioning": {
      "type": "boolean",
      "description": "Enable version control",
      "default": true
    }
  },
  "required": [
    "baseUrl",
    "token",
    "provider"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resourceId": {
      "type": "string",
      "description": "Resource identifier"
    },
    "file": {
      "type": "object",
      "description": "File metadata for upload: name, mimeType, content (base64), size"
    },
    "folder": {
      "type": "string",
      "description": "Target folder/path"
    },
    "tags": {
      "type": "object",
      "description": "Tags: subject, grade, standard, type, topic, language, license"
    },
    "query": {
      "type": "string",
      "description": "Search query"
    },
    "filters": {
      "type": "object",
      "description": "Search filters"
    },
    "accessibilityStandard": {
      "type": "string",
      "enum": [
        "WCAG-2.1-AA",
        "Section-508",
        "custom"
      ],
      "description": "Accessibility standard for check"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing"
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
    "status": {
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
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/education/index.ts)

### Executive

> Category source: `services/tool-executor/src/data/skills/executive/index.ts`

#### `executive-leadership-advisory`

**Name:** Leadership Advisory

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "focusArea": {
      "type": "string",
      "enum": [
        "coaching",
        "decision-framework",
        "leadership-assessment",
        "eq-assessment",
        "presence-analyzer",
        "communication-analyzer",
        "communication-coach"
      ],
      "description": "Leadership advisory area",
      "required": true,
      "title": "Focus Area",
      "order": 1,
      "hint": "Leadership advisory area"
    },
    "executiveId": {
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 2,
      "hint": "Executive identifier"
    },
    "role": {
      "type": "string",
      "description": "Current role",
      "title": "Role",
      "order": 3,
      "hint": "Current role"
    },
    "level": {
      "type": "string",
      "description": "Seniority level",
      "title": "Level",
      "order": 4,
      "hint": "Seniority level"
    },
    "context": {
      "type": "string",
      "description": "Additional context",
      "title": "Context",
      "order": 5,
      "hint": "Additional context"
    },
    "strengths": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Known strengths",
      "title": "Strengths",
      "order": 6,
      "hint": "Known strengths"
    },
    "gaps": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Known development gaps",
      "title": "Gaps",
      "order": 7,
      "hint": "Known development gaps"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Goals",
      "title": "Goals",
      "order": 8,
      "hint": "Goals"
    },
    "decision": {
      "type": "string",
      "description": "Decision to analyze",
      "title": "Decision",
      "order": 9,
      "hint": "Decision to analyze"
    },
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string"
          },
          "description": {
            "type": "string"
          }
        }
      },
      "description": "Options to evaluate",
      "title": "Options",
      "order": 10,
      "hint": "Options to evaluate"
    },
    "criteria": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Decision criteria",
      "title": "Criteria",
      "order": 11,
      "hint": "Decision criteria"
    },
    "competencies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Competencies to assess",
      "title": "Competencies",
      "order": 12,
      "hint": "Competencies to assess"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dimensions to evaluate",
      "title": "Dimensions",
      "order": 13,
      "hint": "Dimensions to evaluate"
    },
    "text": {
      "type": "string",
      "description": "Text to analyze",
      "multiline": true,
      "title": "Text",
      "order": 14,
      "hint": "Text to analyze"
    },
    "transcript": {
      "type": "string",
      "description": "Transcript",
      "multiline": true,
      "title": "Transcript",
      "order": 15,
      "hint": "Transcript"
    },
    "message": {
      "type": "string",
      "description": "Message to coach",
      "multiline": true,
      "title": "Message",
      "order": 16,
      "hint": "Message to coach"
    },
    "draft": {
      "type": "string",
      "description": "Draft message",
      "multiline": true,
      "title": "Draft",
      "order": 17,
      "hint": "Draft message"
    },
    "channel": {
      "type": "string",
      "description": "Communication channel",
      "title": "Channel",
      "order": 18,
      "hint": "Communication channel"
    },
    "audience": {
      "type": "string",
      "description": "Target audience",
      "title": "Audience",
      "order": 19,
      "hint": "Target audience"
    },
    "sessions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "topic": {
            "type": "string"
          },
          "description": {
            "type": "string"
          }
        }
      },
      "description": "Session data",
      "title": "Sessions",
      "order": 20,
      "hint": "Session data"
    },
    "topics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Coaching topics",
      "title": "Topics",
      "order": 21,
      "hint": "Coaching topics"
    },
    "sessionCount": {
      "type": "integer",
      "description": "Number of coaching sessions",
      "title": "Session Count",
      "order": 22,
      "hint": "Number of coaching sessions"
    }
  },
  "required": [
    "focusArea"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Leadership advisory results derived from supplied context and inputs"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-dev-career`

**Name:** Development & Career Planning

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "focusArea": {
      "type": "string",
      "enum": [
        "skill-gap",
        "development-plan",
        "improvement-plan",
        "career-planner",
        "career-roadmap",
        "resource-recommender"
      ],
      "description": "Development and career area",
      "required": true,
      "title": "Focus Area",
      "order": 1,
      "hint": "Development and career area"
    },
    "executiveId": {
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 2,
      "hint": "Executive identifier"
    },
    "role": {
      "type": "string",
      "description": "Current role",
      "title": "Role",
      "order": 3,
      "hint": "Current role"
    },
    "level": {
      "type": "string",
      "description": "Seniority level",
      "title": "Level",
      "order": 4,
      "hint": "Seniority level"
    },
    "timeframe": {
      "type": "string",
      "description": "Planning timeframe",
      "title": "Timeframe",
      "order": 5,
      "hint": "Planning timeframe"
    },
    "currentSkills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Current skills",
      "title": "Current Skills",
      "order": 6,
      "hint": "Current skills"
    },
    "targetSkills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Target skills",
      "title": "Target Skills",
      "order": 7,
      "hint": "Target skills"
    },
    "interests": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Career interests",
      "title": "Interests",
      "order": 8,
      "hint": "Career interests"
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Constraints",
      "title": "Constraints",
      "order": 9,
      "hint": "Constraints"
    },
    "skills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Skills to plan for",
      "title": "Skills",
      "order": 10,
      "hint": "Skills to plan for"
    },
    "areas": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Areas to improve",
      "title": "Areas",
      "order": 11,
      "hint": "Areas to improve"
    },
    "targetRoles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Target roles",
      "title": "Target Roles",
      "order": 12,
      "hint": "Target roles"
    },
    "targetRole": {
      "type": "string",
      "description": "Target role",
      "title": "Target Role",
      "order": 13,
      "hint": "Target role"
    },
    "milestones": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Career milestones",
      "title": "Milestones",
      "order": 14,
      "hint": "Career milestones"
    }
  },
  "required": [
    "focusArea"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Development or career planning results derived from supplied profile and goals"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-feedback`

**Name:** Feedback Collection & Analysis

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "focusArea": {
      "type": "string",
      "enum": [
        "feedback-collector",
        "feedback-analysis",
        "performance-analyzer"
      ],
      "description": "Feedback area",
      "required": true,
      "title": "Focus Area",
      "order": 1,
      "hint": "Feedback area"
    },
    "executiveId": {
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 2,
      "hint": "Executive identifier"
    },
    "period": {
      "type": "string",
      "description": "Review period",
      "title": "Period",
      "order": 3,
      "hint": "Review period"
    },
    "respondents": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Respondent identifiers",
      "title": "Respondents",
      "order": 4,
      "hint": "Respondent identifiers"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Assessment dimensions",
      "title": "Dimensions",
      "order": 5,
      "hint": "Assessment dimensions"
    },
    "questions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Survey questions",
      "title": "Questions",
      "order": 6,
      "hint": "Survey questions"
    },
    "feedback": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string"
          },
          "author": {
            "type": "string"
          },
          "date": {
            "type": "string"
          }
        }
      },
      "description": "Feedback entries",
      "title": "Feedback",
      "order": 7,
      "hint": "Feedback entries"
    },
    "themes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Feedback themes",
      "title": "Themes",
      "order": 8,
      "hint": "Feedback themes"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Performance metrics",
      "title": "Metrics",
      "order": 9,
      "hint": "Performance metrics"
    },
    "kpis": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Key performance indicators",
      "title": "Kpis",
      "order": 10,
      "hint": "Key performance indicators"
    },
    "benchmark": {
      "type": "string",
      "description": "Benchmark",
      "title": "Benchmark",
      "order": 11,
      "hint": "Benchmark"
    }
  },
  "required": [
    "focusArea"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Feedback collection plan, analysis results, or performance metrics with derived themes"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-risk-scenario`

**Name:** Risk & Scenario Advisory

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "focusArea": {
      "type": "string",
      "enum": [
        "risk-assessment",
        "scenario-modeler"
      ],
      "description": "Risk and scenario area",
      "required": true,
      "title": "Focus Area",
      "order": 1,
      "hint": "Risk and scenario area"
    },
    "executiveId": {
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 2,
      "hint": "Executive identifier"
    },
    "domain": {
      "type": "string",
      "description": "Risk domain",
      "title": "Domain",
      "order": 3,
      "hint": "Risk domain"
    },
    "timeframe": {
      "type": "string",
      "description": "Assessment timeframe",
      "title": "Timeframe",
      "order": 4,
      "hint": "Assessment timeframe"
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Constraints",
      "title": "Constraints",
      "order": 5,
      "hint": "Constraints"
    },
    "objectives": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Objectives",
      "title": "Objectives",
      "order": 6,
      "hint": "Objectives"
    },
    "risks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "domain": {
            "type": "string"
          },
          "likelihood": {
            "type": "string",
            "enum": [
              "low",
              "medium",
              "high",
              "critical"
            ]
          },
          "impact": {
            "type": "string",
            "enum": [
              "low",
              "medium",
              "high",
              "critical"
            ]
          },
          "mitigation": {
            "type": "string"
          },
          "owner": {
            "type": "string"
          }
        }
      },
      "description": "Identified risks",
      "title": "Risks",
      "order": 7,
      "hint": "Identified risks"
    },
    "domains": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Risk domains",
      "title": "Domains",
      "order": 8,
      "hint": "Risk domains"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "assumptions": {
            "type": "object",
            "properties": {},
            "additionalProperties": true
          },
          "probability": {
            "type": "number"
          },
          "impact": {
            "type": "object",
            "properties": {},
            "additionalProperties": true
          },
          "projectedOutcome": {
            "type": "object",
            "properties": {},
            "additionalProperties": true
          },
          "sensitivity": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "response": {
            "type": "string"
          }
        }
      },
      "description": "Scenarios to model",
      "title": "Scenarios",
      "order": 9,
      "hint": "Scenarios to model"
    },
    "baseMetrics": {
      "type": "object",
      "properties": {},
      "description": "Baseline metrics",
      "additionalProperties": true,
      "title": "Base Metrics",
      "order": 10,
      "hint": "Baseline metrics"
    }
  },
  "required": [
    "focusArea"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Risk assessment or scenario modeling results with derived scores and projections"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-speech-communication-copilot`

**Name:** Speech & Communication Co-Pilot

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "occasion": {
      "type": "string",
      "description": "Event or occasion (e.g., \"Annual All-Hands\", \"Board Meeting Q3\", \"Crisis Response\")",
      "title": "Occasion",
      "order": 1,
      "hint": "Event or occasion (e.g., \"Annual All-Hands\", \"Board Meeting Q3\", \"Crisis Response\")"
    },
    "audience": {
      "type": "string",
      "description": "Target audience (e.g., \"All employees\", \"Board of Directors\", \"Investors\", \"Customers\")",
      "title": "Audience",
      "order": 2,
      "hint": "Target audience (e.g., \"All employees\", \"Board of Directors\", \"Investors\", \"Customers\")"
    },
    "keyMessages": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Core messages to convey (3-5 max)",
      "title": "Key Messages",
      "order": 3,
      "hint": "Core messages to convey (3-5 max)"
    },
    "tone": {
      "type": "string",
      "enum": [
        "executive",
        "inspirational",
        "authoritative",
        "conversational",
        "empathetic-authoritative",
        "visionary"
      ],
      "description": "Communication tone",
      "default": "executive",
      "title": "Tone",
      "order": 4,
      "hint": "Communication tone"
    },
    "length": {
      "type": "string",
      "enum": [
        "short",
        "medium",
        "long"
      ],
      "description": "Target length",
      "default": "medium",
      "title": "Length",
      "order": 5,
      "hint": "Target length"
    },
    "format": {
      "type": "string",
      "enum": [
        "speech",
        "board-comm",
        "stakeholder-message",
        "crisis-statement"
      ],
      "description": "Communication format",
      "default": "speech",
      "title": "Format",
      "order": 6,
      "hint": "Communication format"
    },
    "executiveId": {
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 7,
      "hint": "Executive identifier"
    },
    "context": {
      "type": "string",
      "description": "Additional context, background, or constraints",
      "multiline": true,
      "title": "Context",
      "order": 8,
      "hint": "Additional context, background, or constraints"
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Legal, compliance, or stylistic constraints",
      "title": "Constraints",
      "order": 9,
      "hint": "Legal, compliance, or stylistic constraints"
    },
    "subject": {
      "type": "string",
      "description": "Subject line (for board/stakeholder formats)",
      "title": "Subject",
      "order": 10,
      "hint": "Subject line (for board/stakeholder formats)"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "slack",
        "letter",
        "video-script",
        "linkedin"
      ],
      "description": "Delivery channel (for stakeholder-message)",
      "title": "Channel",
      "order": 11,
      "hint": "Delivery channel (for stakeholder-message)"
    },
    "priority": {
      "type": "string",
      "enum": [
        "standard",
        "urgent",
        "confidential"
      ],
      "description": "Priority level (for board-comm)",
      "title": "Priority",
      "order": 12,
      "hint": "Priority level (for board-comm)"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "immediate",
        "within-hour",
        "today",
        "this-week"
      ],
      "description": "Urgency level (for crisis-statement)",
      "title": "Urgency",
      "order": 13,
      "hint": "Urgency level (for crisis-statement)"
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Speech and communication drafts with structure and messaging guidance"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

#### `executive-time-strategic-focus-proxy`

**Name:** Time & Strategic Focus Proxy

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "executiveHome": {
      "type": "string",
      "description": "Executive workspace path; defaults to EXECUTIVE_HOME",
      "title": "Executive Home",
      "order": 1,
      "hint": "Executive workspace path; defaults to EXECUTIVE_HOME"
    },
    "defaultFocusBufferMinutes": {
      "type": "integer",
      "description": "Default buffer in minutes around protected focus blocks",
      "title": "Default Focus Buffer Minutes",
      "order": 2,
      "hint": "Default buffer in minutes around protected focus blocks"
    },
    "defaultConflictWindowHours": {
      "type": "integer",
      "description": "Default lookahead window in hours for conflict detection",
      "title": "Default Conflict Window Hours",
      "order": 3,
      "hint": "Default lookahead window in hours for conflict detection"
    },
    "defaultDelegateRoles": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default roles eligible for meeting delegation",
      "title": "Default Delegate Roles",
      "order": 4,
      "hint": "Default roles eligible for meeting delegation"
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
      "type": "string",
      "description": "Executive identifier",
      "title": "Executive Id",
      "order": 1,
      "hint": "Executive identifier"
    },
    "action": {
      "type": "string",
      "enum": [
        "analyze",
        "protect-focus",
        "resolve-conflict",
        "delegate",
        "optimize"
      ],
      "description": "Strategic focus action to perform",
      "required": true,
      "title": "Action",
      "order": 2,
      "hint": "Strategic focus action to perform"
    },
    "calendarData": {
      "type": "string",
      "description": "Calendar data (JSON string or object)",
      "multiline": true,
      "title": "Calendar Data",
      "order": 3,
      "hint": "Calendar data (JSON string or object)"
    },
    "focusBlocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string"
          },
          "start": {
            "type": "string"
          },
          "end": {
            "type": "string"
          },
          "priority": {
            "type": "string"
          },
          "bufferMinutes": {
            "type": "integer"
          }
        }
      },
      "description": "Declared focus blocks",
      "title": "Focus Blocks",
      "order": 4,
      "hint": "Declared focus blocks"
    },
    "conflictResolutionRules": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Rules for resolving calendar conflicts in priority order",
      "title": "Conflict Resolution Rules",
      "order": 5,
      "hint": "Rules for resolving calendar conflicts in priority order"
    },
    "delegationRules": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Rules for delegating meetings to chief of staff",
      "title": "Delegation Rules",
      "order": 6,
      "hint": "Rules for delegating meetings to chief of staff"
    },
    "proposedFocusBlocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string"
          },
          "start": {
            "type": "string"
          },
          "end": {
            "type": "string"
          },
          "priority": {
            "type": "string"
          },
          "bufferMinutes": {
            "type": "integer"
          }
        }
      },
      "description": "Proposed focus blocks to protect",
      "title": "Proposed Focus Blocks",
      "order": 7,
      "hint": "Proposed focus blocks to protect"
    },
    "conflictId": {
      "type": "string",
      "description": "Identifier for a specific calendar conflict to resolve",
      "title": "Conflict Id",
      "order": 8,
      "hint": "Identifier for a specific calendar conflict to resolve"
    },
    "meetingId": {
      "type": "string",
      "description": "Identifier for a meeting to delegate or resolve",
      "title": "Meeting Id",
      "order": 9,
      "hint": "Identifier for a meeting to delegate or resolve"
    },
    "timeRange": {
      "type": "string",
      "description": "Time range for analysis or optimization (e.g. 24 hours, week)",
      "title": "Time Range",
      "order": 10,
      "hint": "Time range for analysis or optimization (e.g. 24 hours, week)"
    },
    "chiefOfStaffContact": {
      "type": "string",
      "description": "Chief of staff contact information for delegation",
      "title": "Chief Of Staff Contact",
      "order": 11,
      "hint": "Chief of staff contact information for delegation"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Calendar analysis, focus protection plan, conflict resolution, delegation plan, or optimization results derived from supplied inputs"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/executive/index.ts)

### Finance

> Category source: `services/tool-executor/src/data/skills/finance/index.ts`

#### `finance-modeling-analysis`

**Name:** Finance Modeling & Analysis

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
      "type": "number",
      "description": "Starting annual revenue",
      "minimum": 0
    },
    "costs": {
      "type": "number",
      "description": "Starting annual costs",
      "minimum": 0
    },
    "periods": {
      "type": "integer",
      "description": "Number of projection periods (years)",
      "minimum": 1,
      "maximum": 20,
      "default": 5
    },
    "growthRate": {
      "type": "number",
      "description": "Annual revenue growth rate (%)",
      "default": 5
    },
    "costGrowthRate": {
      "type": "number",
      "description": "Annual cost growth rate (%)",
      "default": 3
    },
    "taxRate": {
      "type": "number",
      "description": "Corporate tax rate (%)",
      "minimum": 0,
      "maximum": 100,
      "default": 21
    },
    "discountRate": {
      "type": "number",
      "description": "Discount rate for NPV (%)",
      "minimum": 0,
      "maximum": 50,
      "default": 10
    },
    "capexSchedule": {
      "type": "array",
      "items": {
        "type": "number",
        "description": "Capital expenditure per period"
      },
      "description": "Array of capex per period (optional)",
      "default": []
    },
    "workingCapitalPct": {
      "type": "number",
      "description": "Working capital as % of revenue change",
      "minimum": 0,
      "maximum": 50,
      "default": 10
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Model refresh: per-period projections (revenue, costs, margins, EBIT, NOPAT, capex, working capital, free cash flow), a summary block (NPV, IRR, payback period, total revenue, total costs, total FCF, average margins, ROIC), and base/bull/bear sensitivity results"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `risk-regulatory-advisory`

**Name:** Risk & Regulatory Advisory

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "format": "uri",
      "description": "Base URL for the risk assessment service"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for the risk assessment service"
    },
    "provider": {
      "type": "string",
      "description": "Provider identifier (e.g., bloomberg, refinitiv, custom)"
    }
  },
  "required": [
    "baseUrl",
    "apiKey",
    "provider"
  ]
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entityId": {
      "type": "string",
      "description": "Entity or organization identifier"
    },
    "portfolio": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "asset": {
            "type": "string",
            "description": "Asset identifier"
          },
          "value": {
            "type": "number",
            "description": "Position value",
            "minimum": 0
          },
          "weight": {
            "type": "number",
            "description": "Portfolio weight (0-1)",
            "minimum": 0,
            "maximum": 1
          }
        }
      },
      "description": "Portfolio holdings for risk analysis"
    },
    "riskMetrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Risk metrics to compute (var, es, cva, market, credit, operational)"
    },
    "confidenceLevel": {
      "type": "number",
      "description": "Confidence level for VaR/ES (0-1)",
      "minimum": 0,
      "maximum": 1,
      "default": 0.95
    },
    "timeHorizon": {
      "type": "integer",
      "description": "Time horizon in days",
      "minimum": 1,
      "default": 252
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Risk and regulatory assessment: VaR/expected shortfall, CVA, market/credit/operational risk breakdown, an overall risk score and classification, concentration indicators, and stress-test scenario results"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `budget-tracking`

**Name:** Budget Tracking

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Accounting ERP endpoint URL; may also be supplied at runtime through FINANCE_ERP_ENDPOINT"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "API key for the accounting ERP endpoint"
    },
    "system": {
      "type": "string",
      "enum": [
        "netsuite",
        "quickbooks",
        "xero",
        "custom"
      ],
      "description": "Accounting system the budget ledger belongs to"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before a live budget-ledger write",
      "default": true
    },
    "defaultDryRun": {
      "type": "boolean",
      "description": "Default budget tracking to dry-run",
      "default": true
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "string",
      "description": "Entity or cost center the budget belongs to"
    },
    "period": {
      "type": "string",
      "description": "Reporting period the budget covers (e.g. 2026-Q3)"
    },
    "budget": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "description": "Budget category or account"
          },
          "budgeted": {
            "type": "number",
            "description": "Budgeted amount for the period"
          }
        }
      },
      "description": "Budget lines to compare against actuals"
    },
    "actuals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "description": "Budget category or account"
          },
          "amount": {
            "type": "number",
            "description": "Actual amount recorded for the period"
          }
        }
      },
      "description": "Actual amounts by category"
    },
    "periodsElapsed": {
      "type": "number",
      "description": "Periods elapsed so far, used for run-rate forecasting",
      "minimum": 0
    },
    "periodsTotal": {
      "type": "number",
      "description": "Total periods in the budget period, used for run-rate forecasting",
      "minimum": 1
    },
    "varianceDirection": {
      "type": "string",
      "enum": [
        "unfavorable-up",
        "favorable-up"
      ],
      "description": "Whether exceeding a category counts as over budget (costs) or under budget (revenue)",
      "default": "unfavorable-up"
    },
    "tolerancePct": {
      "type": "number",
      "description": "Absolute variance tolerated before a category is flagged",
      "minimum": 0,
      "maximum": 1,
      "default": 0.05
    },
    "system": {
      "type": "string",
      "enum": [
        "netsuite",
        "quickbooks",
        "xero",
        "custom"
      ],
      "description": "Accounting system the budget ledger belongs to"
    },
    "endpoint": {
      "type": "string",
      "format": "uri",
      "description": "Budget ledger endpoint override for this call"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional API key override for the budget ledger endpoint"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Stage the analysis without writing it; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live budget-ledger write; required when dryRun is false",
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Budget-vs-actual analysis: per-category budget, actual, variance and status; a summary block with totals, consumed percentage and run-rate forecast at completion; the out-of-tolerance categories; and whether anything was actually written to the budget ledger"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

#### `reporting-data-ops`

**Name:** Reporting & Data Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Reporting endpoint URL; may also be supplied at runtime through FINANCE_REPORTING_ENDPOINT"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "API key for the reporting endpoint"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "portal",
        "api",
        "file"
      ],
      "description": "Default delivery channel for published reports"
    },
    "system": {
      "type": "string",
      "enum": [
        "netsuite",
        "quickbooks",
        "xero",
        "custom"
      ],
      "description": "Reporting store the report is written to"
    },
    "defaultReportType": {
      "type": "string",
      "enum": [
        "profit-and-loss",
        "balance-sheet",
        "cash-flow",
        "budget-variance",
        "management-summary"
      ],
      "description": "Default report type for scheduled runs"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before publishing a report",
      "default": true
    },
    "defaultDryRun": {
      "type": "boolean",
      "description": "Default reporting to dry-run",
      "default": true
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
        "profit-and-loss",
        "balance-sheet",
        "cash-flow",
        "budget-variance",
        "management-summary"
      ],
      "description": "Type of financial report to produce",
      "default": "profit-and-loss"
    },
    "dataRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start of the reporting range (ISO 8601 date)"
        },
        "end": {
          "type": "string",
          "description": "End of the reporting range (ISO 8601 date)"
        },
        "label": {
          "type": "string",
          "description": "Human-readable range label (e.g. 2026-Q3)"
        }
      },
      "description": "Reporting range the report covers"
    },
    "entity": {
      "type": "string",
      "description": "Entity the report covers"
    },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "section": {
            "type": "string",
            "description": "Section the line belongs to (revenue, cost, other)"
          },
          "label": {
            "type": "string",
            "description": "Line item label"
          },
          "amount": {
            "type": "number",
            "description": "Amount for the line"
          }
        }
      },
      "description": "Ledger lines the report totals are derived from"
    },
    "statedRevenue": {
      "type": "number",
      "description": "Stated revenue total, cross-checked against the sum of the lines"
    },
    "statedExpense": {
      "type": "number",
      "description": "Stated expense total, cross-checked against the sum of the lines"
    },
    "basis": {
      "type": "string",
      "enum": [
        "accrual",
        "cash"
      ],
      "description": "Accounting basis for the report",
      "default": "accrual"
    },
    "currency": {
      "type": "string",
      "description": "Reporting currency",
      "default": "USD"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "portal",
        "api",
        "file"
      ],
      "description": "Channel the report is published through"
    },
    "system": {
      "type": "string",
      "enum": [
        "netsuite",
        "quickbooks",
        "xero",
        "custom"
      ],
      "description": "Reporting store the report is written to"
    },
    "recipients": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Recipients of the published report"
    },
    "format": {
      "type": "string",
      "enum": [
        "markdown",
        "json",
        "csv"
      ],
      "description": "Published report format",
      "default": "markdown"
    },
    "endpoint": {
      "type": "string",
      "format": "uri",
      "description": "Reporting endpoint override for this call"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional API key override for the reporting endpoint"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Assemble the report without publishing it; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live report publish; required when dryRun is false",
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, or confirmation-required"
    },
    "data": {
      "type": "object",
      "description": "Assembled financial report: section totals, revenue/expense/net summary with net margin, the reporting range and basis, data-quality cross-checks against any stated totals, and whether anything was actually published"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/finance/index.ts)

### Healthcare

> Category source: `services/tool-executor/src/data/skills/healthcare/index.ts`

#### `healthcare-clinical-decision-support`

**Name:** Clinical Decision Support

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
      },
      "description": "List of patient symptoms (free text)"
    },
    "duration": {
      "type": "string",
      "description": "Duration of symptoms (e.g., 3 days, 2 weeks)"
    },
    "patient": {
      "type": "string",
      "description": "Select patient"
    },
    "clinicalContext": {
      "type": "string",
      "description": "Relevant clinical context, including chief complaint and history of present illness"
    },
    "patientHistory": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Relevant patient medical history items"
    },
    "medications": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Current medications (names/doses)"
    },
    "allergies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Known patient allergies"
    },
    "vitalSigns": {
      "type": "object",
      "properties": {
        "bloodPressureSystolic": {
          "type": "integer",
          "description": "Systolic blood pressure in mmHg"
        },
        "bloodPressureDiastolic": {
          "type": "integer",
          "description": "Diastolic blood pressure in mmHg"
        },
        "heartRate": {
          "type": "integer",
          "description": "Heart rate in BPM"
        },
        "temperature": {
          "type": "number",
          "description": "Body temperature in Celsius"
        },
        "respiratoryRate": {
          "type": "integer",
          "description": "Respiratory rate per minute"
        },
        "oxygenSaturation": {
          "type": "number",
          "description": "Oxygen saturation percentage"
        }
      },
      "description": "Current vital signs"
    },
    "riskFactors": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Patient risk factors (e.g., smoking, family history, diabetes)"
    },
    "reasoningDepth": {
      "type": "string",
      "enum": [
        "brief",
        "standard",
        "comprehensive"
      ],
      "description": "Depth of clinical reasoning to perform"
    },
    "includeDifferential": {
      "type": "boolean",
      "description": "Whether to include differential diagnosis suggestions",
      "default": true
    },
    "includeRiskScore": {
      "type": "boolean",
      "description": "Whether to include risk stratification scoring",
      "default": true
    }
  },
  "required": [
    "symptoms"
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
    "data": {
      "type": "object",
      "properties": {
        "decision": {
          "type": "object"
        },
        "storePath": {
          "type": "string"
        },
        "warning": {
          "type": "string"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-records-scheduling-ops`

**Name:** Records & Scheduling Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Healthcare operations system base URL"
    },
    "token": {
      "type": "string",
      "description": "Healthcare operations system bearer token"
    },
    "provider": {
      "type": "string",
      "enum": [
        "epic",
        "cerner",
        "allscripts",
        "athenahealth",
        "custom"
      ],
      "description": "System provider"
    },
    "defaultFacility": {
      "type": "string",
      "description": "Default facility identifier"
    },
    "defaultTimezone": {
      "type": "string",
      "description": "Default timezone for scheduling operations"
    },
    "maxPageSize": {
      "type": "number",
      "description": "Maximum page size for list/search results",
      "default": 50
    },
    "auditLogging": {
      "type": "boolean",
      "description": "Enable audit logging for all operations",
      "default": true
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
    "patient": {
      "type": "string",
      "description": "Select patient"
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
      ],
      "description": "Type of medical record"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Record data for create/update operations"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags to apply or search for"
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
      ],
      "description": "Type of tag"
    },
    "query": {
      "type": "string",
      "description": "Search query string"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Search and filter criteria"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date"
        },
        "end": {
          "type": "string",
          "description": "End date"
        }
      },
      "description": "Date range for filtering"
    },
    "appointmentType": {
      "type": "string",
      "description": "Type of appointment"
    },
    "provider": {
      "type": "string",
      "description": "Provider identifier"
    },
    "facility": {
      "type": "string",
      "description": "Facility identifier"
    },
    "startTime": {
      "type": "string",
      "description": "Appointment start time"
    },
    "endTime": {
      "type": "string",
      "description": "Appointment end time"
    },
    "optimizationMode": {
      "type": "string",
      "enum": [
        "utilization",
        "continuity",
        "access",
        "balanced"
      ],
      "description": "Schedule optimization objective"
    },
    "providers": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Provider identifiers for optimization"
    },
    "facilities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Facility identifiers for optimization"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of results",
      "default": 50
    },
    "offset": {
      "type": "integer",
      "description": "Result offset for pagination",
      "default": 0
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
      "default": true
    }
  },
  "required": []
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
    "system",
    "action"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-patient-communication`

**Name:** Patient Communication

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
      ],
      "description": "Communication provider"
    },
    "defaultChannel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice"
      ],
      "description": "Default communication channel"
    },
    "templateEngine": {
      "type": "string",
      "enum": [
        "handlebars",
        "nunjucks",
        "mustache",
        "custom"
      ],
      "description": "Template engine"
    },
    "deliveryTracking": {
      "type": "boolean",
      "description": "Enable delivery tracking"
    },
    "optOutManagement": {
      "type": "boolean",
      "description": "Enable opt-out management"
    },
    "languageSupport": {
      "type": "boolean",
      "description": "Enable multi-language support"
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
    "patient": {
      "type": "string",
      "description": "Select patient"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice",
        "fax"
      ],
      "description": "Communication channel"
    },
    "templateId": {
      "type": "string",
      "description": "Message template identifier"
    },
    "subject": {
      "type": "string",
      "description": "Message subject"
    },
    "message": {
      "type": "string",
      "description": "Message content"
    },
    "variables": {
      "type": "object",
      "properties": {},
      "description": "Template variables"
    },
    "scheduledAt": {
      "type": "string",
      "description": "Scheduled send time (ISO 8601)"
    },
    "priority": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ],
      "description": "Message priority"
    },
    "scheduleId": {
      "type": "string",
      "description": "Communication schedule identifier"
    },
    "frequency": {
      "type": "string",
      "enum": [
        "once",
        "daily",
        "weekly",
        "monthly",
        "custom"
      ],
      "description": "Communication frequency for scheduled messages"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
      "default": true
    }
  },
  "required": []
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
    "system",
    "action"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-resource-coordination`

**Name:** Resource Coordination

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
        "referral-md",
        "kyruus",
        "custom"
      ],
      "description": "System provider"
    },
    "defaultFacility": {
      "type": "string",
      "description": "Default facility identifier"
    },
    "enableMatching": {
      "type": "boolean",
      "description": "Enable patient-resource matching algorithms"
    },
    "enableForecasting": {
      "type": "boolean",
      "description": "Enable demand forecasting"
    },
    "maxAllocationHours": {
      "type": "number",
      "description": "Maximum allocation duration in hours",
      "default": 24
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
    "resourceType": {
      "type": "string",
      "enum": [
        "bed",
        "equipment",
        "room",
        "staff",
        "device",
        "supply"
      ],
      "description": "Type of resource"
    },
    "resourceId": {
      "type": "string",
      "description": "Resource identifier"
    },
    "facility": {
      "type": "string",
      "description": "Facility identifier"
    },
    "patient": {
      "type": "string",
      "description": "Select patient"
    },
    "quantity": {
      "type": "integer",
      "description": "Quantity to allocate"
    },
    "startTime": {
      "type": "string",
      "description": "Start time (ISO 8601)"
    },
    "endTime": {
      "type": "string",
      "description": "End time (ISO 8601)"
    },
    "priority": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ],
      "description": "Request priority"
    },
    "clinicalNeeds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Patient clinical needs for matching"
    },
    "insurance": {
      "type": "object",
      "properties": {},
      "description": "Insurance information for matching"
    },
    "preferences": {
      "type": "object",
      "properties": {},
      "description": "Patient preferences"
    },
    "specialty": {
      "type": "string",
      "description": "Medical specialty for matching"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ],
      "description": "Matching urgency"
    },
    "maxResults": {
      "type": "integer",
      "description": "Maximum results to return",
      "default": 10
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
      "default": true
    }
  },
  "required": []
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
    "system",
    "action"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-operational-analytics`

**Name:** Operational Analytics

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
    "reportType": {
      "type": "string",
      "enum": [
        "clinical",
        "operational",
        "financial",
        "quality",
        "population"
      ],
      "description": "Report category type"
    },
    "metric": {
      "type": "string",
      "description": "Metric name to analyze (e.g., patient_volume, avg_length_of_stay, bed_occupancy)"
    },
    "period": {
      "type": "string",
      "enum": [
        "7d",
        "30d",
        "90d",
        "YTD",
        "1y"
      ],
      "description": "Time period for analysis",
      "default": "30d"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date (ISO 8601)"
        },
        "end": {
          "type": "string",
          "description": "End date (ISO 8601)"
        }
      },
      "description": "Custom date range for analysis"
    },
    "facility": {
      "type": "string",
      "description": "Facility identifier for filtering"
    },
    "provider": {
      "type": "string",
      "description": "Provider identifier for filtering"
    },
    "filterCriteria": {
      "type": "object",
      "properties": {},
      "description": "Additional filter criteria as key-value pairs"
    },
    "granularity": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month",
        "quarter"
      ],
      "description": "Time granularity for aggregation",
      "default": "day"
    },
    "format": {
      "type": "string",
      "enum": [
        "json",
        "csv",
        "pdf"
      ],
      "description": "Output format for export"
    }
  },
  "required": []
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
      "type": "object",
      "properties": {
        "type": {
          "type": "string"
        },
        "reportType": {
          "type": "string"
        },
        "period": {
          "type": "string"
        },
        "granularity": {
          "type": "string"
        },
        "kpis": {
          "type": "object"
        },
        "trend": {
          "type": "object"
        },
        "recordCount": {
          "type": "number"
        },
        "source": {
          "type": "string"
        },
        "exportPath": {
          "type": "string"
        },
        "note": {
          "type": "string"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-clinical-practice-workflow-evaluator`

**Name:** Clinical Practice & Workflow Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "healthcareHome": {
      "type": "string",
      "description": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME",
      "title": "Healthcare Home",
      "order": 1,
      "hint": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME"
    },
    "accessWaitThresholdMinutes": {
      "type": "number",
      "description": "Wait-time threshold in minutes for an access bottleneck",
      "default": 30,
      "title": "Access Wait Threshold Minutes",
      "order": 2,
      "hint": "Wait-time threshold in minutes for an access bottleneck"
    },
    "billingDelayThresholdDays": {
      "type": "number",
      "description": "Billing-delay threshold in days for a billing bottleneck",
      "default": 7,
      "title": "Billing Delay Threshold Days",
      "order": 3,
      "hint": "Billing-delay threshold in days for a billing bottleneck"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "workflowRows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Optional workflow row identifier"
          },
          "facility": {
            "type": "string",
            "description": "Facility or practice identifier"
          },
          "scheduled": {
            "type": "integer",
            "description": "Scheduled encounters"
          },
          "completed": {
            "type": "integer",
            "description": "Completed encounters"
          },
          "noShows": {
            "type": "integer",
            "description": "No-show encounters"
          },
          "avgWaitMinutes": {
            "type": "number",
            "description": "Average wait time in minutes"
          },
          "billingDelayDays": {
            "type": "number",
            "description": "Average billing delay in days"
          }
        }
      },
      "description": "Practice workflow records",
      "title": "Workflow Rows",
      "order": 1,
      "hint": "Practice workflow records"
    },
    "accessWaitThresholdMinutes": {
      "type": "number",
      "description": "Wait-time threshold in minutes",
      "default": 30,
      "title": "Access Wait Threshold Minutes",
      "order": 2,
      "hint": "Wait-time threshold in minutes"
    },
    "billingDelayThresholdDays": {
      "type": "number",
      "description": "Billing-delay threshold in days",
      "default": 7,
      "title": "Billing Delay Threshold Days",
      "order": 3,
      "hint": "Billing-delay threshold in days"
    }
  },
  "required": [
    "workflowRows"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Per-location workflow metrics, set summary, bottlenecks, and recommendations"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-clinical-decision-support-evaluator`

**Name:** Clinical Decision-Support Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "healthcareHome": {
      "type": "string",
      "description": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME",
      "title": "Healthcare Home",
      "order": 1,
      "hint": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME"
    },
    "minimumEvidenceSources": {
      "type": "integer",
      "description": "Minimum supplied evidence sources for a reviewable synthesis",
      "default": 1,
      "title": "Minimum Evidence Sources",
      "order": 2,
      "hint": "Minimum supplied evidence sources for a reviewable synthesis"
    },
    "requireClinicianReview": {
      "type": "boolean",
      "description": "Keep all decision-support output provider-review only",
      "default": true,
      "title": "Require Clinician Review",
      "order": 3,
      "hint": "Keep all decision-support output provider-review only"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "patient": {
      "type": "object",
      "properties": {
        "age": {
          "type": "integer",
          "description": "Patient age in years"
        },
        "symptoms": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Patient-reported symptoms"
        },
        "history": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Relevant medical history"
        }
      },
      "description": "Patient context for evaluation",
      "title": "Patient",
      "order": 1,
      "hint": "Patient context for evaluation"
    },
    "symptoms": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Optional top-level symptom list",
      "title": "Symptoms",
      "order": 2,
      "hint": "Optional top-level symptom list"
    },
    "history": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Optional top-level history list",
      "title": "History",
      "order": 3,
      "hint": "Optional top-level history list"
    },
    "guidelines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Guideline or evidence source name"
          },
          "keywords": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Symptom keywords covered by the guideline"
          },
          "pathway": {
            "type": "string",
            "description": "Supplied care pathway for clinician review"
          },
          "evidenceLevel": {
            "type": "string",
            "description": "Evidence level supplied by the user"
          }
        }
      },
      "description": "Evidence-based guideline inputs",
      "title": "Guidelines",
      "order": 4,
      "hint": "Evidence-based guideline inputs"
    }
  },
  "required": [
    "patient",
    "guidelines"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Provider-facing considerations: symptoms, red flags, ranked guideline matches, escalation, and safety boundary"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-patient-care-plan-educational-briefing-copilot`

**Name:** Patient Care Plan & Educational Briefing Co-Pilot

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "healthcareHome": {
      "type": "string",
      "description": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME",
      "title": "Healthcare Home",
      "order": 1,
      "hint": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME"
    },
    "defaultLanguage": {
      "type": "string",
      "description": "Default language for the educational briefing",
      "default": "English",
      "title": "Default Language",
      "order": 2,
      "hint": "Default language for the educational briefing"
    },
    "requireClinicianReview": {
      "type": "boolean",
      "description": "Require clinician review before using the briefing",
      "default": true,
      "title": "Require Clinician Review",
      "order": 3,
      "hint": "Require clinician review before using the briefing"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "condition": {
      "type": "string",
      "description": "Condition or care need supplied by the clinician",
      "title": "Condition",
      "order": 1,
      "hint": "Condition or care need supplied by the clinician"
    },
    "careNeed": {
      "type": "string",
      "description": "Optional alternate label for the care need",
      "title": "Care Need",
      "order": 2,
      "hint": "Optional alternate label for the care need"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Patient or clinician goals",
      "title": "Goals",
      "order": 3,
      "hint": "Patient or clinician goals"
    },
    "medications": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Medication or therapy name"
          },
          "instruction": {
            "type": "string",
            "description": "Clinician-provided instruction"
          }
        }
      },
      "description": "Current medications or therapies",
      "title": "Medications",
      "order": 4,
      "hint": "Current medications or therapies"
    },
    "educationTopics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Topics to explain to the patient",
      "title": "Education Topics",
      "order": 5,
      "hint": "Topics to explain to the patient"
    },
    "followUp": {
      "type": "string",
      "description": "Clinician-defined follow-up interval",
      "title": "Follow Up",
      "order": 6,
      "hint": "Clinician-defined follow-up interval"
    }
  },
  "required": [
    "condition",
    "goals",
    "educationTopics"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Structured care plan: goals, medications, education topics, briefing, and safety boundary"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `healthcare-appointment-patient-intake-dispatcher`

**Name:** Appointment & Patient Intake Dispatcher

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "healthcareHome": {
      "type": "string",
      "description": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME",
      "title": "Healthcare Home",
      "order": 1,
      "hint": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME"
    },
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Healthcare intake endpoint URL; may also be supplied at runtime through HEALTHCARE_INTAKE_ENDPOINT",
      "title": "Endpoint Url",
      "order": 2,
      "hint": "Healthcare intake endpoint URL; may also be supplied at runtime through HEALTHCARE_INTAKE_ENDPOINT"
    },
    "token": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the intake endpoint",
      "title": "Token",
      "order": 3,
      "hint": "Bearer token for the intake endpoint"
    },
    "accessToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Alternate bearer access token for the intake endpoint",
      "title": "Access Token",
      "order": 4,
      "hint": "Alternate bearer access token for the intake endpoint"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before a live intake request",
      "default": true,
      "title": "Confirm Before Send",
      "order": 5,
      "hint": "Require explicit confirmation before a live intake request"
    },
    "defaultDryRun": {
      "type": "boolean",
      "description": "Default intake execution to dry-run",
      "default": true,
      "title": "Default Dry Run",
      "order": 6,
      "hint": "Default intake execution to dry-run"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "endpoint": {
      "type": "string",
      "format": "uri",
      "description": "Optional alternate intake endpoint override",
      "title": "Endpoint",
      "order": 1,
      "hint": "Optional alternate intake endpoint override"
    },
    "token": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional bearer token override for the intake endpoint",
      "title": "Token",
      "order": 2,
      "hint": "Optional bearer token override for the intake endpoint"
    },
    "accessToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional alternate access-token override for the intake endpoint",
      "title": "Access Token",
      "order": 3,
      "hint": "Optional alternate access-token override for the intake endpoint"
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Patient intake payload to validate or dispatch",
      "title": "Payload",
      "order": 4,
      "hint": "Patient intake payload to validate or dispatch"
    },
    "patient": {
      "type": "string",
      "description": "Patient identifier used when payload is omitted",
      "title": "Patient",
      "order": 5,
      "hint": "Patient identifier used when payload is omitted"
    },
    "appointmentType": {
      "type": "string",
      "description": "Appointment type used when payload is omitted",
      "title": "Appointment Type",
      "order": 6,
      "hint": "Appointment type used when payload is omitted"
    },
    "reasonForVisit": {
      "type": "string",
      "description": "Reason for visit used when payload is omitted",
      "title": "Reason For Visit",
      "order": 7,
      "hint": "Reason for visit used when payload is omitted"
    },
    "requiredDocuments": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Documents required before the visit",
      "title": "Required Documents",
      "order": 8,
      "hint": "Documents required before the visit"
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Documents already supplied by the patient",
      "title": "Documents",
      "order": 9,
      "hint": "Documents already supplied by the patient"
    },
    "pendingIntakeIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Pending intake identifiers used to derive queue position",
      "title": "Pending Intake Ids",
      "order": 10,
      "hint": "Pending intake identifiers used to derive queue position"
    },
    "queuePosition": {
      "type": "integer",
      "description": "Optional explicit intake queue position",
      "title": "Queue Position",
      "order": 11,
      "hint": "Optional explicit intake queue position"
    },
    "route": {
      "type": "string",
      "description": "Optional routing destination or queue name",
      "title": "Route",
      "order": 12,
      "hint": "Optional routing destination or queue name"
    },
    "provider": {
      "type": "string",
      "description": "Optional provider identifier for routing",
      "title": "Provider",
      "order": 13,
      "hint": "Optional provider identifier for routing"
    },
    "facility": {
      "type": "string",
      "description": "Optional facility identifier for routing",
      "title": "Facility",
      "order": 14,
      "hint": "Optional facility identifier for routing"
    },
    "startTime": {
      "type": "string",
      "description": "Optional appointment start time in ISO 8601 format",
      "title": "Start Time",
      "order": 15,
      "hint": "Optional appointment start time in ISO 8601 format"
    },
    "endTime": {
      "type": "string",
      "description": "Optional appointment end time in ISO 8601 format",
      "title": "End Time",
      "order": 16,
      "hint": "Optional appointment end time in ISO 8601 format"
    },
    "symptoms": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Symptoms used when payload is omitted",
      "title": "Symptoms",
      "order": 17,
      "hint": "Symptoms used when payload is omitted"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "unknown",
        "routine",
        "urgent",
        "emergency"
      ],
      "description": "Intake urgency; emergency intake is never auto-dispatched",
      "default": "unknown",
      "title": "Urgency",
      "order": 18,
      "hint": "Intake urgency; emergency intake is never auto-dispatched"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate and stage without dispatch; defaults to true",
      "default": true,
      "title": "Dry Run",
      "order": 19,
      "hint": "Validate and stage without dispatch; defaults to true"
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live intake dispatch",
      "default": false,
      "title": "Confirmation",
      "order": 20,
      "hint": "Explicit approval for a live intake dispatch"
    },
    "confirmed": {
      "type": "boolean",
      "description": "Alternate explicit approval flag for a live intake dispatch",
      "default": false,
      "title": "Confirmed",
      "order": 21,
      "hint": "Alternate explicit approval flag for a live intake dispatch"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Intake payload, missing documentation, queue position, route, and response when dispatched"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

#### `care-resource-referral-coordinator`

**Name:** Care Resource & Referral Coordinator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "healthcareHome": {
      "type": "string",
      "description": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME",
      "title": "Healthcare Home",
      "order": 1,
      "hint": "Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME"
    },
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Optional referral coordination endpoint URL; the connected resource coordination tool may supply its own endpoint",
      "title": "Endpoint Url",
      "order": 2,
      "hint": "Optional referral coordination endpoint URL; the connected resource coordination tool may supply its own endpoint"
    },
    "accessToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer access token for an optional referral coordination endpoint",
      "title": "Access Token",
      "order": 3,
      "hint": "Bearer access token for an optional referral coordination endpoint"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before a live referral or resource mutation",
      "default": true,
      "title": "Confirm Before Send",
      "order": 4,
      "hint": "Require explicit confirmation before a live referral or resource mutation"
    },
    "defaultDryRun": {
      "type": "boolean",
      "description": "Default referral coordination to dry-run",
      "default": true,
      "title": "Default Dry Run",
      "order": 5,
      "hint": "Default referral coordination to dry-run"
    },
    "maxResults": {
      "type": "integer",
      "description": "Maximum resource candidates to request",
      "minimum": 1,
      "maximum": 50,
      "default": 10,
      "title": "Max Results",
      "order": 6,
      "hint": "Maximum resource candidates to request"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "patient": {
      "type": "string",
      "description": "Minimum-necessary patient identifier",
      "title": "Patient",
      "order": 1,
      "hint": "Minimum-necessary patient identifier"
    },
    "referralId": {
      "type": "string",
      "description": "Referral identifier for track or status operations",
      "title": "Referral Id",
      "order": 2,
      "hint": "Referral identifier for track or status operations"
    },
    "clinicalNeeds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Clinician-supplied care needs used for resource matching",
      "title": "Clinical Needs",
      "order": 3,
      "hint": "Clinician-supplied care needs used for resource matching"
    },
    "insurance": {
      "type": "object",
      "properties": {},
      "description": "Minimum-necessary insurance or network information",
      "additionalProperties": true,
      "title": "Insurance",
      "order": 4,
      "hint": "Minimum-necessary insurance or network information"
    },
    "preferences": {
      "type": "object",
      "properties": {},
      "description": "Patient care-resource preferences",
      "additionalProperties": true,
      "title": "Preferences",
      "order": 5,
      "hint": "Patient care-resource preferences"
    },
    "location": {
      "type": "object",
      "properties": {},
      "description": "Patient location or service area",
      "additionalProperties": true,
      "title": "Location",
      "order": 6,
      "hint": "Patient location or service area"
    },
    "specialty": {
      "type": "string",
      "description": "Requested clinical specialty or program",
      "title": "Specialty",
      "order": 7,
      "hint": "Requested clinical specialty or program"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "routine",
        "urgent",
        "emergency"
      ],
      "description": "Referral urgency; emergency requests require the approved clinical emergency pathway",
      "default": "routine",
      "title": "Urgency",
      "order": 8,
      "hint": "Referral urgency; emergency requests require the approved clinical emergency pathway"
    },
    "maxResults": {
      "type": "integer",
      "description": "Maximum resource candidates to request",
      "minimum": 1,
      "maximum": 50,
      "default": 10,
      "title": "Max Results",
      "order": 9,
      "hint": "Maximum resource candidates to request"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate and stage without creating or mutating a referral; defaults to true",
      "default": true,
      "title": "Dry Run",
      "order": 10,
      "hint": "Validate and stage without creating or mutating a referral; defaults to true"
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live referral or resource mutation",
      "default": false,
      "title": "Confirmation",
      "order": 11,
      "hint": "Explicit approval for a live referral or resource mutation"
    },
    "confirmed": {
      "type": "boolean",
      "description": "Alternate explicit approval flag for a live referral or resource mutation",
      "default": false,
      "title": "Confirmed",
      "order": 12,
      "hint": "Alternate explicit approval flag for a live referral or resource mutation"
    },
    "communicationChannel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "portal",
        "voice"
      ],
      "description": "Patient communication channel for referral notifications",
      "default": "portal",
      "title": "Communication Channel",
      "order": 13,
      "hint": "Patient communication channel for referral notifications"
    },
    "communicationTemplateId": {
      "type": "string",
      "description": "Message template identifier for patient referral notifications",
      "title": "Communication Template Id",
      "order": 14,
      "hint": "Message template identifier for patient referral notifications"
    },
    "communicationSubject": {
      "type": "string",
      "description": "Subject line for patient referral communication",
      "title": "Communication Subject",
      "order": 15,
      "hint": "Subject line for patient referral communication"
    },
    "communicationConfirmation": {
      "type": "boolean",
      "description": "Explicit approval for sending patient communication about the referral",
      "default": false,
      "title": "Communication Confirmation",
      "order": 16,
      "hint": "Explicit approval for sending patient communication about the referral"
    },
    "communicationConfirmed": {
      "type": "boolean",
      "description": "Alternate explicit approval flag for patient communication",
      "default": false,
      "title": "Communication Confirmed",
      "order": 17,
      "hint": "Alternate explicit approval flag for patient communication"
    },
    "accessToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional bearer token for an endpoint override",
      "title": "Access Token",
      "order": 18,
      "hint": "Optional bearer token for an endpoint override"
    },
    "context": {
      "type": "object",
      "properties": {},
      "description": "Additional coordination context that does not replace required clinical inputs",
      "additionalProperties": true,
      "title": "Context",
      "order": 19,
      "hint": "Additional coordination context that does not replace required clinical inputs"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Referral record, candidate resources, communication status, step results, and coverage"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/healthcare/index.ts)

### Hotel Ops

> Category source: `services/tool-executor/src/data/skills/hotel/index.ts`

#### `hotel-reservations-guest-profile`

**Name:** Reservations & Guest Profile

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "reservationId": {
      "type": "string",
      "description": "Reservation identifier"
    },
    "guestId": {
      "type": "string",
      "description": "Guest profile identifier"
    },
    "roomId": {
      "type": "string",
      "description": "Room identifier for assignment or status changes"
    },
    "guestName": {
      "type": "string",
      "description": "Guest name for a new reservation or profile"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Guest email address"
    },
    "phone": {
      "type": "string",
      "description": "Guest phone number"
    },
    "checkIn": {
      "type": "string",
      "description": "Check-in date in ISO 8601 or YYYY-MM-DD format"
    },
    "checkOut": {
      "type": "string",
      "description": "Check-out date in ISO 8601 or YYYY-MM-DD format"
    },
    "roomType": {
      "type": "string",
      "description": "Requested room type or rate-plan category"
    },
    "channel": {
      "type": "string",
      "description": "External booking channel, such as direct, ota, gds, or a channel name"
    },
    "currency": {
      "type": "string",
      "description": "Billing currency code, such as USD or EUR"
    },
    "amount": {
      "type": "number",
      "description": "Billing amount or payment amount",
      "minimum": 0
    },
    "paymentMethod": {
      "type": "string",
      "description": "Payment method or gateway reference"
    },
    "lineItems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "Line-item description"
          },
          "quantity": {
            "type": "number",
            "description": "Line-item quantity",
            "minimum": 0
          },
          "unitPrice": {
            "type": "number",
            "description": "Line-item unit price",
            "minimum": 0
          },
          "amount": {
            "type": "number",
            "description": "Line-item total",
            "minimum": 0
          }
        }
      },
      "description": "Folio, invoice, or booking line items"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Range start date or timestamp"
        },
        "end": {
          "type": "string",
          "description": "Range end date or timestamp"
        }
      },
      "description": "Date range for reservation, billing, or booking operations"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Operation-specific query filters",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Operation-specific reservation or guest data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-housekeeping-manager`

**Name:** Housekeeping & Room Turnover

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    },
    "roomId": {
      "type": "string",
      "description": "Room identifier"
    },
    "roomIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Room identifiers for bulk housekeeping rounds"
    },
    "staffId": {
      "type": "string",
      "description": "Housekeeping attendant identifier"
    },
    "staffIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Housekeeping attendants to assign or dispatch"
    },
    "taskId": {
      "type": "string",
      "description": "Housekeeping task identifier"
    },
    "housekeepingStatus": {
      "type": "string",
      "enum": [
        "dirty",
        "clean",
        "inspected",
        "out-of-service"
      ],
      "description": "Housekeeping cleanliness state for the room"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent"
      ],
      "description": "Housekeeping task priority"
    },
    "location": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "Human-readable location"
        },
        "floor": {
          "type": "string",
          "description": "Floor or building area"
        },
        "roomNumber": {
          "type": "string",
          "description": "Room number when applicable"
        }
      },
      "description": "Physical location for an operational task"
    },
    "dueTime": {
      "type": "string",
      "format": "date-time",
      "description": "Housekeeping due time in ISO 8601 format"
    },
    "scheduledAt": {
      "type": "string",
      "format": "date-time",
      "description": "Scheduled start time in ISO 8601 format"
    },
    "estimatedMinutes": {
      "type": "integer",
      "description": "Estimated task duration in minutes",
      "minimum": 1
    },
    "action": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "assign",
        "dispatch",
        "complete"
      ],
      "description": "Housekeeping action to apply to the task or room"
    },
    "notes": {
      "type": "string",
      "multiline": true,
      "description": "Housekeeping notes or attendant handoff instructions"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Housekeeping query filters",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Housekeeping-specific data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-maintenance-dispatcher`

**Name:** Maintenance Dispatch & Resolution

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    },
    "roomId": {
      "type": "string",
      "description": "Room identifier"
    },
    "taskId": {
      "type": "string",
      "description": "Maintenance work-order identifier"
    },
    "issueId": {
      "type": "string",
      "description": "Reported issue or incident identifier"
    },
    "staffId": {
      "type": "string",
      "description": "Maintenance technician identifier"
    },
    "staffIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Technicians to assign or dispatch"
    },
    "category": {
      "type": "string",
      "description": "Maintenance trade or work category, such as hvac, plumbing, or electrical"
    },
    "severity": {
      "type": "string",
      "enum": [
        "minor",
        "moderate",
        "major",
        "critical"
      ],
      "description": "Issue severity"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent",
        "emergency"
      ],
      "description": "Work-order priority"
    },
    "status": {
      "type": "string",
      "enum": [
        "open",
        "assigned",
        "in-progress",
        "on-hold",
        "completed",
        "closed",
        "resolved",
        "escalated"
      ],
      "description": "Work-order lifecycle status"
    },
    "location": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "Human-readable location"
        },
        "floor": {
          "type": "string",
          "description": "Floor or building area"
        },
        "roomNumber": {
          "type": "string",
          "description": "Room number when applicable"
        }
      },
      "description": "Physical location for an operational task"
    },
    "dueTime": {
      "type": "string",
      "format": "date-time",
      "description": "Work-order due time in ISO 8601 format"
    },
    "scheduledAt": {
      "type": "string",
      "format": "date-time",
      "description": "Scheduled visit time in ISO 8601 format"
    },
    "estimatedMinutes": {
      "type": "integer",
      "description": "Estimated repair duration in minutes",
      "minimum": 1
    },
    "action": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "assign",
        "dispatch",
        "complete",
        "close",
        "resolve",
        "escalate"
      ],
      "description": "Maintenance action to apply to the work order"
    },
    "notes": {
      "type": "string",
      "multiline": true,
      "description": "Repair notes, parts used, or technician handoff instructions"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Maintenance work-order query filters",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Maintenance-specific data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-room-status-manager`

**Name:** Room Status & Availability

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    },
    "roomId": {
      "type": "string",
      "description": "Room identifier"
    },
    "roomIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Room identifiers for bulk status changes"
    },
    "status": {
      "type": "string",
      "enum": [
        "available",
        "occupied",
        "reserved",
        "cleaning",
        "clean",
        "inspected",
        "out-of-order"
      ],
      "description": "Target room status; out-of-order removes the room from sale"
    },
    "notes": {
      "type": "string",
      "multiline": true,
      "description": "Status change note for the audit trail"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Room status query filters",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Room status-specific data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-inventory-manager`

**Name:** Supply & Inventory Reorder

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    },
    "itemId": {
      "type": "string",
      "description": "Inventory item identifier"
    },
    "category": {
      "type": "string",
      "description": "Inventory category, such as linen, amenities, or housekeeping supplies"
    },
    "quantity": {
      "type": "number",
      "description": "Inventory quantity to adjust",
      "minimum": 0
    },
    "unit": {
      "type": "string",
      "description": "Inventory quantity unit, such as each, case, or liter"
    },
    "minStockLevel": {
      "type": "number",
      "description": "Minimum stock threshold used to surface reorder needs",
      "minimum": 0
    },
    "notes": {
      "type": "string",
      "multiline": true,
      "description": "Stock count or adjustment note"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Inventory query filters, such as category or below-threshold",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Inventory-specific data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-guest-experience`

**Name:** Guest Experience

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending a mutating hotel request",
      "default": true
    },
    "hotelHome": {
      "type": "string",
      "description": "Hotel PMS base URL or local hotel service home",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Bearer token for the hotel PMS"
    },
    "provider": {
      "type": "string",
      "description": "PMS or channel manager provider, such as opera, mews, cloudbeds, or custom"
    },
    "apiVersion": {
      "type": "string",
      "description": "Optional hotel API version"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "guestId": {
      "type": "string",
      "description": "Guest identifier"
    },
    "reservationId": {
      "type": "string",
      "description": "Related reservation identifier"
    },
    "requestId": {
      "type": "string",
      "description": "Guest-service request identifier"
    },
    "query": {
      "type": "string",
      "multiline": true,
      "description": "Concierge question or local-information search query"
    },
    "category": {
      "type": "string",
      "enum": [
        "dining",
        "transport",
        "attractions",
        "events",
        "wellness",
        "shopping",
        "business",
        "emergency"
      ],
      "description": "Concierge or local-information category"
    },
    "language": {
      "type": "string",
      "description": "Preferred response language code, such as en, es, or fr"
    },
    "location": {
      "type": "object",
      "properties": {
        "address": {
          "type": "string",
          "description": "Street address or place name"
        },
        "latitude": {
          "type": "number",
          "description": "Latitude coordinate"
        },
        "longitude": {
          "type": "number",
          "description": "Longitude coordinate"
        }
      },
      "description": "Location used to center recommendations or local results"
    },
    "radiusKm": {
      "type": "number",
      "description": "Search radius in kilometers",
      "minimum": 0
    },
    "rating": {
      "type": "number",
      "description": "Minimum recommendation rating",
      "minimum": 0,
      "maximum": 5
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Recommendation or content tags"
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
      ],
      "description": "Guest communication channel"
    },
    "templateId": {
      "type": "string",
      "description": "Communication template identifier"
    },
    "subject": {
      "type": "string",
      "description": "Guest message subject"
    },
    "message": {
      "type": "string",
      "multiline": true,
      "description": "Guest-facing message or service response draft"
    },
    "variables": {
      "type": "object",
      "properties": {},
      "description": "Template variables for personalized communication",
      "additionalProperties": true
    },
    "scheduledAt": {
      "type": "string",
      "format": "date-time",
      "description": "Scheduled communication time in ISO 8601 format"
    },
    "urgency": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "urgent"
      ],
      "description": "Guest-service request urgency"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Operation-specific search or service filters",
      "additionalProperties": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Operation-specific guest-experience data",
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "properties": {},
      "description": "Full operation payload for connector-specific fields",
      "additionalProperties": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate the request without sending a live mutation",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live mutating request; dryRun does not require approval",
      "default": false
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the external operation completed successfully"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "error"
      ],
      "description": "Execution status returned by the connector"
    },
    "system": {
      "type": "string",
      "description": "Hotel system that handled the operation"
    },
    "action": {
      "type": "string",
      "description": "High-level action executed by the connector"
    },
    "request": {
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {},
          "description": "Input sent to the hotel connector",
          "additionalProperties": true
        },
        "endpoint": {
          "type": "string",
          "description": "Resolved hotel connector endpoint"
        },
        "method": {
          "type": "string",
          "description": "HTTP method used for the request"
        },
        "headers": {
          "type": "object",
          "properties": {},
          "description": "Redacted request headers",
          "additionalProperties": true
        }
      },
      "description": "Details of the external request"
    },
    "response": {
      "type": "object",
      "properties": {
        "status": {
          "type": "number",
          "description": "HTTP response status code"
        },
        "data": {
          "type": "object",
          "properties": {},
          "description": "Data returned by the hotel connector",
          "additionalProperties": true
        }
      },
      "description": "Response from the hotel connector"
    },
    "error": {
      "type": "string",
      "description": "Error message when the operation fails"
    }
  },
  "required": [
    "success",
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

#### `hotel-revenue-performance-advisory`

**Name:** Revenue & Performance Advisory

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "hotelHome": {
      "type": "string",
      "description": "Hotel home directory or PMS base URL",
      "default": "/tmp/hotel"
    },
    "apiToken": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional PMS bearer token"
    },
    "retentionDays": {
      "type": "integer",
      "description": "Local analytics retention period in days",
      "minimum": 1,
      "default": 90
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "propertyId": {
      "type": "string",
      "description": "Hotel property identifier",
      "required": true
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Analysis range start date or timestamp"
        },
        "end": {
          "type": "string",
          "description": "Analysis range end date or timestamp"
        }
      },
      "description": "Date range for analytics and recommendations"
    },
    "granularity": {
      "type": "string",
      "enum": [
        "hourly",
        "daily",
        "weekly",
        "monthly",
        "quarterly"
      ],
      "description": "Time granularity for aggregation and forecasting"
    },
    "currency": {
      "type": "string",
      "description": "Reporting currency code, such as USD or EUR"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Metrics to include, such as occupancy, adr, revpar, labor cost, or satisfaction"
    },
    "dimensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dimensions for grouping results, such as channel, department, or segment"
    },
    "records": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "Record date or timestamp"
          },
          "revenue": {
            "type": "number",
            "description": "Record revenue",
            "minimum": 0
          },
          "roomsSold": {
            "type": "integer",
            "description": "Rooms sold in the record",
            "minimum": 0
          },
          "availableRooms": {
            "type": "integer",
            "description": "Available rooms in the record",
            "minimum": 0
          },
          "adr": {
            "type": "number",
            "description": "Average daily rate for the record",
            "minimum": 0
          },
          "channel": {
            "type": "string",
            "description": "Booking or sales channel"
          },
          "department": {
            "type": "string",
            "description": "Operating department"
          },
          "staffId": {
            "type": "string",
            "description": "Staff member associated with the record"
          },
          "tasksCompleted": {
            "type": "integer",
            "description": "Tasks completed by the staff member",
            "minimum": 0
          },
          "guestSatisfaction": {
            "type": "number",
            "description": "Guest satisfaction score",
            "minimum": 0,
            "maximum": 5
          }
        }
      },
      "description": "Supplied PMS, operational, or staff records for grounded analysis"
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Booking channels to compare"
    },
    "staffing": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "staffId": {
            "type": "string",
            "description": "Staff member identifier"
          },
          "department": {
            "type": "string",
            "description": "Staff department"
          },
          "shifts": {
            "type": "integer",
            "description": "Completed or scheduled shifts",
            "minimum": 0
          },
          "hoursWorked": {
            "type": "number",
            "description": "Hours worked",
            "minimum": 0
          },
          "tasksCompleted": {
            "type": "integer",
            "description": "Completed tasks",
            "minimum": 0
          },
          "guestSatisfaction": {
            "type": "number",
            "description": "Guest satisfaction score",
            "minimum": 0,
            "maximum": 5
          }
        }
      },
      "description": "Staff performance records"
    },
    "staffId": {
      "type": "string",
      "description": "Staff member to analyze"
    },
    "department": {
      "type": "string",
      "description": "Department to filter or analyze"
    },
    "baselineRevenue": {
      "type": "number",
      "description": "Baseline revenue used for variance or forecast calculations",
      "minimum": 0
    },
    "growthRate": {
      "type": "number",
      "description": "Expected revenue growth rate as a percentage"
    },
    "targetOccupancy": {
      "type": "number",
      "description": "Target occupancy percentage",
      "minimum": 0,
      "maximum": 100
    },
    "targetAdr": {
      "type": "number",
      "description": "Target average daily rate",
      "minimum": 0
    },
    "params": {
      "type": "object",
      "properties": {},
      "description": "Additional advisory parameters",
      "additionalProperties": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Return an advisory draft without persisting or sending changes",
      "default": true
    }
  },
  "required": [
    "propertyId"
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
      "description": "Whether the advisory analysis completed"
    },
    "status": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "not-connected",
        "error"
      ],
      "description": "Execution and connector state"
    },
    "propertyId": {
      "type": "string",
      "description": "Property analyzed"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Grounded analytics and recommendations",
      "additionalProperties": true
    },
    "source": {
      "type": "string",
      "enum": [
        "supplied",
        "local-cache",
        "pms",
        "not-connected",
        "error"
      ],
      "description": "Data source used for the analysis"
    },
    "stale": {
      "type": "boolean",
      "description": "Whether the analysis relies on stale local cache instead of live PMS data"
    },
    "storePath": {
      "type": "string",
      "description": "Local analytics store path"
    },
    "note": {
      "type": "string",
      "description": "Connector or data-source disclosure"
    },
    "error": {
      "type": "string",
      "description": "Error message when analysis fails"
    }
  },
  "required": [
    "success",
    "status",
    "propertyId",
    "data",
    "source"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hotel/index.ts)

### HR

> Category source: `services/tool-executor/src/data/skills/hr/index.ts`

#### `hr-screen-resume`

**Name:** Screen Resume for Role Fit

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating scheduling requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "defaultEndpoint": {
      "type": "string",
      "format": "uri",
      "description": "Default screening and scheduling endpoint URL"
    },
    "maxRetryAttempts": {
      "type": "number",
      "description": "Retry attempts on scheduling failure",
      "default": 3
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute for scheduling API",
      "default": 60
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "Resume text to screen against job requirements"
    },
    "jobRequirements": {
      "type": "string",
      "description": "Job requirements to match resume against"
    },
    "candidateName": {
      "type": "string",
      "description": "Candidate full name"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing scheduling; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for live scheduling dispatch",
      "default": false
    }
  },
  "required": [
    "resumeText",
    "jobRequirements",
    "candidateName"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Screening record with match score, matched keywords, gaps, and persistence path"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-assess-candidate`

**Name:** Assess Candidate Skills and Experience

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "defaultEndpoint": {
      "type": "string",
      "format": "uri",
      "description": "Default screening and scheduling endpoint URL"
    },
    "maxRetryAttempts": {
      "type": "number",
      "description": "Retry attempts on scheduling failure",
      "default": 3
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute for scheduling API",
      "default": 60
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "resumeText": {
      "type": "string",
      "description": "Resume text to assess"
    },
    "candidateName": {
      "type": "string",
      "description": "Candidate full name"
    },
    "assessmentData": {
      "type": "object",
      "properties": {
        "technicalSkills": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Technical skills to assess against resume"
        },
        "softSkills": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Soft skills to assess against resume"
        },
        "experience": {
          "type": "string",
          "description": "Experience level to check for in resume"
        }
      },
      "description": "Assessment criteria and data for candidate evaluation"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    }
  },
  "required": [
    "resumeText",
    "candidateName",
    "assessmentData"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Assessment record with technical/soft skill match, years of experience, and persistence path"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-schedule-interview`

**Name:** Schedule Interview for Candidate

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating scheduling requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "defaultEndpoint": {
      "type": "string",
      "format": "uri",
      "description": "Default screening and scheduling endpoint URL"
    },
    "maxRetryAttempts": {
      "type": "number",
      "description": "Retry attempts on scheduling failure",
      "default": 3
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute for scheduling API",
      "default": 60
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "candidateName": {
      "type": "string",
      "description": "Candidate full name"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing scheduling; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for live scheduling dispatch",
      "default": false
    }
  },
  "required": [
    "candidateName"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Interview schedule record with mode, confirmation status, and persistence path"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-draft-jd-interview-kit`

**Name:** Draft Job Description & Interview Kit

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "defaultSource": {
      "type": "string",
      "description": "Default sourcing channel for job descriptions"
    },
    "apiVersion": {
      "type": "string",
      "description": "API version for recruiting operations"
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute",
      "default": 60
    },
    "retryAttempts": {
      "type": "number",
      "description": "Retry attempts on failure",
      "default": 3
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Payload data for job description or interview kit generation"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Filters for query operations"
    },
    "pagination": {
      "type": "object",
      "properties": {},
      "description": "Pagination settings"
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for live dispatch",
      "default": false
    }
  },
  "required": [
    "data"
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
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "system",
    "action",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-trigger-interview-scheduling`

**Name:** Trigger Interview Scheduling

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "defaultSource": {
      "type": "string",
      "description": "Default sourcing channel for job descriptions"
    },
    "apiVersion": {
      "type": "string",
      "description": "API version for recruiting operations"
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute",
      "default": 60
    },
    "retryAttempts": {
      "type": "number",
      "description": "Retry attempts on failure",
      "default": 3
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Scheduling payload data"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Filters for query operations"
    },
    "pagination": {
      "type": "object",
      "properties": {},
      "description": "Pagination settings"
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for live dispatch",
      "default": false
    }
  },
  "required": [
    "data"
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
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "system",
    "action",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-hiring-analytics`

**Name:** Hiring Pipeline Analytics

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date for analysis period in ISO 8601 format"
        },
        "end": {
          "type": "string",
          "description": "End date for analysis period in ISO 8601 format"
        }
      },
      "description": "Date range for the analysis period"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Hiring records for analytics (optional inline override)"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Filters to apply to the data"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Hiring analytics report with candidate counts by stage, time-to-fill, and diversity metrics"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

#### `hr-compliance-check`

**Name:** Compliance Audit Check

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date for analysis period in ISO 8601 format"
        },
        "end": {
          "type": "string",
          "description": "End date for analysis period in ISO 8601 format"
        }
      },
      "description": "Date range for the analysis period"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Compliance candidates data (optional inline override)"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Filters to apply to the data"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Compliance check report with findings for EEO, GDPR, and ADEA violations"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/hr/index.ts)

### Investment Advisor

> Category source: `services/tool-executor/src/data/skills/investment/index.ts`

#### `investment-market-data`

**Name:** Investment Market Data

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
      ],
      "description": "Market data provider to use"
    },
    "defaultExchange": {
      "type": "string",
      "description": "Default exchange for symbol resolution"
    },
    "dataTypes": {
      "type": "array",
      "items": {
        "type": "string",
        "description": "Data type to fetch"
      },
      "description": "Types of data to fetch"
    },
    "cacheTtlSeconds": {
      "type": "number",
      "description": "Cache time-to-live in seconds"
    },
    "rateLimitPerSecond": {
      "type": "number",
      "description": "Maximum requests per second"
    },
    "timeoutMs": {
      "type": "number",
      "description": "Request timeout in milliseconds"
    },
    "endpoint": {
      "type": "string",
      "format": "uri",
      "description": "Market data API base URL (env: INVESTMENT_MARKET_DATA_ENDPOINT)"
    },
    "apiKey": {
      "type": "string",
      "format": "password",
      "sensitive": true,
      "description": "API key for the market data provider (env: INVESTMENT_MARKET_DATA_API_KEY)"
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
      ],
      "description": "Market data action to perform"
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Stock symbols to query"
    },
    "symbol": {
      "type": "string",
      "description": "Single stock symbol"
    },
    "interval": {
      "type": "string",
      "enum": [
        "1m",
        "5m",
        "15m",
        "1h",
        "1d",
        "1w",
        "1mo"
      ],
      "description": "Data interval for historical queries"
    },
    "startDate": {
      "type": "string",
      "description": "Start date (ISO 8601)"
    },
    "endDate": {
      "type": "string",
      "description": "End date (ISO 8601)"
    },
    "fields": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Specific fields to return"
    },
    "adjustments": {
      "type": "string",
      "enum": [
        "none",
        "split",
        "dividend",
        "all"
      ],
      "description": "Price adjustment method"
    },
    "endpoint": {
      "type": "string",
      "description": "Override endpoint URL for this request only (defaults to env var)"
    },
    "apiKey": {
      "type": "string",
      "description": "Override API key for this request only (defaults to env var)"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Preview the request without sending it",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit confirmation for a live request"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Market data request metadata, response, and staging record"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `portfolio-risk-advisory`

**Name:** Portfolio & Risk Advisory

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
        "analyze-portfolio",
        "optimize",
        "risk-assessment",
        "evaluate",
        "rebalance",
        "factor-exposure",
        "scenario-analysis",
        "stress-test",
        "efficient-frontier",
        "risk-budgeting"
      ],
      "description": "Action to perform"
    },
    "holdings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Asset symbol"
          },
          "quantity": {
            "type": "number",
            "description": "Holding quantity",
            "minimum": 0
          },
          "value": {
            "type": "number",
            "description": "Current holding value",
            "minimum": 0
          },
          "amount": {
            "type": "number",
            "description": "Current holding value alias",
            "minimum": 0
          },
          "assetClass": {
            "type": "string",
            "description": "Asset class"
          },
          "expectedReturn": {
            "type": "number",
            "description": "Expected return as a decimal"
          }
        },
        "description": "Portfolio holding"
      },
      "description": "Portfolio holdings used for analysis"
    },
    "portfolio": {
      "type": "object",
      "properties": {
        "holdings": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "symbol": {
                "type": "string",
                "description": "Asset symbol"
              },
              "value": {
                "type": "number",
                "description": "Current value",
                "minimum": 0
              }
            },
            "description": "Portfolio holding"
          },
          "description": "Portfolio holdings"
        }
      },
      "description": "Portfolio object used for risk assessment"
    },
    "riskTolerance": {
      "type": "string",
      "enum": [
        "Conservative",
        "Moderate",
        "Aggressive",
        "Very Aggressive"
      ],
      "description": "Risk tolerance level"
    },
    "expectedReturns": {
      "type": "object",
      "properties": {},
      "description": "Expected returns for assets, keyed by symbol"
    },
    "covarianceMatrix": {
      "type": "object",
      "properties": {},
      "description": "Covariance matrix for assets"
    },
    "objective": {
      "type": "string",
      "enum": [
        "max-sharpe",
        "min-variance",
        "max-return",
        "risk-budget",
        "custom"
      ],
      "description": "Optimization objective"
    },
    "constraints": {
      "type": "object",
      "properties": {},
      "description": "Portfolio constraints such as longOnly, maxWeight, and sectorCaps"
    },
    "views": {
      "type": "object",
      "properties": {},
      "description": "Market views for Black-Litterman"
    },
    "confidence": {
      "type": "object",
      "properties": {},
      "description": "Confidence in views"
    },
    "benchmark": {
      "type": "string",
      "description": "Benchmark symbol"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Scenario name"
          },
          "impact": {
            "type": "number",
            "description": "Scenario impact as a decimal"
          }
        },
        "description": "Stress-test scenario"
      },
      "description": "Scenarios for stress testing"
    },
    "confidenceLevel": {
      "type": "number",
      "description": "Confidence level for VaR (for example, 0.95)",
      "minimum": 0,
      "maximum": 1
    },
    "holdingPeriod": {
      "type": "number",
      "description": "Holding period in days",
      "minimum": 0
    },
    "volatility": {
      "type": "number",
      "description": "Portfolio volatility as a decimal",
      "minimum": 0
    },
    "riskFreeRate": {
      "type": "number",
      "description": "Risk-free rate as a decimal"
    },
    "currency": {
      "type": "string",
      "description": "Base currency"
    },
    "methods": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Risk methods to apply"
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Symbols to evaluate"
    },
    "criteria": {
      "type": "object",
      "properties": {},
      "description": "Evaluation criteria keyed by symbol"
    },
    "weights": {
      "type": "object",
      "properties": {},
      "description": "Criteria weights keyed by criterion name"
    },
    "peerGroup": {
      "type": "string",
      "description": "Peer group for comparison"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Portfolio analysis results including allocation, returns, VaR, and evaluation scores"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `research-planning`

**Name:** Research & Planning

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
        "search",
        "get-document",
        "get-analyst-estimates",
        "get-earnings-calendar",
        "get-esg-scores",
        "monitor-alerts",
        "create-plan",
        "update-plan",
        "run-projection",
        "tax-optimization",
        "estate-analysis",
        "retirement-readiness",
        "goal-tracking",
        "scenario-comparison"
      ],
      "description": "Action to perform"
    },
    "query": {
      "type": "string",
      "description": "Search query"
    },
    "symbol": {
      "type": "string",
      "description": "Stock symbol"
    },
    "documentId": {
      "type": "string",
      "description": "Document ID to retrieve"
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Document identifier"
          },
          "title": {
            "type": "string",
            "description": "Document title"
          },
          "type": {
            "type": "string",
            "description": "Document type"
          },
          "provider": {
            "type": "string",
            "description": "Document provider"
          },
          "date": {
            "type": "string",
            "description": "Document date"
          },
          "rating": {
            "type": "string",
            "description": "Document rating"
          },
          "summary": {
            "type": "string",
            "description": "Document summary"
          },
          "sector": {
            "type": "string",
            "description": "Document sector"
          }
        },
        "description": "Research document supplied by the caller"
      },
      "description": "Research documents supplied by the caller"
    },
    "filters": {
      "type": "object",
      "properties": {
        "dateRange": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string",
              "description": "Start date (ISO 8601)"
            },
            "end": {
              "type": "string",
              "description": "End date (ISO 8601)"
            }
          },
          "description": "Date range for research filters"
        },
        "provider": {
          "type": "string",
          "description": "Provider filter"
        },
        "documentType": {
          "type": "string",
          "description": "Document type filter"
        },
        "sector": {
          "type": "string",
          "description": "Sector filter"
        },
        "rating": {
          "type": "string",
          "description": "Rating filter"
        }
      },
      "description": "Filters for research queries"
    },
    "pagination": {
      "type": "object",
      "properties": {
        "page": {
          "type": "number",
          "description": "One-based page number",
          "minimum": 1
        },
        "limit": {
          "type": "number",
          "description": "Maximum results per page",
          "minimum": 1
        }
      },
      "description": "Pagination parameters. Applies to supplied documents; web results are bounded by maxResults."
    },
    "maxResults": {
      "type": "number",
      "description": "Maximum number of web results to request from the general web search tool (1-50)",
      "minimum": 1,
      "maximum": 50
    },
    "searchType": {
      "type": "string",
      "enum": [
        "web",
        "images",
        "news"
      ],
      "description": "Type of web search to run for the web portion of a search"
    },
    "freshness": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month",
        "year"
      ],
      "description": "Recency filter for the web portion of a search, applied by the search providers that honor one"
    },
    "clientProfile": {
      "type": "object",
      "properties": {
        "age": {
          "type": "number",
          "description": "Client age"
        },
        "income": {
          "type": "number",
          "description": "Annual income"
        },
        "expenses": {
          "type": "number",
          "description": "Annual expenses"
        },
        "assets": {
          "type": "object",
          "properties": {
            "total": {
              "type": "number",
              "description": "Total asset value"
            }
          },
          "description": "Assets breakdown"
        },
        "liabilities": {
          "type": "object",
          "properties": {},
          "description": "Liabilities breakdown"
        },
        "goals": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "description": "Goal name"
              },
              "target": {
                "type": "number",
                "description": "Goal target value"
              },
              "current": {
                "type": "number",
                "description": "Current goal value"
              },
              "dueDate": {
                "type": "string",
                "description": "Goal due date"
              }
            },
            "description": "Financial goal"
          },
          "description": "Financial goals"
        },
        "riskTolerance": {
          "type": "string",
          "description": "Risk tolerance"
        },
        "dependents": {
          "type": "number",
          "description": "Number of dependents"
        }
      },
      "description": "Client profile for financial planning"
    },
    "planId": {
      "type": "string",
      "description": "Existing plan ID to update"
    },
    "assumptions": {
      "type": "object",
      "properties": {
        "inflationRate": {
          "type": "number",
          "description": "Annual inflation rate as a decimal"
        },
        "marketReturn": {
          "type": "number",
          "description": "Annual market return as a decimal"
        },
        "retirementAge": {
          "type": "number",
          "description": "Target retirement age"
        },
        "withdrawalRate": {
          "type": "number",
          "description": "Withdrawal rate as a decimal"
        }
      },
      "description": "Planning assumptions supplied by the caller"
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Scenario name"
          },
          "portfolioValue": {
            "type": "number",
            "description": "Scenario portfolio value"
          },
          "successProbability": {
            "type": "number",
            "description": "Scenario success probability",
            "minimum": 0,
            "maximum": 1
          }
        },
        "description": "Projection scenario supplied by the caller"
      },
      "description": "Scenarios for projection"
    },
    "baseCase": {
      "type": "object",
      "properties": {},
      "description": "Base-case projection supplied by the caller"
    },
    "strategies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tax strategies supplied by the caller"
    },
    "estimatedSavings": {
      "type": "number",
      "description": "Estimated tax savings supplied by the caller"
    },
    "estateTaxExposure": {
      "type": "number",
      "description": "Estate tax exposure supplied by the caller"
    },
    "recommendedActions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Recommended actions supplied by the caller"
    },
    "readinessScore": {
      "type": "number",
      "description": "Retirement readiness score supplied by the caller",
      "minimum": 0,
      "maximum": 100
    },
    "gap": {
      "type": "number",
      "description": "Retirement funding gap supplied by the caller"
    },
    "recommendations": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Recommendations supplied by the caller"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Goal name"
          },
          "target": {
            "type": "number",
            "description": "Goal target value"
          },
          "current": {
            "type": "number",
            "description": "Current goal value"
          },
          "onTrack": {
            "type": "boolean",
            "description": "Whether the goal is on track"
          }
        },
        "description": "Goal record supplied by the caller"
      },
      "description": "Goal records supplied by the caller"
    },
    "startDate": {
      "type": "string",
      "description": "Calendar start date (ISO 8601)"
    },
    "endDate": {
      "type": "string",
      "description": "Calendar end date (ISO 8601)"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Research results, planning projections, and analysis records"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

#### `bill-pay-rebalancing`

**Name:** Bill Pay & Rebalancing Execution Proxy

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
        "track-obligations",
        "flag-fees",
        "stage-transfer",
        "rebalance",
        "calculate-drift"
      ],
      "description": "Action to perform"
    },
    "obligations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "Obligation description"
          },
          "dueDate": {
            "type": "string",
            "description": "Due date (ISO 8601)"
          },
          "amount": {
            "type": "number",
            "description": "Amount due",
            "minimum": 0
          },
          "category": {
            "type": "string",
            "description": "Category"
          }
        },
        "description": "Bill or obligation"
      },
      "description": "List of upcoming obligations"
    },
    "fees": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "Fee description"
          },
          "amount": {
            "type": "number",
            "description": "Fee amount",
            "minimum": 0
          },
          "date": {
            "type": "string",
            "description": "Fee date"
          },
          "source": {
            "type": "string",
            "description": "Fee source"
          }
        },
        "description": "Bank fee record"
      },
      "description": "List of recent fees"
    },
    "feeThreshold": {
      "type": "number",
      "description": "Minimum fee amount to flag",
      "minimum": 0
    },
    "rebalanceThreshold": {
      "type": "number",
      "description": "Absolute target-weight drift that requires rebalancing",
      "default": 0.05,
      "minimum": 0,
      "maximum": 1
    },
    "from": {
      "type": "string",
      "description": "Source account for transfer"
    },
    "to": {
      "type": "string",
      "description": "Destination account for transfer"
    },
    "amount": {
      "type": "number",
      "description": "Transfer amount",
      "minimum": 0
    },
    "purpose": {
      "type": "string",
      "description": "Purpose of transfer"
    },
    "holdings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Asset symbol"
          },
          "value": {
            "type": "number",
            "description": "Current value",
            "minimum": 0
          }
        },
        "description": "Holding"
      },
      "description": "Current portfolio holdings"
    },
    "targets": {
      "type": "object",
      "properties": {},
      "description": "Target allocation percentages by symbol"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Obligation tracking results, fee analysis, and staged transfer records"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/investment/index.ts)

### Legal

> Category source: `services/tool-executor/src/data/skills/legal/index.ts`

#### `contract-document-advisory`

**Name:** Contract & Document Advisory

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
      "type": "string",
      "description": "Full text of the contract to review"
    },
    "contractType": {
      "type": "string",
      "description": "Type of contract (e.g., employment, NDA, service agreement, general)"
    },
    "jurisdiction": {
      "type": "string",
      "description": "Applicable legal jurisdiction (e.g., US, CA, NY, EU)"
    }
  },
  "required": [
    "contractText"
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
    "data": {
      "type": "object",
      "properties": {
        "review": {
          "type": "object"
        },
        "storePath": {
          "type": "string"
        },
        "issueCount": {
          "type": "number"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `legal-research`

**Name:** Legal Research

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
      "description": "Search query or question for legal research"
    },
    "jurisdiction": {
      "type": "string",
      "description": "Legal jurisdiction to search (e.g., US, CA, NY, EU, UK)"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date (ISO 8601)"
        },
        "end": {
          "type": "string",
          "description": "End date (ISO 8601)"
        }
      },
      "description": "Date range filter for results"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Specific sources to search (e.g., statutes, cases, regulations)"
    },
    "maxResults": {
      "type": "integer",
      "description": "Maximum number of results to return",
      "minimum": 1,
      "maximum": 50,
      "default": 10
    },
    "searchType": {
      "type": "string",
      "enum": [
        "web",
        "images",
        "news"
      ],
      "description": "Type of web search to run",
      "default": "web"
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
    "status": {
      "type": "string"
    },
    "connected": {
      "type": "boolean"
    },
    "data": {
      "type": "object",
      "properties": {
        "research": {
          "type": "object"
        },
        "storePath": {
          "type": "string"
        },
        "resultCount": {
          "type": "number"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `matter-document-ops`

**Name:** Matter & Document Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "Matter & Document Ops system base URL"
    },
    "accessToken": {
      "type": "string",
      "description": "Bearer access token"
    },
    "workspaceId": {
      "type": "string",
      "description": "Default workspace or firm identifier"
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
    "matterId": {
      "type": "string",
      "description": "Matter or case identifier"
    },
    "caseId": {
      "type": "string",
      "description": "Case identifier for case management operations"
    },
    "caseData": {
      "type": "object",
      "description": "Case data object for create/update operations"
    },
    "documentId": {
      "type": "string",
      "description": "Document identifier for tagging operations"
    },
    "content": {
      "type": "string",
      "description": "Document content or text to analyze for tagging"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags to apply or consider for document tagging"
    },
    "taxonomy": {
      "type": "string",
      "description": "Taxonomy or tag set for document classification"
    },
    "custodians": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of custodians for collection or search"
    },
    "searchTerms": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Search terms for eDiscovery"
    },
    "dateRange": {
      "type": "object",
      "description": "Date range for operations (e.g., { start: \"2023-01-01\", end: \"2023-12-31\" })"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
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
    "success": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "description": "Outcome status (e.g., completed, dry-run, error, not-connected)"
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
    "status",
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/legal/index.ts)

#### `compliance-tracking`

**Name:** Compliance Tracking

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
    "documentText": {
      "type": "string",
      "description": "Text of the document to check for compliance"
    },
    "regulation": {
      "type": "string",
      "enum": [
        "GDPR",
        "HIPAA",
        "SOX",
        "PCI-DSS",
        "FERPA"
      ],
      "description": "Regulation or standard to check against (e.g., GDPR, HIPAA, SOX)"
    },
    "jurisdiction": {
      "type": "string",
      "description": "Regulatory jurisdiction to check (e.g., US, EU, CA)"
    },
    "effectiveDate": {
      "type": "string",
      "description": "Effective date for compliance check (ISO 8601 format)"
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
    "data": {
      "type": "object",
      "properties": {
        "report": {
          "type": "object"
        },
        "storePath": {
          "type": "string"
        },
        "violationCount": {
          "type": "number"
        }
      }
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
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
      "type": "string",
      "description": "Name or description of the product being marketed"
    },
    "budget": {
      "type": "number",
      "description": "Total budget allocated for the campaign in currency units"
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of marketing channels to use (e.g., email, social, search, display)"
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
    "campaign": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
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
        },
        "timeline": {
          "type": "array"
        },
        "kpis": {
          "type": "array"
        },
        "createdAt": {
          "type": "string"
        },
        "source": {
          "type": "string"
        }
      }
    },
    "storePath": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "campaign",
    "storePath"
  ]
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
    "campaign": {
      "type": "string",
      "description": "Unique identifier of the campaign to analyze"
    },
    "metrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of metric names to evaluate (e.g., impressions, clicks, conversions, ROI)"
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
    "analysis": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "campaignId": {
          "type": "string"
        },
        "metrics": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "results": {
          "type": "object"
        },
        "createdAt": {
          "type": "string"
        },
        "source": {
          "type": "string"
        }
      }
    },
    "storePath": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "analysis",
    "storePath"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/marketing/index.ts)

#### `marketing-center`

**Name:** Marketing Center

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
    "targetChannel": {
      "type": "string",
      "enum": [
        "content-generation",
        "social-media",
        "email",
        "seo",
        "market-research",
        "audience-insights",
        "document-management"
      ],
      "description": "Which marketing channel to dispatch to"
    },
    "data": {
      "type": "object",
      "description": "Parameters forwarded to the selected marketing channel"
    }
  },
  "required": [
    "targetChannel"
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
    "system": {
      "type": "string"
    },
    "action": {
      "type": "string"
    },
    "result": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "system",
    "action"
  ]
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
    },
    "contentModels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Available content models/fields"
    },
    "brandGuidelines": {
      "type": "object",
      "description": "Brand guidelines configuration"
    },
    "approvalWorkflow": {
      "type": "object",
      "description": "Content approval workflow configuration"
    },
    "publishingCalendar": {
      "type": "string",
      "description": "Publishing calendar identifier"
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
    "contentType": {
      "type": "string",
      "description": "Type of content (e.g., blog, landing-page, ad-copy, email)"
    },
    "title": {
      "type": "string",
      "description": "Content title or headline"
    },
    "body": {
      "type": "string",
      "description": "Full content body text"
    },
    "content": {
      "type": "string",
      "description": "Alternative field for content body"
    },
    "topic": {
      "type": "string",
      "description": "Main topic or subject of the content"
    },
    "audience": {
      "type": "string",
      "description": "Target audience description"
    },
    "tone": {
      "type": "string",
      "description": "Desired tone of voice (e.g., professional, casual, persuasive)"
    },
    "locale": {
      "type": "string",
      "description": "Content locale/language code"
    },
    "campaign": {
      "type": "string",
      "description": "Associated campaign identifier"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "platformConfigs": {
      "type": "object",
      "description": "Platform-specific configurations"
    },
    "contentLibrary": {
      "type": "object",
      "description": "Content library configuration"
    },
    "engagementRules": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Engagement rules and policies"
    },
    "analyticsIntegration": {
      "type": "object",
      "description": "Analytics integration settings"
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
    "platform": {
      "type": "string",
      "description": "Target social platform (e.g., linkedin, x, facebook, instagram, tiktok)"
    },
    "content": {
      "type": "string",
      "description": "Post content/text"
    },
    "message": {
      "type": "string",
      "description": "Alternative field for post content"
    },
    "campaign": {
      "type": "string",
      "description": "Associated campaign identifier"
    },
    "scheduledAt": {
      "type": "string",
      "description": "ISO timestamp for scheduled publishing"
    },
    "media": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Array of media attachments (images, videos)"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "keywordDatabase": {
      "type": "object",
      "description": "Keyword database configuration"
    },
    "competitorTracking": {
      "type": "object",
      "description": "Competitor tracking settings"
    },
    "technicalAuditConfig": {
      "type": "object",
      "description": "Technical SEO audit configuration"
    },
    "rankingRules": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Ranking rule definitions"
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
    "url": {
      "type": "string",
      "description": "Target URL for SEO analysis or optimization"
    },
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of target keywords"
    },
    "content": {
      "type": "string",
      "description": "Content to optimize or analyze"
    },
    "market": {
      "type": "string",
      "description": "Target market/region (e.g., US, UK, global)"
    },
    "searchEngine": {
      "type": "string",
      "description": "Target search engine (e.g., google, bing, yandex)"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "researchMethodologies": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Available research methodologies"
    },
    "dataSources": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Configured data sources"
    },
    "trendModels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Trend analysis models"
    },
    "reportTemplates": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Available report templates"
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
      "type": "string",
      "description": "Research query or topic"
    },
    "market": {
      "type": "string",
      "description": "Target market/region to research"
    },
    "competitors": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of competitor names or domains to analyze"
    },
    "dateRange": {
      "type": "object",
      "description": "Date range for research (e.g., { start: \"2024-01-01\", end: \"2024-12-31\" })"
    },
    "filters": {
      "type": "object",
      "description": "Additional filters for the research query"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "segmentationModels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Available segmentation models"
    },
    "behaviorPredictors": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Behavior predictor configurations"
    },
    "privacyControls": {
      "type": "object",
      "description": "Privacy and compliance controls"
    },
    "enrichmentSources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Data enrichment sources"
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
    "audienceId": {
      "type": "string",
      "description": "Identifier of the audience segment to analyze"
    },
    "demographics": {
      "type": "object",
      "description": "Demographic filters (age, gender, location, income, etc.)"
    },
    "behaviors": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Behavioral signals to analyze (purchases, page views, engagement)"
    },
    "campaign": {
      "type": "string",
      "description": "Associated campaign identifier for response analysis"
    },
    "dateRange": {
      "type": "object",
      "description": "Date range for analysis (e.g., { start: \"2024-01-01\", end: \"2024-12-31\" })"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "deliverabilityConfig": {
      "type": "object",
      "description": "Email deliverability configuration"
    },
    "automationWorkflows": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Email automation workflows"
    },
    "abTestFramework": {
      "type": "object",
      "description": "A/B testing framework settings"
    },
    "complianceRules": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Email compliance rules (e.g., CAN-SPAM, GDPR)"
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
    "to": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Recipient email addresses"
    },
    "subject": {
      "type": "string",
      "description": "Email subject line"
    },
    "htmlBody": {
      "type": "string",
      "description": "HTML email body content"
    },
    "textBody": {
      "type": "string",
      "description": "Plain text email body content"
    },
    "templateId": {
      "type": "string",
      "description": "Pre-defined email template identifier"
    },
    "templateData": {
      "type": "object",
      "description": "Data variables for template rendering"
    },
    "campaign": {
      "type": "string",
      "description": "Associated campaign identifier"
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Email attachments metadata"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
    },
    "assetTaxonomy": {
      "type": "object",
      "description": "Asset classification taxonomy"
    },
    "versionControl": {
      "type": "object",
      "description": "Version control settings"
    },
    "rightsManagement": {
      "type": "object",
      "description": "Digital rights management settings"
    },
    "collaborationWorkflows": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Collaboration workflow definitions"
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
    "document": {
      "type": "object",
      "description": "Document object to create or update"
    },
    "documentId": {
      "type": "string",
      "description": "Unique identifier of the document"
    },
    "folderId": {
      "type": "string",
      "description": "Target folder identifier"
    },
    "name": {
      "type": "string",
      "description": "Document name or title"
    },
    "contentType": {
      "type": "string",
      "description": "MIME type or content type of the document"
    },
    "dryRun": {
      "type": "boolean",
      "description": "If true, simulate the operation without making changes"
    }
  },
  "required": []
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
    "status": {
      "type": "string",
      "enum": [
        "success",
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
    "status",
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
      "type": "string",
      "description": "Roadmap quarter (e.g., Q1 2026)"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string",
            "description": "Goal description"
          },
          "priority": {
            "type": "string",
            "enum": [
              "high",
              "medium",
              "low"
            ],
            "description": "Goal priority"
          },
          "owner": {
            "type": "string",
            "description": "Goal owner"
          },
          "reach": {
            "type": "number",
            "description": "RICE reach estimate (users affected)"
          },
          "impact": {
            "type": "number",
            "description": "RICE impact (0.25-3 scale)"
          },
          "confidence": {
            "type": "number",
            "description": "RICE confidence (0-1)"
          },
          "effort": {
            "type": "number",
            "description": "RICE effort (person-weeks)"
          }
        }
      },
      "description": "Business/product goals to prioritize"
    },
    "initiatives": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string",
            "description": "Initiative name"
          },
          "goals": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Goals this initiative supports"
          },
          "effort": {
            "type": "number",
            "description": "Estimated effort in person-weeks"
          },
          "dependencies": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Initiative IDs this depends on"
          },
          "risk": {
            "type": "number",
            "description": "Risk score (0-1)"
          }
        }
      },
      "description": "Initiatives to sequence and schedule"
    },
    "themes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Strategic themes to allocate across"
    },
    "timeHorizon": {
      "type": "number",
      "description": "Number of quarters to plan"
    },
    "capacity": {
      "type": "number",
      "description": "Team size (capacity per quarter)"
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
      "type": "boolean",
      "description": "Whether the roadmap was generated"
    },
    "roadmap": {
      "type": "object",
      "description": "Generated roadmap with RICE-scored goals, sequenced initiatives, capacity plan, milestones, risks, OKRs, and themes"
    },
    "okrs": {
      "type": "array",
      "description": "OKR objects aligned to each goal"
    },
    "metrics": {
      "type": "object",
      "description": "Summary metrics"
    }
  },
  "required": [
    "success",
    "roadmap"
  ]
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
      "type": "string",
      "description": "Title of the PRD"
    },
    "problem": {
      "type": "string",
      "description": "Problem statement describing the user or business need"
    },
    "scope": {
      "type": "string",
      "description": "Scope and boundaries of the product or feature"
    },
    "goals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Goals the product should achieve"
    },
    "successMetrics": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Measurable indicators of success"
    },
    "nonGoals": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Items explicitly excluded"
    },
    "openQuestions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Unresolved questions needing follow-up"
    },
    "targetUsers": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Target user personas"
    },
    "userStories": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Existing user stories"
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Technical or business constraints"
    },
    "assumptions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Assumptions made"
    },
    "risks": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Identified risks"
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
      "type": "boolean",
      "description": "Whether the PRD was generated"
    },
    "prd": {
      "type": "object",
      "description": "The structured PRD with all sections, stories, criteria, requirements, data model, UX, and rollout plan"
    },
    "userStories": {
      "type": "array",
      "description": "Generated INVEST user stories with acceptance criteria"
    },
    "acceptanceCriteria": {
      "type": "array",
      "description": "Given/When/Then acceptance criteria"
    },
    "rolloutPlan": {
      "type": "object",
      "description": "Phased rollout with feature flags and rollback"
    }
  },
  "required": [
    "success",
    "prd"
  ]
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
    },
    "workflowSchemes": {
      "type": "object",
      "description": "Jira workflow scheme mappings"
    },
    "customFields": {
      "type": "object",
      "description": "Custom field configurations"
    },
    "automationRules": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Automation rule definitions"
    },
    "permissionSchemes": {
      "type": "object",
      "description": "Permission scheme assignments"
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
    "projectKey": {
      "type": "string",
      "description": "Jira project key"
    },
    "issueType": {
      "type": "string",
      "description": "Jira issue type (for example, Bug, Task, or Story)"
    },
    "summary": {
      "type": "string",
      "description": "Issue summary or title"
    },
    "description": {
      "type": "string",
      "description": "Issue description"
    },
    "issueId": {
      "type": "string",
      "description": "Jira issue ID or key to update or retrieve"
    },
    "fields": {
      "type": "object",
      "description": "Additional Jira issue fields as key-value pairs"
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
    "status": {
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
    "status",
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
    },
    "pageTemplates": {
      "type": "object",
      "description": "Confluence page templates"
    },
    "blueprints": {
      "type": "object",
      "description": "Confluence blueprint configurations"
    },
    "macroConfigs": {
      "type": "object",
      "description": "Macro configuration settings"
    },
    "spacePermissions": {
      "type": "object",
      "description": "Space permission rules"
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
    "spaceKey": {
      "type": "string",
      "description": "Confluence space key"
    },
    "title": {
      "type": "string",
      "description": "Page title"
    },
    "body": {
      "type": "string",
      "description": "Page body content in the specified representation format"
    },
    "pageId": {
      "type": "string",
      "description": "Confluence page ID to update or retrieve"
    },
    "ancestorId": {
      "type": "string",
      "description": "Parent page ID for page hierarchy"
    },
    "representation": {
      "type": "string",
      "enum": [
        "storage",
        "wiki",
        "markdown"
      ],
      "description": "Storage format representation (storage, wiki, or markdown)"
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
    "status": {
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
    "status",
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
    },
    "cohortDefinitions": {
      "type": "object",
      "description": "Cohort analysis definitions"
    },
    "retentionModels": {
      "type": "object",
      "description": "Retention model configurations"
    },
    "funnelTemplates": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Funnel analysis templates"
    },
    "alertConfigs": {
      "type": "object",
      "description": "Alert configuration settings"
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
      },
      "description": "Dimensions to group the metric by"
    },
    "filters": {
      "type": "object",
      "description": "Filter conditions as key-value pairs"
    },
    "startDate": {
      "type": "string",
      "description": "Start date for the analysis period (ISO 8601)"
    },
    "endDate": {
      "type": "string",
      "description": "End date for the analysis period (ISO 8601)"
    },
    "granularity": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month",
        "quarter"
      ],
      "description": "Time granularity for the analysis"
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
    "status": {
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
    "status",
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
    },
    "botScopes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Bot scope permissions"
    },
    "channelTemplates": {
      "type": "object",
      "description": "Channel template configurations"
    },
    "notificationRules": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Notification rule definitions"
    },
    "commandRegistry": {
      "type": "object",
      "description": "Slash command registry"
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
    "channel": {
      "type": "string",
      "description": "Channel ID or name to post to or interact with"
    },
    "text": {
      "type": "string",
      "description": "Message text content"
    },
    "ts": {
      "type": "string",
      "description": "Message timestamp (for updateMessage or deleteMessage)"
    },
    "channelName": {
      "type": "string",
      "description": "Name for new channel (for createChannel)"
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
    "status": {
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
    "status",
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
    },
    "recurrenceRules": {
      "type": "object",
      "description": "Recurrence rule definitions"
    },
    "reminderConfigs": {
      "type": "object",
      "description": "Reminder configuration settings"
    },
    "timezoneHandling": {
      "type": "string",
      "description": "Timezone handling mode"
    },
    "syncProviders": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Enabled sync providers"
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
    "summary": {
      "type": "string",
      "description": "Event summary or title"
    },
    "description": {
      "type": "string",
      "description": "Event description"
    },
    "startTime": {
      "type": "string",
      "description": "Event start time (ISO 8601)"
    },
    "endTime": {
      "type": "string",
      "description": "Event end time (ISO 8601)"
    },
    "attendees": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of attendee email addresses"
    },
    "calendarId": {
      "type": "string",
      "description": "Calendar ID to schedule against"
    },
    "event": {
      "type": "string",
      "description": "Event ID to update or delete"
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
    "status": {
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
    "status",
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
    },
    "parserPlugins": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Parser plugin names"
    },
    "outputSchemas": {
      "type": "object",
      "description": "Output schema definitions"
    },
    "sectionRules": {
      "type": "object",
      "description": "Section extraction rules"
    },
    "linkResolvers": {
      "type": "object",
      "description": "Link resolution configurations"
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
      },
      "description": "Section names to extract from the document"
    },
    "format": {
      "type": "string",
      "enum": [
        "json",
        "yaml",
        "html"
      ],
      "description": "Output format for the parsed document"
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
    "status": {
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
    "status",
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

#### `restaurant-menu-engineering-cost-strategist`

**Name:** Restaurant Menu Engineering & Cost Strategist

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before applying menu changes",
      "default": false
    },
    "defaultTargetMargin": {
      "type": "number",
      "description": "Default target margin for pricing",
      "default": 0.7
    },
    "lowMenuHighlightThreshold": {
      "type": "number",
      "description": "Score threshold below which items are flagged",
      "default": 30
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "itemIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Menu item identifiers"
    },
    "popularity": {
      "type": "object",
      "properties": {},
      "description": "Popularity scores by item id (0-100)"
    },
    "profitability": {
      "type": "object",
      "properties": {},
      "description": "Profitability ratios by item id (0-1)"
    },
    "ingredientCosts": {
      "type": "object",
      "properties": {},
      "description": "Ingredient costs by name"
    },
    "sellingPrice": {
      "type": "number",
      "description": "Current selling price"
    },
    "targetFoodCostPct": {
      "type": "number",
      "description": "Target food cost percentage",
      "default": 30
    },
    "targetMargin": {
      "type": "number",
      "description": "Target profit margin (0-1)",
      "default": 0.7
    },
    "competitorPrices": {
      "type": "object",
      "properties": {},
      "description": "Competitor prices by item id"
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Item identifier"
          }
        }
      },
      "description": "Menu items with id and revenue"
    },
    "categories": {
      "type": "object",
      "properties": {},
      "description": "Category assignments by item id"
    },
    "quantities": {
      "type": "object",
      "properties": {},
      "description": "Ingredient quantities by name"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Menu items with quadrant classification, food cost, margin, score, and low-performing recommendations"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-shift-prep-list-copilot`

**Name:** Restaurant Shift Prep List Copilot

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before submitting prep orders",
      "default": false
    },
    "defaultShift": {
      "type": "string",
      "description": "Default shift for prep generation",
      "default": "all"
    },
    "autoReorderThreshold": {
      "type": "number",
      "description": "Auto-reorder when shortage exceeds this value",
      "default": 0
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "Date (YYYY-MM-DD)"
    },
    "forecastCovers": {
      "type": "number",
      "description": "Forecasted number of covers"
    },
    "prepRatios": {
      "type": "object",
      "properties": {},
      "description": "Prep quantity ratio per cover by item name"
    },
    "currentStock": {
      "type": "object",
      "properties": {},
      "description": "Current stock levels by item name"
    },
    "shift": {
      "type": "string",
      "enum": [
        "breakfast",
        "lunch",
        "dinner",
        "all"
      ],
      "description": "Shift name",
      "default": "all"
    },
    "openCovers": {
      "type": "number",
      "description": "Expected open covers for allocation"
    },
    "serviceDuration": {
      "type": "number",
      "description": "Service duration in minutes",
      "default": 90
    },
    "staffPerCover": {
      "type": "number",
      "description": "Staff required per cover",
      "default": 0.2
    },
    "availableStaff": {
      "type": "number",
      "description": "Available staff count"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Prep items with quantities, shortages, order quantities, and totals"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-reservations-guest-profile-manager`

**Name:** Restaurant Reservations & Guest Profile Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before executing live reservation actions",
      "default": true
    },
    "defaultPartySize": {
      "type": "number",
      "description": "Default party size for new reservations",
      "default": 2
    },
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Reservation system endpoint URL"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "guestId": {
      "type": "string",
      "description": "Guest identifier"
    },
    "name": {
      "type": "string",
      "description": "Guest full name"
    },
    "phone": {
      "type": "string",
      "description": "Guest phone number"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Guest email"
    },
    "preferences": {
      "type": "object",
      "properties": {},
      "description": "Guest preferences (dietary, seating, etc.)"
    },
    "reservationId": {
      "type": "string",
      "description": "Reservation identifier"
    },
    "date": {
      "type": "string",
      "description": "Reservation date (YYYY-MM-DD)"
    },
    "partySize": {
      "type": "number",
      "description": "Number of guests"
    },
    "tableId": {
      "type": "string",
      "description": "Table assignment"
    },
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "confirmed",
        "cancelled",
        "no-show"
      ],
      "description": "Reservation status"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Run in dry-run mode without executing",
      "default": true
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation for live endpoint",
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Guest profile or reservation record"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-supply-chain-inventory-reorder-manager`

**Name:** Restaurant Supply Chain & Inventory Reorder Manager

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before placing live reorder orders",
      "default": true
    },
    "defaultLeadTime": {
      "type": "number",
      "description": "Default lead time in days",
      "default": 2
    },
    "defaultSafetyStockPct": {
      "type": "number",
      "description": "Default safety stock as percentage of reorder point",
      "default": 25
    },
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Supply chain system endpoint URL"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Item name"
          },
          "quantity": {
            "type": "number",
            "description": "Current quantity on hand"
          }
        }
      },
      "description": "Inventory items to evaluate for reorder"
    },
    "reorderPoints": {
      "type": "object",
      "properties": {},
      "description": "Reorder point by item name"
    },
    "safetyStock": {
      "type": "object",
      "properties": {},
      "description": "Safety stock by item name"
    },
    "leadTimes": {
      "type": "object",
      "properties": {},
      "description": "Lead time in days by item name"
    },
    "unitCosts": {
      "type": "object",
      "properties": {},
      "description": "Unit cost by item name"
    },
    "name": {
      "type": "string",
      "description": "Item name for EOQ calculation"
    },
    "annualDemand": {
      "type": "number",
      "description": "Annual demand quantity for EOQ"
    },
    "orderCost": {
      "type": "number",
      "description": "Cost per order for EOQ",
      "default": 50
    },
    "holdingCost": {
      "type": "number",
      "description": "Holding cost per unit per year for EOQ",
      "default": 2
    },
    "supplierIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Supplier identifiers for status check"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Run in dry-run mode without executing",
      "default": true
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation for live endpoint",
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
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Reorder items with quantities, reorder points, safety stock, lead time demand, and summary"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

#### `restaurant-financial-forecast-evaluator`

**Name:** Restaurant Financial Performance & Demand Forecast Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before applying forecast-driven changes",
      "default": false
    },
    "forecastHorizonDays": {
      "type": "number",
      "description": "Default forecast horizon in days",
      "default": 12
    },
    "varianceThresholdPercent": {
      "type": "number",
      "description": "Default variance threshold as a percentage (e.g., 10 = 10%)",
      "default": 10
    },
    "highVarianceAlertThreshold": {
      "type": "number",
      "description": "Number of high-variance periods before alert",
      "default": 3
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date (YYYY-MM-DD)"
        },
        "end": {
          "type": "string",
          "description": "End date (YYYY-MM-DD)"
        }
      },
      "description": "Date range for financial analysis"
    },
    "forecastHorizon": {
      "type": "number",
      "description": "Number of periods to forecast (weeks/months)",
      "default": 12
    },
    "varianceThreshold": {
      "type": "number",
      "description": "Variance threshold as decimal (e.g., 0.1 = 10%)",
      "default": 0.1
    },
    "revenue": {
      "type": "number",
      "description": "Current revenue (optional, can be sourced from financial analytics)"
    },
    "cogs": {
      "type": "number",
      "description": "Current cost of goods sold (optional)"
    },
    "laborCost": {
      "type": "number",
      "description": "Current labor cost (optional)"
    },
    "netProfit": {
      "type": "number",
      "description": "Current net profit (optional)"
    },
    "menuId": {
      "type": "string",
      "description": "Menu identifier for engineering analysis"
    },
    "itemIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Menu item identifiers"
    },
    "popularity": {
      "type": "object",
      "properties": {},
      "description": "Item popularity scores (0-100)"
    },
    "profitability": {
      "type": "object",
      "properties": {},
      "description": "Item profitability ratios (0-1)"
    },
    "inventoryItems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {}
      },
      "description": "Inventory items for supply chain analysis"
    },
    "reorderPoints": {
      "type": "object",
      "properties": {},
      "description": "Reorder point by item name"
    },
    "safetyStock": {
      "type": "object",
      "properties": {},
      "description": "Safety stock by item name"
    },
    "leadTimes": {
      "type": "object",
      "properties": {},
      "description": "Lead time in days by item name"
    },
    "unitCosts": {
      "type": "object",
      "properties": {},
      "description": "Unit cost by item name"
    },
    "date": {
      "type": "string",
      "description": "Forecast date (YYYY-MM-DD)"
    },
    "timeRange": {
      "type": "string",
      "description": "Time range for demand forecast (e.g., 7d, 30d)"
    },
    "metric": {
      "type": "string",
      "description": "Demand metric (covers, revenue, etc.)"
    },
    "forecastCovers": {
      "type": "number",
      "description": "Forecasted number of covers for prep"
    },
    "prepRatios": {
      "type": "object",
      "properties": {},
      "description": "Prep quantity ratio per cover by item name"
    },
    "currentStock": {
      "type": "object",
      "properties": {},
      "description": "Current stock levels by item name"
    },
    "shift": {
      "type": "string",
      "enum": [
        "breakfast",
        "lunch",
        "dinner",
        "all"
      ],
      "description": "Shift name",
      "default": "all"
    },
    "accountIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Account identifiers for variance analysis"
    },
    "comparisonPeriod": {
      "type": "string",
      "description": "Comparison period identifier"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Forecast result data including P&L, variance, demand projections, delegation coverage, and step results"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/restaurant/index.ts)

### Sales

> Category source: `services/tool-executor/src/data/skills/sales/index.ts`

#### `lead-deal-advisory`

**Name:** Lead & Deal Advisory

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "salesHome": {
      "type": "string",
      "description": "Directory used to persist scored leads; defaults to SALES_HOME"
    },
    "defaultThreshold": {
      "type": "number",
      "description": "Default qualification threshold",
      "default": 50
    },
    "defaultHotThreshold": {
      "type": "number",
      "description": "Default hot-lead threshold",
      "default": 70
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "leads": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Lead identifier"
          },
          "name": {
            "type": "string",
            "description": "Lead name"
          },
          "company": {
            "type": "string",
            "description": "Company name"
          },
          "title": {
            "type": "string",
            "description": "Lead title or seniority"
          },
          "industry": {
            "type": "string",
            "description": "Lead industry"
          },
          "companySize": {
            "type": "string",
            "description": "Company size tier"
          },
          "annualRevenue": {
            "type": "number",
            "description": "Annual revenue"
          },
          "engagement": {
            "type": "object",
            "properties": {},
            "description": "Engagement signals; recognized keys: emailOpened, emailClicked, linkClicked, demoBooked, contentDownloaded, webinarAttended",
            "additionalProperties": true
          },
          "behavioral": {
            "type": "object",
            "properties": {},
            "description": "Behavioral signals: pageVisits7d, productPageVisits, pricingVisited, competitorVisited, daysSinceLastEngagement",
            "additionalProperties": true
          }
        },
        "description": "Lead scoring input"
      },
      "description": "Lead records to score; at least one is required"
    },
    "weights": {
      "type": "object",
      "properties": {
        "demographic": {
          "type": "number",
          "description": "Weight for demographic signals"
        },
        "firmographic": {
          "type": "number",
          "description": "Weight for firmographic signals"
        },
        "engagement": {
          "type": "number",
          "description": "Weight for engagement signals"
        },
        "behavioral": {
          "type": "number",
          "description": "Weight for behavioral signals"
        }
      },
      "description": "Weight configuration for scoring dimensions; defaults to 0.3/0.25/0.25/0.2"
    },
    "threshold": {
      "type": "number",
      "description": "Minimum score to be considered qualified (default: 50)",
      "default": 50
    },
    "hotThreshold": {
      "type": "number",
      "description": "Minimum score to be considered hot (default: 70)",
      "default": 70
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Ranked scored leads with per-signal rationale, coverage, and category counts"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `outreach-drafting`

**Name:** Outreach Drafting

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "salesHome": {
      "type": "string",
      "description": "Directory used to persist drafts; defaults to SALES_HOME"
    },
    "defaultSequenceDelay": {
      "type": "number",
      "description": "Default hours between sequence steps",
      "default": 48
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "recipient": {
      "type": "object",
      "properties": {
        "firstName": {
          "type": "string",
          "description": "Recipient first name; required"
        },
        "lastName": {
          "type": "string",
          "description": "Recipient last name"
        },
        "company": {
          "type": "string",
          "description": "Recipient company; required"
        },
        "industry": {
          "type": "string",
          "description": "Recipient industry"
        },
        "title": {
          "type": "string",
          "description": "Recipient job title"
        },
        "email": {
          "type": "string",
          "format": "email",
          "description": "Recipient email address"
        }
      },
      "description": "Intended recipient of the outreach"
    },
    "template": {
      "type": "string",
      "enum": [
        "cold",
        "followup",
        "nurture"
      ],
      "description": "Primary template to use",
      "default": "cold"
    },
    "customTemplate": {
      "type": "string",
      "description": "Custom body using {variable} placeholders; rendered only when every variable is supplied",
      "multiline": true
    },
    "subject": {
      "type": "string",
      "description": "Override the subject line for the first step"
    },
    "variables": {
      "type": "object",
      "properties": {
        "valueProp": {
          "type": "string",
          "description": "What you help the recipient do; required for cold and follow-up"
        },
        "myCompany": {
          "type": "string",
          "description": "Your company name; required for cold"
        },
        "myName": {
          "type": "string",
          "description": "Your name; used as the sign-off"
        },
        "topic": {
          "type": "string",
          "description": "Topic or resource name; required for nurture"
        }
      },
      "description": "Values used to render the templates"
    },
    "sequence": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Ordered template keys to draft as a multi-step sequence"
    },
    "sequenceDelay": {
      "type": "number",
      "description": "Hours between sequence steps",
      "default": 48
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "linkedin",
        "sms"
      ],
      "description": "Outreach channel",
      "default": "email"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Drafted messages with subject variants, skipped templates, and coverage of supplied values"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

#### `pipeline-ops`

**Name:** Pipeline Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "endpointUrl": {
      "type": "string",
      "format": "uri",
      "description": "Pipeline endpoint URL; may also be supplied at runtime through SALES_PIPELINE_ENDPOINT"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "API key for the pipeline endpoint"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before a live pipeline write",
      "default": true
    },
    "defaultDryRun": {
      "type": "boolean",
      "description": "Default pipeline operations to dry-run",
      "default": true
    },
    "crmProvider": {
      "type": "string",
      "enum": [
        "salesforce",
        "hubspot",
        "pipedrive",
        "custom"
      ],
      "description": "Default CRM provider"
    },
    "calendarProvider": {
      "type": "string",
      "enum": [
        "google",
        "outlook",
        "calendly",
        "custom"
      ],
      "description": "Default calendar provider"
    },
    "documentProvider": {
      "type": "string",
      "enum": [
        "pandadoc",
        "proposify",
        "quoter",
        "custom"
      ],
      "description": "Default document management provider"
    },
    "defaultOwnerId": {
      "type": "string",
      "description": "Default CRM owner ID for records"
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute",
      "default": 60
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "endpoint": {
      "type": "string",
      "format": "uri",
      "description": "Optional pipeline endpoint override for this call"
    },
    "apiKey": {
      "type": "string",
      "sensitive": true,
      "format": "password",
      "description": "Optional API key override for the pipeline endpoint"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Stage the request without sending it; defaults to true",
      "default": true
    },
    "confirmation": {
      "type": "boolean",
      "description": "Explicit approval for a live pipeline write; required when dryRun is false",
      "default": false
    },
    "entity": {
      "type": "string",
      "enum": [
        "lead",
        "contact",
        "account",
        "opportunity",
        "activity",
        "event",
        "document"
      ],
      "description": "Entity type for the operation"
    },
    "entityId": {
      "type": "string",
      "description": "Unique identifier of the entity"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Data payload for the operation",
      "additionalProperties": true
    },
    "subject": {
      "type": "string",
      "description": "Email or document subject"
    },
    "startTime": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 start time for calendar events"
    },
    "endTime": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 end time for calendar events"
    },
    "duration": {
      "type": "number",
      "description": "Event duration in minutes"
    },
    "attendees": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Attendee email addresses"
    },
    "meetingType": {
      "type": "string",
      "enum": [
        "discovery",
        "demo",
        "proposal",
        "followup",
        "negotiation"
      ],
      "description": "Type of sales meeting"
    },
    "lineItems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "Line item description"
          },
          "quantity": {
            "type": "number",
            "description": "Line item quantity"
          },
          "unitPrice": {
            "type": "number",
            "description": "Line item unit price"
          }
        },
        "description": "Line item for a proposal or quote"
      },
      "description": "Line items for proposals and quotes; the total is derived from these"
    },
    "totalAmount": {
      "type": "number",
      "description": "Stated total, cross-checked against the line items"
    },
    "validUntil": {
      "type": "string",
      "format": "date-time",
      "description": "Expiration date for proposals (ISO 8601)"
    },
    "leadId": {
      "type": "string",
      "description": "Associated lead identifier"
    },
    "opportunityId": {
      "type": "string",
      "description": "Associated opportunity identifier"
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
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error"
    },
    "data": {
      "type": "object",
      "description": "Staged or sent operation, derived totals, and whether anything was actually sent"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sales/index.ts)

### Sports Wager Advisor

> Category source: `services/tool-executor/src/data/skills/sports/index.ts`

#### `sports-tactical-roster-evaluator`

**Name:** Tactical & Roster Strategy Evaluator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dataProvider": {
      "type": "string",
      "enum": [
        "statsperform",
        "opta",
        "both"
      ],
      "description": "Sports data API provider",
      "default": "both"
    },
    "telemetryEnabled": {
      "type": "boolean",
      "description": "Use wearable telemetry feeds",
      "default": true
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "string",
      "description": "Team or player identifier for tactical evaluation"
    },
    "opponent": {
      "type": "string",
      "description": "Opponent team identifier for matchup analysis"
    },
    "sport": {
      "type": "string",
      "description": "Sport context (basketball, football, soccer, etc.)"
    },
    "timeframe": {
      "type": "string",
      "enum": [
        "7d",
        "30d",
        "90d",
        "season"
      ],
      "description": "Analysis window",
      "default": "30d"
    },
    "formation": {
      "type": "string",
      "description": "Current formation or lineup scheme",
      "default": "standard"
    },
    "playerMetrics": {
      "type": "object",
      "properties": {
        "points": {
          "type": "number",
          "description": "Points per game"
        },
        "assists": {
          "type": "number",
          "description": "Assists per game"
        },
        "rebounds": {
          "type": "number",
          "description": "Rebounds per game"
        },
        "efficiency": {
          "type": "number",
          "description": "Efficiency rating"
        }
      },
      "description": "Player/team performance metrics"
    },
    "opponentMetrics": {
      "type": "object",
      "properties": {
        "points": {
          "type": "number",
          "description": "Opponent points per game"
        },
        "assists": {
          "type": "number",
          "description": "Opponent assists per game"
        },
        "rebounds": {
          "type": "number",
          "description": "Opponent rebounds per game"
        },
        "efficiency": {
          "type": "number",
          "description": "Opponent efficiency rating"
        }
      },
      "description": "Opponent performance metrics"
    }
  },
  "required": [
    "entity",
    "opponent"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Tactical evaluation result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-battlecard-creator`

**Name:** Game Plan & Opposition Battlecard Creator

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "dataProvider": {
      "type": "string",
      "enum": [
        "statsperform",
        "opta",
        "both"
      ],
      "description": "Primary data provider",
      "default": "both"
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before sending",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
      "default": true
    },
    "defaultFormation": {
      "type": "string",
      "description": "Default formation"
    },
    "refreshInterval": {
      "type": "number",
      "description": "Data refresh interval in minutes",
      "default": 60
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "string",
      "description": "Team identifier"
    },
    "opponent": {
      "type": "string",
      "description": "Opponent team identifier"
    },
    "sport": {
      "type": "string",
      "description": "Sport context"
    },
    "situation": {
      "type": "string",
      "enum": [
        "neutral",
        "home-advantage",
        "away-pressure",
        "playoff",
        "elimination"
      ],
      "description": "Game situation",
      "default": "neutral"
    },
    "formation": {
      "type": "string",
      "description": "Offensive formation",
      "default": "standard"
    },
    "defensiveScheme": {
      "type": "string",
      "description": "Defensive scheme",
      "default": "standard"
    },
    "offensiveScheme": {
      "type": "string",
      "description": "Offensive scheme",
      "default": "standard"
    },
    "keyMatchups": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "player": {
            "type": "string",
            "description": "Player name"
          },
          "opponentPlayer": {
            "type": "string",
            "description": "Opponent player name"
          },
          "advantage": {
            "type": "string",
            "enum": [
              "advantage",
              "disadvantage",
              "even"
            ],
            "description": "Matchup advantage"
          },
          "strategy": {
            "type": "string",
            "description": "Matchup strategy"
          },
          "notes": {
            "type": "string",
            "description": "Additional notes"
          }
        }
      },
      "description": "Key individual matchups"
    },
    "situationalPlays": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "Play description"
          },
          "situation": {
            "type": "string",
            "description": "When to use"
          }
        }
      },
      "description": "Situational plays"
    }
  },
  "required": [
    "entity",
    "opponent"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Battlecard result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-scouting-alert-dispatcher`

**Name:** Automated Scouting & Alert Dispatcher

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before sending alerts",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Always dry-run for represent actions",
      "default": true
    },
    "defaultChannels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Default dispatch channels"
    },
    "rateLimitPerHour": {
      "type": "number",
      "description": "Max alerts per hour",
      "default": 20
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "string",
      "description": "Player, team, or entity identifier"
    },
    "alertType": {
      "type": "string",
      "enum": [
        "scouting",
        "health",
        "performance",
        "transfer",
        "injury"
      ],
      "description": "Type of scouting alert"
    },
    "sport": {
      "type": "string",
      "description": "Sport context"
    },
    "severity": {
      "type": "string",
      "enum": [
        "low",
        "info",
        "warning",
        "critical"
      ],
      "description": "Alert severity",
      "default": "info"
    },
    "healthStatus": {
      "type": "string",
      "description": "Player health status",
      "default": "monitoring"
    },
    "performanceAnomaly": {
      "type": "string",
      "description": "Performance anomaly description"
    },
    "transferInterest": {
      "type": "string",
      "description": "Transfer market interest details"
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Alert dispatch channels"
    },
    "message": {
      "type": "string",
      "description": "Alert message"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Always dry-run — represent actions never execute live",
      "default": true
    },
    "confirmationRequired": {
      "type": "boolean",
      "description": "Confirmation required before sending",
      "default": true
    }
  },
  "required": [
    "entity",
    "alertType"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Scouting alert dispatch result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-matchup-odds-explainer`

**Name:** Matchup & Odds Explainer

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "oddsProvider": {
      "type": "string",
      "enum": [
        "oddsdata",
        "pinnacle",
        "both"
      ],
      "description": "Odds data provider",
      "default": "both"
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "event": {
      "type": "string",
      "description": "Event/game identifier"
    },
    "teamA": {
      "type": "string",
      "description": "Team A name"
    },
    "teamB": {
      "type": "string",
      "description": "Team B name"
    },
    "sport": {
      "type": "string",
      "description": "Sport context",
      "default": "generic"
    },
    "oddsA": {
      "type": "number",
      "description": "Decimal odds for Team A"
    },
    "oddsB": {
      "type": "number",
      "description": "Decimal odds for Team B"
    },
    "drawOdds": {
      "type": "number",
      "description": "Draw odds (if applicable)"
    },
    "stake": {
      "type": "number",
      "description": "Sample stake for EV calculation",
      "default": 0
    },
    "lineMovement": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time": {
            "type": "string",
            "description": "Timestamp of movement"
          },
          "market": {
            "type": "string",
            "description": "Market name"
          },
          "movement": {
            "type": "number",
            "description": "Odds movement magnitude"
          }
        }
      },
      "description": "Historical line movement data"
    }
  },
  "required": [
    "event",
    "oddsA",
    "oddsB"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Odds explanation result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-bankroll-co-pilot`

**Name:** Bankroll Co-Pilot

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
    "bankroll": {
      "type": "number",
      "description": "Total betting bankroll"
    },
    "unitSize": {
      "type": "number",
      "description": "Standard unit size in currency"
    },
    "unitLimit": {
      "type": "number",
      "description": "Maximum units per session",
      "default": 100
    },
    "currentUnits": {
      "type": "number",
      "description": "Units already wagered this session",
      "default": 0
    },
    "stake": {
      "type": "number",
      "description": "Proposed wager amount"
    },
    "odds": {
      "type": "number",
      "description": "Decimal odds",
      "default": 1
    },
    "winProbability": {
      "type": "number",
      "description": "Estimated win probability (0-1)"
    },
    "currency": {
      "type": "string",
      "description": "Currency code",
      "default": "USD"
    },
    "sessionId": {
      "type": "string",
      "description": "Session identifier",
      "default": "default"
    },
    "cooldownMinutes": {
      "type": "number",
      "description": "Cooldown between sessions in minutes",
      "default": 5
    },
    "confidenceLevel": {
      "type": "number",
      "description": "Confidence for variance calc (0-1)",
      "default": 0.95
    }
  },
  "required": []
}
```

**Runtime output schema:**

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Bankroll check result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-line-alert-dispatcher`

**Name:** Line-Alert Dispatcher

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before sending",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Always dry-run for represent actions",
      "default": true
    },
    "monitorInterval": {
      "type": "number",
      "description": "Monitoring interval in seconds",
      "default": 30
    },
    "maxAlertsPerHour": {
      "type": "number",
      "description": "Maximum alerts per hour",
      "default": 30
    }
  }
}
```

**Runtime input schema:**

```json
{
  "type": "object",
  "properties": {
    "entity": {
      "type": "string",
      "description": "Entity, market, or line identifier",
      "title": "Entity / Market",
      "order": 1,
      "hint": "Team, player, or market identifier"
    },
    "market": {
      "type": "string",
      "description": "Market or line identifier (alias for entity)",
      "title": "Market",
      "order": 2,
      "hint": "Alternative: specific betting market (e.g. moneyline, spread)"
    },
    "sport": {
      "type": "string",
      "description": "Sport context",
      "title": "Sport",
      "order": 3,
      "hint": "e.g. NFL, NBA, MLB"
    },
    "condition": {
      "type": "string",
      "enum": [
        "line-movement",
        "line-reached",
        "value-spot"
      ],
      "description": "Alert trigger condition",
      "title": "Condition",
      "order": 4,
      "hint": "When to trigger the alert"
    },
    "targetOdds": {
      "type": "number",
      "description": "Target odds level for alert",
      "title": "Target Odds",
      "order": 5,
      "hint": "Specific odds level to alert on"
    },
    "movementThreshold": {
      "type": "number",
      "description": "Movement threshold for triggering alert",
      "title": "Movement Threshold",
      "order": 6,
      "hint": "Minimum line movement to trigger",
      "default": 0.05
    },
    "markets": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Markets to monitor (moneyline, spread, totals, etc.)",
      "title": "Markets",
      "order": 7,
      "hint": "Which bet types to monitor"
    },
    "direction": {
      "type": "string",
      "enum": [
        "up",
        "down",
        "any"
      ],
      "description": "Direction of line movement",
      "title": "Direction",
      "order": 8,
      "hint": "Direction of movement to watch",
      "default": "any"
    },
    "message": {
      "type": "string",
      "description": "Alert message",
      "title": "Message",
      "order": 9,
      "hint": "Custom alert message"
    },
    "channels": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dispatch channels",
      "title": "Channels",
      "order": 10,
      "hint": "Where to send alerts",
      "default": [
        "user-device"
      ]
    },
    "confirmationId": {
      "type": "string",
      "description": "Confirmation ID for gating",
      "title": "Confirmation ID",
      "order": 11,
      "hint": "Optional confirmation token"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Always dry-run — represent actions never execute live",
      "title": "Dry Run",
      "order": 12,
      "hint": "Always enabled for represent actions",
      "default": true
    },
    "confirmationRequired": {
      "type": "boolean",
      "description": "Confirmation required before sending",
      "title": "Require Confirmation",
      "order": 13,
      "hint": "Gate dispatch behind confirmation",
      "default": true
    },
    "bankrollUnits": {
      "type": "number",
      "description": "Current bankroll units",
      "title": "Bankroll Units",
      "order": 14,
      "hint": "Current units at risk",
      "default": 0
    },
    "bankrollMaxUnits": {
      "type": "number",
      "description": "Maximum bankroll units",
      "title": "Max Bankroll Units",
      "order": 15,
      "hint": "Maximum exposure limit",
      "default": 100
    },
    "historicalVariance": {
      "type": "number",
      "description": "Historical variance for signal detection",
      "title": "Historical Variance",
      "order": 16,
      "hint": "Baseline variance for noise filtering",
      "default": 0.03
    }
  },
  "required": [
    "entity",
    "sport"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "Line alert dispatch result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

#### `sports-ingame-predictive-modeling`

**Name:** In-Game Predictive Modeling

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
    "event": {
      "type": "string",
      "description": "Event/game identifier"
    },
    "sport": {
      "type": "string",
      "description": "Sport context",
      "default": "generic"
    },
    "gameStatus": {
      "type": "string",
      "enum": [
        "in-progress",
        "halftime",
        "overtime"
      ],
      "description": "Current game status"
    },
    "playByPlay": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time": {
            "type": "string",
            "description": "Timestamp or game clock"
          },
          "quarter": {
            "type": "number",
            "description": "Quarter or period number"
          },
          "eventType": {
            "type": "string",
            "description": "Type of play"
          },
          "scoringTeam": {
            "type": "string",
            "description": "Team that scored"
          },
          "points": {
            "type": "number",
            "description": "Points scored"
          }
        }
      },
      "description": "Live play-by-play data"
    },
    "lineup": {
      "type": "object",
      "properties": {
        "homeAdvantage": {
          "type": "boolean",
          "description": "Home court/field advantage"
        },
        "keyPlayer": {
          "type": "string",
          "description": "Key player currently on field"
        }
      },
      "description": "Current lineup information"
    },
    "momentum": {
      "type": "string",
      "enum": [
        "strong",
        "neutral",
        "weak"
      ],
      "description": "Current momentum",
      "default": "neutral"
    },
    "timeRemaining": {
      "type": "string",
      "description": "Time remaining in game"
    }
  },
  "required": [
    "event"
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
      "description": "Whether the skill completed the work it claims to have done"
    },
    "status": {
      "type": "string",
      "description": "ok, partial, failed, blocked, not-connected, confirmation-required, or error"
    },
    "data": {
      "type": "object",
      "description": "In-game prediction result"
    },
    "error": {
      "type": "string",
      "description": "Failure message"
    },
    "present": {
      "type": "array",
      "description": "User-formatted blocks conforming to the generic presentation contract",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "kind": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "body"
        ]
      }
    },
    "safetyBoundary": {
      "type": "string",
      "description": "The applicable safety boundary for this skill group"
    }
  },
  "required": [
    "success",
    "present"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/sports/index.ts)

### Support

> Category source: `services/tool-executor/src/data/skills/support/index.ts`

#### `support-resolve-ticket`

**Name:** Resolve Support Ticket

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
    "ticket": {
      "type": "string",
      "description": "Ticket identifier"
    },
    "issue": {
      "type": "string",
      "description": "Issue description to resolve"
    }
  },
  "required": [
    "ticket",
    "issue"
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
    "data": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-sentiment-analysis`

**Name:** Analyze Ticket Sentiment

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
    "data": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-issue-analysis`

**Name:** Analyze Support Issue

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
    "issueText": {
      "type": "string",
      "description": "Issue text to analyze"
    },
    "customerInfo": {
      "type": "object",
      "properties": {},
      "description": "Customer information context"
    },
    "analysisType": {
      "type": "string",
      "enum": [
        "root_cause",
        "classification",
        "pattern_detection",
        "similarity",
        "prediction"
      ],
      "description": "Type of analysis to perform"
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
    "data": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `support-search-kb`

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
      "type": "string",
      "description": "Search query for knowledge base"
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
    "data": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `response-drafting`

**Name:** Response Drafting

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
    "ticket": {
      "type": "string",
      "description": "Ticket identifier for the response"
    },
    "customerMessage": {
      "type": "string",
      "description": "Customer message to respond to"
    },
    "tone": {
      "type": "string",
      "enum": [
        "professional",
        "friendly",
        "empathetic",
        "technical"
      ],
      "description": "Tone of the generated response",
      "default": "empathetic"
    },
    "template": {
      "type": "string",
      "description": "Response template to use"
    },
    "includeKB": {
      "type": "boolean",
      "description": "Whether to include knowledge base references",
      "default": true
    },
    "suggestedActions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Suggested next steps"
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
    "response": {
      "type": "object"
    },
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "response"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `ticket-ops`

**Name:** Ticket Ops

**Persistent config schema:**

```json
{
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before sending mutating requests",
      "default": true
    },
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing; defaults to true",
      "default": true
    },
    "baseUrl": {
      "type": "string",
      "description": "Service base URL"
    },
    "apiKey": {
      "type": "string",
      "description": "API key for authentication"
    },
    "defaultPriority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ],
      "description": "Default ticket priority"
    },
    "rateLimitPerMinute": {
      "type": "number",
      "description": "Rate limit per minute",
      "default": 60
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
    "dryRun": {
      "type": "boolean",
      "description": "Validate without executing",
      "default": true
    },
    "ticket": {
      "type": "string",
      "description": "Ticket identifier"
    },
    "customer": {
      "type": "string",
      "description": "Customer identifier"
    },
    "entity": {
      "type": "string",
      "enum": [
        "ticket",
        "customer",
        "contact",
        "account",
        "interaction"
      ],
      "description": "CRM entity type"
    },
    "data": {
      "type": "object",
      "properties": {},
      "description": "Data payload"
    },
    "filters": {
      "type": "object",
      "properties": {},
      "description": "Filters for query operations"
    },
    "escalationLevel": {
      "type": "number",
      "description": "Escalation level (1-5)",
      "minimum": 1,
      "maximum": 5
    },
    "assignedTo": {
      "type": "string",
      "description": "Person or team assigned"
    },
    "reason": {
      "type": "string",
      "description": "Reason for escalation"
    },
    "slaBreach": {
      "type": "boolean",
      "description": "Whether SLA has been breached"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ],
      "description": "Ticket priority level"
    },
    "followUpType": {
      "type": "string",
      "enum": [
        "satisfaction",
        "resolution_check",
        "upsell",
        "renewal",
        "custom"
      ],
      "description": "Type of follow-up"
    },
    "schedule": {
      "type": "object",
      "properties": {
        "at": {
          "type": "string",
          "description": "Scheduled date and time"
        },
        "delay": {
          "type": "string",
          "description": "Delay before sending"
        },
        "recurring": {
          "type": "boolean",
          "description": "Whether the follow-up repeats"
        }
      },
      "description": "Schedule configuration"
    },
    "channel": {
      "type": "string",
      "enum": [
        "email",
        "sms",
        "in_app",
        "phone",
        "chat"
      ],
      "description": "Communication channel"
    },
    "template": {
      "type": "string",
      "description": "Template for the follow-up message"
    },
    "customMessage": {
      "type": "string",
      "description": "Custom follow-up message"
    }
  },
  "required": []
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
    "system",
    "action",
    "request",
    "response",
    "error"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

#### `analytics-planning`

**Name:** Support Analytics & Planning

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
      "type": "string",
      "description": "Metric name to analyze"
    },
    "period": {
      "type": "string",
      "enum": [
        "7d",
        "30d",
        "90d",
        "YTD",
        "1y"
      ],
      "description": "Time period for analysis",
      "default": "30d"
    },
    "granularity": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month"
      ],
      "description": "Time granularity",
      "default": "day"
    },
    "reportType": {
      "type": "string",
      "enum": [
        "operational",
        "financial",
        "quality",
        "customer_satisfaction"
      ],
      "description": "Report category type"
    },
    "dateRange": {
      "type": "object",
      "properties": {
        "start": {
          "type": "string",
          "description": "Start date (ISO 8601)"
        },
        "end": {
          "type": "string",
          "description": "End date (ISO 8601)"
        }
      },
      "description": "Date range"
    },
    "facility": {
      "type": "string",
      "description": "Facility identifier"
    }
  },
  "required": []
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
    "error": {
      "type": "string"
    }
  },
  "required": [
    "success",
    "data"
  ]
}
```

**Source:** [`index.ts`](services/tool-executor/src/data/skills/support/index.ts)

---

**Total skills catalogued:** 124

### Regeneration

```bash
node scripts/generate-skill-schema-docs.js
```

The script imports the live category modules, extracts manifest.configSchema, inputSchema, and outputSchema
for each Tool, normalizes shorthand types into JSON-Schema-shaped objects, and replaces the content
between the appendix markers in this document.

<!-- SKILL_SCHEMA_APPENDIX_END -->
