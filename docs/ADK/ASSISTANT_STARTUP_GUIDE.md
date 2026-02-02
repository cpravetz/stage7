# Assistant Services Startup Guide

## Overview

The v2 assistant architecture consists of:
- **Frontend**: React app (port 5020 via PostOffice)
- **PostOffice**: API Gateway and proxy (port 5020)
- **Assistant APIs**: Individual backend services for each assistant (ports 3000-3015)
- **Core Services**: MissionControl, Brain, Librarian, etc.

## Architecture

```
Frontend (Browser)
    ↓
PostOffice (port 5020) - API Gateway
    ↓
Service Discovery (Consul) or Environment Variables
    ↓
Assistant APIs (ports 3000-3015)
    ↓
Core Engine (MissionControl, Brain, etc.)
```

## Starting Services

### Option 1: Start All Services with Docker Compose (Recommended)

```bash
# From repository root
docker-compose up

# Or start specific services
docker-compose up postoffice pm-assistant-api sales-assistant-api
```

This starts:
- All 14+ assistant APIs (ports 3000-3015)
- PostOffice (port 5020)
- All L1 services (MissionControl, Brain, Librarian, etc.)
- Infrastructure (MongoDB, Redis, Consul)
- React frontend

### Option 2: Start Services Individually (Development)

#### 1. Start Core Services First

```bash
# Start PostOffice (required for routing)
cd services/postoffice
npm start

# Start MissionControl (required for assistants)
cd services/missioncontrol
npm start

# Start other core services as needed
```

#### 2. Start Assistant APIs

```bash
# PM Assistant (port 3000)
cd agents/pm-assistant-api
npm start

# Sales Assistant (port 3002)
cd agents/sales-assistant-api
npm start

# Marketing Assistant (port 3003)
cd agents/marketing-assistant-api
npm start

# ... etc for other assistants
```

#### 3. Start Frontend

```bash
cd services/mcsreact
npm start
```

## Assistant API Ports

| Assistant | Port | Service Name |
|-----------|------|--------------|
| PM Assistant | 3000 | pm-assistant |
| Sales Assistant | 3002 | sales-assistant |
| Marketing Assistant | 3003 | marketing-assistant |
| HR Assistant | 3004 | hr-assistant |
| Finance Assistant | 3005 | finance-assistant |
| Support Assistant | 3006 | support-assistant |
| Legal Assistant | 3007 | legal-assistant |
| Healthcare Assistant | 3008 | healthcare-assistant |
| Education Assistant | 3009 | education-assistant |
| Event Assistant | 3010 | event-assistant |
| Executive Assistant | 3011 | executive-assistant |
| Career Assistant | 3012 | career-assistant |
| Songwriter Assistant | 3013 | songwriter-assistant |
| Scriptwriter Assistant | 3014 | scriptwriter-assistant |
| Content Creator Assistant | 3015 | content-creator-assistant |

## How Routing Works

1. **Frontend makes request**: `http://localhost:5020/api/pm-assistant/conversations`
2. **PostOffice receives**: Extracts service name `pm-assistant` from path
3. **Service Discovery**: PostOffice looks up `pm-assistant` service via:
   - Consul service discovery (primary)
   - Environment variables (fallback)
   - Local registry (last resort)
4. **Proxy request**: PostOffice forwards to `http://pm-assistant-api:3000/conversations`
5. **Response**: Assistant API responds, PostOffice returns to frontend

## Troubleshooting

### "Start Conversation" button triggers 500 error

**Cause**: Assistant API is not running or not registered with PostOffice

**Solution**:
1. Check if the assistant API is running: `docker ps` or check process list
2. Check PostOffice logs for service discovery errors
3. Verify the assistant API registered with PostOffice/Consul
4. Check environment variables for service URLs

### Action buttons do nothing

**Cause**: Fixed in latest code - buttons now start a conversation if needed

**Solution**: Make sure you're using the latest code where `handleActionClick` creates a conversation first

### WebSocket connection fails

**Cause**: WebSocket routing not configured or service not running

**Solution**:
1. Verify assistant API WebSocket server is running
2. Check WebSocket path matches: `/ws/{assistant-name}/conversations/{id}/events`
3. Ensure PostOffice is proxying WebSocket connections

### Cannot connect to assistant API

**Cause**: Service discovery failure or wrong URL configuration

**Solution**:
1. Check `assistantClients.ts` uses `API_BASE_URL` and `WS_URL` from config
2. Verify URLs don't include port numbers (should go through PostOffice)
3. Check PostOffice is running on port 5020
4. Verify service registration in Consul or environment variables

## Environment Variables

### Frontend (services/mcsreact)
- `REACT_APP_API_BASE_URL`: Not used (uses window.location)
- `REACT_APP_WS_URL`: Not used (uses window.location)

### PostOffice (services/postoffice)
- `PORT`: 5020
- `CONSUL_URL`: Consul service discovery URL
- Service URLs: `PM_ASSISTANT_URL`, `SALES_ASSISTANT_URL`, etc.

### Assistant APIs
- `PORT`: Specific port for each assistant
- `POSTOFFICE_URL`: URL to PostOffice
- `CORE_ENGINE_URL`: URL to MissionControl (usually http://localhost:5030)

## Recent Fixes Applied

1. ✅ Fixed `assistantClients.ts` to route through PostOffice instead of direct ports
2. ✅ Fixed PM Assistant page to use shared client instead of hardcoded localhost:3000
3. ✅ Fixed action buttons to start conversation before triggering actions
4. ✅ Removed `process.env` usage in browser code (not available in browser)

## Next Steps

To get assistants fully working:
1. Ensure all required backend services are running (PostOffice + Assistant APIs + Core services)
2. Verify service discovery is working (check Consul or environment variables)
3. Test conversation flow: Start conversation → Send message → Receive response
4. Test action buttons: Click action → Conversation starts → Action triggers

