# Deployment & Infrastructure Guide

Complete guide for deploying the Agent Development Kit to production environments.

## Prerequisites

### Development Environment
- Node.js 18+ LTS
- npm 9+
- Docker & Docker Compose (recommended)
- Git

### Production Environment
- **Compute**: 4+ CPU cores, 8+ GB RAM per assistant
- **Database**: PostgreSQL 14+ (for persistence)
- **Cache**: Redis 7+ (for sessions and caching)
- **Message Queue**: RabbitMQ 3.12+ (for async communication)
- **Container Registry**: Docker registry or equivalent

### Services Required

| Service | Purpose | Port | Status |
|---------|---------|------|--------|
| MissionControl (L1) | Conversation orchestration | 5010 | Core |
| TrafficManager (L1) | Request routing | varies | Core |
| CapabilitiesManager (L1) | Tool discovery | varies | Core |
| Brain Service (L1) | LLM integration | varies | Core |
| PostOffice (WebSocket) | Client communication | 5020 | Core |
| RabbitMQ | Message broker | 5672 | Required |
| PostgreSQL | Data persistence | 5432 | Required |
| Redis | Caching/sessions | 6379 | Recommended |
| Assistant APIs (L3) | Domain assistants | 3000+ | Apps |

## Quick Start: Docker Compose

### 1. Production Docker Compose

Create `docker-compose.prod.yaml`:

```yaml
version: '3.9'

services:
  # Infrastructure
  rabbitmq:
    image: rabbitmq:3.12-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: rabbitmq-diagnostics ping
      interval: 30s
      timeout: 10s
      retries: 5

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: adk
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # L1 Core Services
  missioncontrol:
    build:
      context: ./services/missioncontrol
      dockerfile: Dockerfile.prod
    ports:
      - "5010:5010"
    environment:
      NODE_ENV: production
      RABBITMQ_URL: amqp://admin:${RABBITMQ_PASSWORD}@rabbitmq:5672
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/adk
      REDIS_URL: redis://redis:6379
    depends_on:
      rabbitmq:
        condition: service_healthy
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5010/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  trafficmanager:
    build:
      context: ./services/trafficmanager
      dockerfile: Dockerfile.prod
    environment:
      NODE_ENV: production
      RABBITMQ_URL: amqp://admin:${RABBITMQ_PASSWORD}@rabbitmq:5672
    depends_on:
      - missioncontrol
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]

  brain:
    build:
      context: ./services/brain
      dockerfile: Dockerfile.prod
    ports:
      - "5011:5011"
    environment:
      NODE_ENV: production
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      RABBITMQ_URL: amqp://admin:${RABBITMQ_PASSWORD}@rabbitmq:5672
    depends_on:
      - missioncontrol
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5011/health"]

  postoffice:
    build:
      context: ./services/postoffice
      dockerfile: Dockerfile.prod
    ports:
      - "5020:5020"
    environment:
      NODE_ENV: production
      RABBITMQ_URL: amqp://admin:${RABBITMQ_PASSWORD}@rabbitmq:5672
    depends_on:
      - rabbitmq

  # L3 Assistant APIs
  pm-assistant:
    build:
      context: ./agents/pm-assistant-api
      dockerfile: Dockerfile.prod
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      POSTOFFICE_URL: http://postoffice:5020
      SECURITYMANAGER_URL: http://missioncontrol:5010
      PM_ASSISTANT_API_SECRET: ${PM_ASSISTANT_API_SECRET}
    depends_on:
      - postoffice

  sales-assistant:
    build:
      context: ./agents/sales-assistant-api
      dockerfile: Dockerfile.prod
    ports:
      - "3005:3005"
    environment:
      NODE_ENV: production
      PORT: 3005
      POSTOFFICE_URL: http://postoffice:5020
      SECURITYMANAGER_URL: http://missioncontrol:5010
      SALES_ASSISTANT_API_SECRET: ${SALES_ASSISTANT_API_SECRET}
    depends_on:
      - postoffice

  # ... Add more assistants as needed

  # L4 React UI
  mcsreact:
    build:
      context: ./services/mcsreact
      dockerfile: Dockerfile.prod
    ports:
      - "80:3000"
    environment:
      REACT_APP_API_URL: http://postoffice:5020
    depends_on:
      - pm-assistant

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - mcsreact
      - postoffice

volumes:
  rabbitmq-data:
  postgres-data:
  redis-data:

networks:
  default:
    name: adk-network
```

### 2. Environment Configuration

Create `.env.prod`:

```bash
# Infrastructure
RABBITMQ_PASSWORD=your-secure-rabbitmq-password
DB_USER=adk_user
DB_PASSWORD=your-secure-db-password

# Assistant Secrets
PM_ASSISTANT_API_SECRET=your-pm-secret
SALES_ASSISTANT_API_SECRET=your-sales-secret
# ... Add secrets for each assistant

# LLM Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4
```

### 3. Deploy

```bash
# Build all services
docker-compose -f docker-compose.prod.yaml build

# Start services
docker-compose -f docker-compose.prod.yaml up -d

# Verify
docker-compose -f docker-compose.prod.yaml ps
docker-compose -f docker-compose.prod.yaml logs -f
```

## Manual Deployment

For non-containerized deployments:

### 1. Build All Components

```bash
# Build SDK
cd sdk
npm install
npm run build

# Build each assistant
for assistant in pm sales marketing hr finance support legal healthcare education event executive career content-creator songwriter scriptwriter restaurant-ops hotel-ops performance-analytics sports-wager cto; do
  cd agents/${assistant}-assistant-api
  npm install
  npm run build
  cd ../..
done

# Build UI
cd services/mcsreact
npm install
npm run build
```

### 2. Start L1 Core Services

```bash
# Terminal 1: MissionControl
cd services/missioncontrol
npm start

# Terminal 2: Brain
cd services/brain
npm start

# Terminal 3: PostOffice
cd services/postoffice
npm start
```

### 3. Start Assistants

```bash
# Start each assistant in its own terminal
cd agents/pm-assistant-api && npm start
cd agents/sales-assistant-api && npm start
# ... etc
```

### 4. Start UI

```bash
cd services/mcsreact
npm start
# Open http://localhost:3000
```

## Production Checklist

### Security
- [ ] All passwords/secrets stored in secure vault
- [ ] HTTPS/TLS enabled with valid certificates
- [ ] Firewall configured (only expose ports 80, 443)
- [ ] Database credentials not in code
- [ ] API keys rotated regularly
- [ ] RBAC implemented for assistant access

### Monitoring
- [ ] Centralized logging configured (ELK/Splunk/CloudWatch)
- [ ] Health check endpoints verified
- [ ] Alerts configured for:
  - Service down
  - High memory usage
  - Database connection failures
  - RabbitMQ queue buildup
  - LLM API quota warnings

### Performance
- [ ] Load testing completed
- [ ] Database indexes optimized
- [ ] Redis caching verified
- [ ] Connection pooling configured
- [ ] Autoscaling policies defined

### Reliability
- [ ] Database backups automated
- [ ] Disaster recovery plan documented
- [ ] Zero-downtime deployment strategy tested
- [ ] Service health checks enabled
- [ ] Graceful shutdown implemented

### Compliance
- [ ] Data retention policies defined
- [ ] GDPR/privacy requirements met
- [ ] Audit logging enabled
- [ ] Encryption at rest configured

## Scaling Guide

### Horizontal Scaling

Scale individual assistants based on demand:

```bash
# Using docker-compose scale
docker-compose -f docker-compose.prod.yaml up -d --scale pm-assistant=3

# Or using load balancer (nginx/HAProxy):
upstream pm_assistant {
  server pm-assistant-1:3000;
  server pm-assistant-2:3000;
  server pm-assistant-3:3000;
}
```

### Vertical Scaling

Increase resources per service:

```yaml
services:
  pm-assistant:
    # ... 
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
```

## Monitoring & Health Checks

### Health Check Endpoints

Each service provides health information:

```bash
# Assistant health
curl http://localhost:3000/health

# Brain service health
curl http://localhost:5011/health

# PostOffice health
curl http://localhost:5020/health
```

### Logging

View service logs:

```bash
# Docker Compose
docker-compose logs -f pm-assistant
docker-compose logs -f brain

# Manual deployment
tail -f /var/log/adk/pm-assistant.log
tail -f /var/log/adk/brain.log
```

### Metrics

Export Prometheus metrics:

```bash
# Brain service metrics
curl http://localhost:5011/metrics

# Parse with prometheus:
scrape_configs:
  - job_name: 'brain'
    static_configs:
      - targets: ['localhost:5011']
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs pm-assistant

# Check dependencies
docker-compose logs postoffice rabbitmq

# Verify configuration
env | grep -E "PM_|POSTOFFICE"
```

### High Latency

```bash
# Check RabbitMQ queue depth
curl http://localhost:15672/api/queues (with auth)

# Check database connections
SELECT * FROM pg_stat_connections;

# Check Redis memory
redis-cli info memory
```

### Crashed Assistants

```bash
# Check exit code
docker-compose logs pm-assistant | grep "exit code"

# Common codes:
# 1 = General error (check logs)
# 127 = Command not found (missing dependency)
# 137 = Out of memory (increase limits)
```

## Backup & Recovery

### Database Backup

```bash
# Automated daily backup
docker-compose exec postgres pg_dump -U ${DB_USER} adk > /backups/adk-$(date +%Y-%m-%d).sql

# Restore from backup
docker-compose exec postgres psql -U ${DB_USER} adk < /backups/adk-2024-01-15.sql
```

### RabbitMQ Recovery

```bash
# Export definitions
docker-compose exec rabbitmq rabbitmqctl export_definitions /var/lib/rabbitmq/definitions.json

# Import definitions
docker-compose exec rabbitmq rabbitmqctl import_definitions /var/lib/rabbitmq/definitions.json
```

---

See [README.md](./README.md) for quick start and [SDK-ARCHITECTURE.md](./SDK-ARCHITECTURE.md) for technical details.
