# Docker Build Strategy

All 20 agent APIs use a layered approach:

## 1. Build the Base Image (shared dependencies)
Build once with shared/sdk/errorhandler pre-compiled:
```bash
docker build -f Dockerfile.base -t cktmcs:base .
```

## 2. Build Individual Agent Images
Each agent builds on top of the base, adding only its own code:
```bash
docker build -f agents/content-creator-assistant-api/Dockerfile -t cktmcs:content-creator .
docker build -f agents/sales-assistant-api/Dockerfile -t cktmcs:sales .
# ... etc for all 20 agents
```

## Benefits
- **Reduced build time**: Shared dependencies built once
- **Simplified agent Dockerfiles**: Each ~16 lines instead of ~55
- **Consistency**: All agents use identical base layer
- **Flexibility**: Base can be updated without touching agent files

## Port Assignments
```
content-creator-assistant-api    3001
event-assistant-api             3003
legal-assistant-api             3004
sales-assistant-api             3005
education-assistant-api         3006
hr-assistant-api                3007
executive-assistant-api         3008
marketing-assistant-api         3009
support-assistant-api           3010
performance-analytics-api       3011
songwriter-assistant-api        3012
scriptwriter-assistant-api      3013
finance-assistant-api           3014
healthcare-assistant-api        3015
restaurant-ops-assistant-api    3016
hotel-ops-assistant-api         3017
sports-wager-advisor-api        3018
cto-assistant-api               3020
career-assistant-api            3021
pm-assistant-api                3000
```

## Directory Structure
```
Dockerfile.base                          # Base image definition
agents/
  ├── content-creator-assistant-api/
  │   └── Dockerfile                    # ~16 lines, FROM cktmcs:base
  ├── sales-assistant-api/
  │   └── Dockerfile                    # ~16 lines, FROM cktmcs:base
  └── ... (18 more agents)
```
