# Docker Build Instructions

## Quick Start

Build the entire system with proper ordering:

```bash
# Step 1: Build the base image (shared dependencies)
docker-compose -f docker-compose.all.yaml build base

# Step 2: Build all agent and service images
docker-compose -f docker-compose.all.yaml build

# Step 3: Start all services
docker-compose -f docker-compose.all.yaml up -d
```

## Why Two Builds?

The base image contains pre-compiled shared, sdk, and errorhandler packages. Building it once and having all 20 agents inherit from it significantly reduces total build time (parallel builds reuse the cached layers).

## Individual Builds

To build specific agents:

```bash
# Build just one agent
docker build -f agents/sales-assistant-api/Dockerfile -t cktmcs:sales .

# Build just the base
docker build -f Dockerfile.base -t cktmcs:base .
```

## Port Assignments

All services and agents expose the following ports:

### Infrastructure Services
- PostOffice: 5020
- MissionControl: 5030
- Brain: 5070
- Engineer: 5050
- Librarian: 5040
- SecurityManager: 5010
- AgentSet: 5060

### Agent APIs (20 total)
```
pm-assistant-api                 3000
content-creator-assistant-api    3001
sales-assistant-api              3002
event-assistant-api              3003
legal-assistant-api              3004
sales-assistant-api              3005
education-assistant-api          3006
hr-assistant-api                 3007
executive-assistant-api          3008
marketing-assistant-api          3009
support-assistant-api            3010
performance-analytics-api        3011
songwriter-assistant-api         3012
scriptwriter-assistant-api       3013
finance-assistant-api            3014
healthcare-assistant-api         3015
restaurant-ops-assistant-api     3016
hotel-ops-assistant-api          3017
sports-wager-advisor-api         3018
cto-assistant-api                3020
career-assistant-api             3021
```

## Troubleshooting

### "cktmcs:base: failed to resolve source metadata"

This error means the base image hasn't been built yet. Run:
```bash
docker-compose -f docker-compose.all.yaml build base
```

### Clean Rebuild

To force a complete rebuild without cache:
```bash
docker-compose -f docker-compose.all.yaml build --no-cache base
docker-compose -f docker-compose.all.yaml build --no-cache
```

### Docker Desktop Memory

Building 20+ images may require increasing Docker Desktop memory allocation:
- Set RAM to at least 4GB in Docker Desktop Preferences → Resources

## Architecture

```
Dockerfile.base (builds once)
├── shared/
├── sdk/
└── errorhandler/

All 20 agents build on cktmcs:base
├── agents/pm-assistant-api/Dockerfile
├── agents/sales-assistant-api/Dockerfile
└── ... (18 more agents)
```
