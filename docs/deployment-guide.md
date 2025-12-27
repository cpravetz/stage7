# Stage7 Deployment Guide

## 🚀 Overview

This guide covers deploying the Stage7 system with the enterprise-ready plugin ecosystem supporting Python, JavaScript, and Container plugins. The system follows the consolidated verb discovery architecture for dynamic capability expansion.

## 📋 Prerequisites

### System Requirements
- **Docker**: Version 20.10+ with Docker Compose
- **Node.js**: Version 20+ for frontend and services
- **Python**: Version 3.9+ for Python plugins
- **Memory**: Minimum 8GB RAM recommended (16GB+ for production)
- **Storage**: Minimum 20GB available space (SSD recommended)

### Environment Setup
- **Operating System**: Linux (Ubuntu 22.04+ recommended), macOS, or Windows with WSL2
- **Network**: Ports 5000-5100 available for services
- **Docker**: Docker daemon running with container support
- **Hardware**: Multi-core CPU recommended for parallel plugin execution

## 🔧 Pre-Deployment Configuration

### 1. Environment Variables

Create a `.env` file in the project root by copying the `.env.example` file and filling in the values. Refer to the comprehensive [`environment_variable_guide.md`](docs/environment_variable_guide.md) for detailed configuration.

#### Core Configuration
- `NODE_ENV`: The environment for Node.js (e.g., `production`, `development`).
- `HOST`: The hostname for the services (e.g., `localhost` or domain name).
- `PORT`: The port for the services (e.g., `5020` for PostOffice).

#### Security (VERIFIED 2025-12-23)
- `CLIENT_SECRET`: A shared secret for client authentication. **Must be changed from default**
- `JWT_SECRET`: The secret key for signing JWT tokens. **Use strong, random value**
- `JWT_REFRESH_SECRET`: The secret key for refreshing JWT tokens. **Use strong, random value**
- `ENCRYPTION_KEY`: A key for encrypting sensitive data. **32+ character random string**
- `POSTOFFICE_SECRET`, `MISSIONCONTROL_SECRET`, `BRAIN_SECRET`, `LIBRARIAN_SECRET`, `ENGINEER_SECRET`, `TRAFFICMANAGER_SECRET`, `CAPABILITIESMANAGER_SECRET`, `AGENTSET_SECRET`, `AGENT_SECRET`, `ERRORHANDLER_SECRET`: Individual secrets for each service. **All must be unique and strong**

#### Service URLs (VERIFIED 2025-12-23)
- `POSTOFFICE_URL`: URL for the PostOffice service. Default: `http://localhost:5020`
- `BRAIN_URL`: URL for the Brain service. Default: `http://localhost:5030`
- `LIBRARIAN_URL`: URL for the Librarian service. Default: `http://localhost:5040`
- `CAPABILITIESMANAGER_URL`: URL for the CapabilitiesManager service. Default: `http://localhost:5060`
- `MARKETPLACE_URL`: URL for the Marketplace service. Default: `http://localhost:5050`
- `ENGINEER_URL`: URL for the Engineer service. Default: `http://localhost:5080`
- `SECURITYMANAGER_URL`: URL for the SecurityManager service. Default: `http://localhost:5010`
- `TRAFFICMANAGER_URL`: URL for the TrafficManager service. Default: `http://localhost:5090`
- `MISSIONCONTROL_URL`: URL for the MissionControl service. Default: `http://localhost:5100`
- `AGENTSET_URL`: URL for the AgentSet service. Default: `http://localhost:5110`
- `FRONTEND_URL`: URL for the frontend application. Default: `http://localhost:5070`

#### Database Configuration (VERIFIED 2025-12-23)
- `MONGODB_URI`: The connection string for MongoDB. Format: `mongodb://username:password@host:port/database`
- `MONGO_URL`: The URL for the MongoDB instance. Default: `mongodb://mongodb:27017`
- `MONGO_DB`: The name of the MongoDB database. Default: `stage7`
- `REDIS_URL`: The URL for the Redis instance. Default: `redis://redis:6379`
- `REDIS_HOST`: The host for the Redis instance. Default: `redis`
- `REDIS_PORT`: The port for the Redis instance. Default: `6379`

#### Plugin Configuration (UPDATED 2025-12-23)
- `DEFAULT_PLUGIN_REPOSITORY`: The default repository for plugins (e.g., `mongo`, `github`, `local`). Default: `mongo`
- `LOCAL_PLUGIN_PATH`: The local path for plugins. Default: `./plugins`
- `MONGO_COLLECTION`: The MongoDB collection for plugins. Default: `plugins`
- `PLUGIN_TIMEOUT`: The timeout for plugin execution in milliseconds. Default: `30000` (30 seconds)
- `CONTAINER_MEMORY_LIMIT`: The memory limit for containerized plugins. Default: `512m`
- `CONTAINER_CPU_LIMIT`: The CPU limit for containerized plugins. Default: `1.0`
- `PLUGIN_SIGNING_KEY`: The key for signing plugins. **Must be kept secure**
- `PLUGIN_PUBLIC_KEY`: The key for verifying signed plugins. **Can be public**
- `PLUGIN_MAX_CONCURRENT`: Maximum concurrent plugin executions. Default: `10`
- `PLUGIN_RETRY_ATTEMPTS`: Number of retry attempts for failed plugins. Default: `3`

#### GitHub Integration
- `ENABLE_GITHUB`: Set to `true` to enable GitHub integration. Default: `false`
- `GITHUB_TOKEN`: Your GitHub personal access token. **Required for GitHub plugin repository**
- `GITHUB_USERNAME`: Your GitHub username.
- `GIT_REPOSITORY_URL`: The URL of your Git repository for plugins.
- `GIT_DEFAULT_BRANCH`: The default branch of your Git repository. Default: `main`
- `GITHUB_EMAIL`: The email associated with your GitHub account.

#### LLM and API Keys (VERIFIED 2025-12-23)
- `GROQ_API_KEY`: API key for Groq. **Required for Groq model access**
- `ANTHROPIC_API_KEY`: API key for Anthropic. **Required for Claude models**
- `GEMINI_API_KEY`: API key for Gemini. **Required for Gemini models**
- `OPENAI_API_KEY`: API key for OpenAI. **Required for GPT models**
- `OPENROUTER_API_KEY`: API key for OpenRouter. **Optional for multi-provider access**
- `MISTRAL_API_KEY`: API key for Mistral. **Optional for Mistral models**
- `HUGGINGFACE_API_KEY` or `HF_API_KEY`: API key for Hugging Face.
- `AIML_API_KEY`: API key for AIML.
- `CLOUDFLARE_WORKERS_AI_API_TOKEN`: API token for Cloudflare Workers AI.
- `CLOUDFLARE_WORKERS_AI_ACCOUNT_ID`: Account ID for Cloudflare Workers AI.
- `OPENWEATHER_API_KEY`: API key for OpenWeather.
- `DUCKDUCKGO_API_KEY`: API key for DuckDuckGo.
- `GOOGLE_SEARCH_API_KEY`: API key for Google Search.
- `GOOGLE_CSE_ID`: Google Custom Search Engine ID.
- `LANGSEARCH_API_KEY`: API key for LangSearch.
- `WEATHER_API_KEY`: API key for Weather API.

### 2. Docker Configuration

Ensure Docker daemon is running with sufficient resources:

```bash
# Check Docker status
docker --version
docker compose --version

# Start Docker daemon (if needed)
sudo systemctl start docker

# Configure Docker resources (minimum recommendations)
# - CPUs: 4 cores
# - Memory: 8GB
# - Swap: 2GB
# - Disk: 20GB
```

### 3. Network Configuration (VERIFIED 2025-12-23)

The system uses the following ports:

**Core Services:**
- **5010**: SecurityManager (Authentication)
- **5020**: PostOffice (Main entry point)
- **5030**: Brain (LLM Planning)
- **5040**: Librarian (Tool Discovery)
- **5050**: Marketplace (Plugin Management)
- **5060**: CapabilitiesManager (Plugin Execution)
- **5070**: Frontend (User Interface)
- **5080**: Engineer (Plugin Development)
- **5090**: TrafficManager (Load Balancing)
- **5100**: MissionControl (Mission Management)
- **5110**: AgentSet (Agent Coordination)

**Infrastructure:**
- **27017**: MongoDB (Database)
- **6379**: Redis (Caching)

**Plugin Ecosystem Ports (Dynamic):**
- **5120-5200**: Containerized plugin ports (auto-assigned)

## 🏗️ Deployment Steps

### Step 1: Build All Services

```bash
# Build all services
docker compose build

# Build specific services (if needed)
docker compose build capabilitiesmanager
docker compose build marketplace
docker compose build engineer

# Verify images were created successfully
docker images | grep stage7
```

### Step 2: Start Infrastructure Services

```bash
# Start database services first
docker compose up -d mongodb redis

# Wait for databases to be ready
sleep 15

# Verify database connectivity
docker compose exec mongodb mongo --eval "db.adminCommand('ping')"
docker compose exec redis redis-cli ping
```

### Step 3: Start Core Services

```bash
# Start security and messaging services first
docker compose up -d securitymanager postoffice

# Wait for core services to initialize
sleep 10

# Verify core services are healthy
curl -s http://localhost:5010/health | grep -q '"status":"ok"' && echo "SecurityManager healthy"
curl -s http://localhost:5020/health | grep -q '"status":"ok"' && echo "PostOffice healthy"

# Start remaining services
docker compose up -d brain librarian capabilitiesmanager marketplace engineer trafficmanager missioncontrol agentset

# Wait for services to initialize
sleep 15

# Start frontend
docker compose up -d frontend
```

### Step 4: Verify Deployment

```bash
# Check all services are running
docker compose ps

# Check service health endpoints
curl http://localhost:5020/health  # PostOffice
curl http://localhost:5060/health  # CapabilitiesManager
curl http://localhost:5050/health  # Marketplace
curl http://localhost:5080/health  # Engineer
curl http://localhost:5040/health  # Librarian
curl http://localhost:5030/health  # Brain

# Verify service discovery
curl http://localhost:5020/components
```

### Step 5: Initialize Plugin Ecosystem (NEW)

```bash
# Initialize plugin repositories
docker compose exec marketplace node scripts/init-plugin-repositories.js

# Verify plugin discovery
curl http://localhost:5020/plugins

# Expected: Should return available plugins from configured repositories
```

## 🧪 Post-Deployment Testing

### 1. Run Integration Tests (UPDATED)

```bash
# Run comprehensive plugin ecosystem tests
node scripts/test-plugin-ecosystem.js

# Run specific test suites
node scripts/test-plugin-ecosystem.js --suite=discovery
node scripts/test-plugin-ecosystem.js --suite=execution
node scripts/test-plugin-ecosystem.js --suite=security

# Expected output: All tests should pass
# ✓ Plugin discovery tests passed
# ✓ Plugin execution tests passed
# ✓ Security validation tests passed
```

### 2. Test Plugin Discovery (ENHANCED)

```bash
# List available plugins
curl http://localhost:5020/plugins

# Search for specific plugin types
curl "http://localhost:5020/plugins?type=python"
curl "http://localhost:5020/plugins?capability=text_analysis"

# Test semantic search
curl -X POST http://localhost:5040/verbs/discover \
  -H "Content-Type: application/json" \
  -d '{"query": "analyze financial documents"}'

# Expected: Should return relevant plugins with semantic matching
```

### 3. Test Plugin Execution (ENHANCED)

```bash
# Test TEXT_ANALYSIS plugin
curl -X POST http://localhost:5020/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actionVerb": "TEXT_ANALYSIS",
    "inputs": {
      "text": "This is a test message for analysis.",
      "analysis_type": "sentiment"
    }
  }'

# Test containerized plugin
curl -X POST http://localhost:5020/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actionVerb": "CONTAINER_ANALYSIS",
    "pluginType": "container",
    "inputs": {
      "data": "sample data for container processing"
    }
  }'
```

### 4. Test Tool Discovery Architecture (NEW)

```bash
# Test brain-aware planning with discovery
docker compose exec brain node scripts/test-brain-discovery.js

# Test knowledge graph queries
curl -X POST http://localhost:5040/graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "find tools that consume text and produce analysis",
    "context": "financial reporting"
  }'

# Expected: Should return tool chains matching the criteria
```

### 5. Test Frontend Access

```bash
# Access frontend
open http://localhost:5070

# Verify frontend can communicate with backend
curl http://localhost:5070/api/status
```

## 🔍 Monitoring and Troubleshooting (ENHANCED)

### Service Logs

```bash
# View all service logs
docker compose logs

# View specific service logs with timestamps
docker compose logs --timestamps capabilitiesmanager

# View logs for plugin ecosystem
docker compose logs marketplace engineer capabilitiesmanager

# Follow logs in real-time for multiple services
docker compose logs -f postoffice brain librarian
```

### Common Issues (UPDATED)

#### 1. Plugin Execution Failures (ENHANCED)
```bash
# Check CapabilitiesManager logs
docker compose logs capabilitiesmanager

# Check Python plugin dependencies
docker compose exec capabilitiesmanager pip list

# Check plugin validation issues
docker compose logs capabilitiesmanager | grep -i validation

# Check plugin timeout issues
docker compose logs capabilitiesmanager | grep -i timeout
```

#### 2. Container Plugin Issues (ENHANCED)
```bash
# Check Docker daemon
docker info

# Check container plugin images
docker images | grep stage7-plugin

# Check container plugin execution
docker compose logs capabilitiesmanager | grep -i container

# Check container resource limits
docker inspect $(docker ps -q --filter "name=plugin") | grep -i limit
```

#### 3. Service Communication Issues (ENHANCED)
```bash
# Check service discovery
curl http://localhost:5020/components

# Check authentication
curl http://localhost:5010/health

# Check JWT token validation
curl -v http://localhost:5020/health

# Test inter-service communication
docker compose exec postoffice curl http://brain:5030/health
```

#### 4. Discovery Service Issues (NEW)
```bash
# Check Librarian service logs
docker compose logs librarian

# Test ChromaDB connectivity
docker compose exec librarian node scripts/test-chroma-connection.js

# Check vector index status
curl http://localhost:5040/status

# Rebuild vector indexes if needed
docker compose exec librarian node scripts/rebuild-indexes.js
```

### Performance Monitoring (ENHANCED)

```bash
# Check resource usage
docker stats

# Check plugin execution times
docker compose logs capabilitiesmanager | grep -i "execution time"

# Monitor container plugin resource usage
docker stats | grep stage7-plugin

# Check discovery service performance
curl http://localhost:5040/metrics

# Monitor brain planning performance
docker compose logs brain | grep -i "planning time"
```

## 🔧 Configuration Tuning (ENHANCED)

### Plugin Performance (UPDATED)

Adjust plugin timeouts and resource limits in `.env`:
```bash
# For complex plugins requiring more resources
PLUGIN_TIMEOUT=60000  # 60 seconds for complex operations
CONTAINER_MEMORY_LIMIT=2g  # 2GB for memory-intensive plugins
CONTAINER_CPU_LIMIT=2.0  # 2 CPU cores for CPU-intensive plugins

# For high-throughput environments
PLUGIN_MAX_CONCURRENT=20  # Allow more concurrent executions
PLUGIN_RETRY_ATTEMPTS=5  # More retry attempts for transient failures
```

### Service Scaling (ENHANCED)

Scale services based on load:
```bash
# Scale CapabilitiesManager for high plugin usage
docker compose up -d --scale capabilitiesmanager=5

# Scale Marketplace for high discovery load
docker compose up -d --scale marketplace=3

# Scale Brain for high planning load
docker compose up -d --scale brain=4

# Scale Engineer for high plugin development load
docker compose up -d --scale engineer=2
```

### Database Optimization (ENHANCED)

```bash
# MongoDB optimization for high write loads
docker compose exec mongodb mongo --eval "db.adminCommand({setParameter: 1, writeConcernMajorityJournalDefault: true})"

# Redis optimization for caching
docker compose exec redis redis-cli CONFIG SET maxmemory 2gb
docker compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# ChromaDB optimization for discovery
docker compose exec librarian node scripts/optimize-chroma.js
```

### Discovery Service Tuning (NEW)

```bash
# Adjust semantic search parameters
# In librarian service configuration:
SEARCH_TOP_K=10  # Number of results to return
SEARCH_THRESHOLD=0.7  # Minimum similarity score
EMBEDDING_MODEL=all-MiniLM-L6-v2  # Embedding model for vectorization

# Enable caching for frequent queries
DISCOVERY_CACHE_TTL=300  # 5 minute cache for discovery results
```

## 🔒 Security Considerations (ENHANCED)

### 1. Authentication (UPDATED)
- Change default `CLIENT_SECRET` in production
- Use strong JWT secrets (32+ character random strings)
- Enable HTTPS in production environments with TLS certificates
- Implement token rotation for long-running services
- Refer to [`authentication.md`](docs/authentication.md) for detailed security setup

### 2. Plugin Security (ENHANCED)
- Review plugin permissions before deployment
- Monitor plugin resource usage for anomalies
- Use container isolation for untrusted plugins
- Implement plugin signing and verification
- Scan plugins for vulnerabilities before deployment
- Refer to [`security_improvements.md`](docs/security_improvements.md) for comprehensive security guidelines

### 3. Network Security (ENHANCED)
- Use firewalls to restrict access to internal ports
- Enable TLS for all inter-service communication
- Monitor network traffic for anomalies
- Implement network segmentation for sensitive services
- Use Docker network policies for container isolation

### 4. Data Security (NEW)
- Encrypt sensitive data at rest
- Implement proper access controls for databases
- Regularly audit data access patterns
- Implement data retention policies
- Use field-level encryption for PII data

## 📊 Production Checklist (UPDATED)

### Pre-Production
- [ ] All environment variables configured and verified
- [ ] Security secrets updated from defaults and rotated
- [ ] Database backups configured and tested
- [ ] Monitoring and alerting set up with thresholds
- [ ] Load testing completed with realistic scenarios
- [ ] Security audit performed including penetration testing
- [ ] Disaster recovery plan documented and tested
- [ ] Plugin repository initialized and populated

### Production Deployment
- [ ] All services healthy and responding
- [ ] Plugin ecosystem tests passing (100% success rate)
- [ ] Frontend accessible and functional
- [ ] Database connections working with proper performance
- [ ] External API integrations working with expected response times
- [ ] Backup and recovery procedures tested successfully
- [ ] Security controls verified (authentication, authorization, encryption)
- [ ] Discovery service functioning with expected accuracy

### Post-Production
- [ ] Monitor service logs for errors and warnings
- [ ] Track plugin execution metrics and performance
- [ ] Monitor resource usage and set up auto-scaling
- [ ] Verify backup procedures with restore testing
- [ ] Document any issues and resolutions
- [ ] Establish regular maintenance schedule
- [ ] Set up performance baselines for future comparison

## 🚀 Scaling for Production (ENHANCED)

### Horizontal Scaling
```bash
# Scale compute-intensive services
docker compose up -d --scale capabilitiesmanager=8
docker compose up -d --scale brain=5
docker compose up -d --scale engineer=3
docker compose up -d --scale librarian=4

# Scale based on specific workloads
# For high discovery load:
docker compose up -d --scale librarian=6 --scale marketplace=4

# For high execution load:
docker compose up -d --scale capabilitiesmanager=10 --scale agentset=4
```

### Load Balancing (ENHANCED)
Consider using nginx or a cloud load balancer for:
- Frontend traffic distribution with SSL termination
- API endpoint load balancing with health checks
- Plugin execution load distribution with circuit breaking
- Service discovery and dynamic routing

Example nginx configuration:
```nginx
upstream brain_service {
    server brain1:5030;
    server brain2:5030;
    server brain3:5030;
    
    # Health check
    check interval=5000 rise=2 fall=3 timeout=3000;
}

server {
    listen 443 ssl;
    server_name stage7.example.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /brain/ {
        proxy_pass http://brain_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Circuit breaking
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}
```

### Database Scaling (ENHANCED)
- MongoDB replica sets for high availability (3+ nodes)
- MongoDB sharding for horizontal scaling of large datasets
- Redis clustering for cache scaling (6+ nodes for production)
- Regular database maintenance and optimization
- Implement read replicas for analytical queries
- Set up proper backup and restore procedures

### Advanced Scaling Strategies (NEW)

#### 1. Microservices Orchestration
```bash
# Use Kubernetes for advanced orchestration
# kubectl apply -f kubernetes/deployment.yaml
# kubectl apply -f kubernetes/services.yaml
# kubectl apply -f kubernetes/ingress.yaml
```

#### 2. Auto-scaling Configuration
```yaml
# Example Kubernetes Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: capabilitiesmanager-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: capabilitiesmanager
  minReplicas: 3
  maxReplicas: 15
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### 3. Service Mesh Integration
```bash
# Integrate with Istio or Linkerd for:
# - Advanced traffic management
# - Observability and tracing
# - Security policies
# - Retry and circuit breaking
```

## 📞 Support and Maintenance (ENHANCED)

### Regular Maintenance
- Update Docker images monthly with security patches
- Review and update plugin dependencies quarterly
- Monitor and clean up unused container images weekly
- Backup databases daily with verification
- Rotate security keys and certificates quarterly
- Review and update API keys and credentials
- Test disaster recovery procedures quarterly

### Advanced Monitoring Setup (NEW)

```bash
# Set up Prometheus for metrics collection
# Configure Grafana dashboards for visualization
# Implement alerting for critical metrics

# Example Prometheus configuration:
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'stage7-services'
    static_configs:
      - targets:
        - 'postoffice:5020'
        - 'brain:5030'
        - 'librarian:5040'
        - 'capabilitiesmanager:5060'
        - 'marketplace:5050'
        - 'engineer:5080'

# Key metrics to monitor:
# - Plugin execution time (p95 < 2s)
# - Discovery query time (p95 < 500ms)
# - Brain planning time (p95 < 3s)
# - Service error rates (< 0.1%)
# - Database query performance
# - Memory and CPU usage
```

### Troubleshooting Resources (UPDATED)
- Service logs: `docker compose logs [service]`
- Plugin execution logs: Check CapabilitiesManager logs
- System metrics: `docker stats`
- Integration tests: `node scripts/test-plugin-ecosystem.js`
- Discovery service diagnostics: `node scripts/diagnose-discovery.js`
- Performance profiling: `node scripts/profile-services.js`
- Security audit: `node scripts/security-audit.js`

### Common Performance Issues and Solutions (NEW)

| Issue | Symptom | Solution |
|-------|---------|----------|
| Slow plugin execution | High execution times, timeouts | Increase `PLUGIN_TIMEOUT`, scale CapabilitiesManager, optimize plugin code |
| Discovery latency | Slow brain planning, timeouts | Optimize ChromaDB indexes, increase Librarian resources, adjust `SEARCH_TOP_K` |
| Memory pressure | Container restarts, OOM errors | Increase container memory limits, optimize data caching, implement better garbage collection |
| High CPU usage | Slow response times, queueing | Scale services horizontally, optimize algorithms, implement rate limiting |
| Database bottlenecks | Slow queries, connection errors | Add read replicas, optimize indexes, implement query caching |

## 🎯 Best Practices for Production

### 1. Deployment Strategy
- Use blue-green deployment for zero-downtime updates
- Implement canary releases for new features
- Maintain rollback capability for all deployments
- Test all changes in staging environment first

### 2. Monitoring and Alerting
- Set up comprehensive monitoring for all services
- Configure alerts for critical metrics with appropriate thresholds
- Implement escalation procedures for different severity levels
- Monitor both technical and business metrics

### 3. Security Operations
- Implement regular security audits
- Monitor for unusual activity patterns
- Keep all dependencies updated with security patches
- Implement principle of least privilege for all access
- Regularly review and rotate credentials

### 4. Performance Optimization
- Profile services regularly to identify bottlenecks
- Optimize database queries and indexes
- Implement appropriate caching strategies
- Monitor and tune resource allocation
- Review and optimize algorithms periodically

## 📚 Additional Resources

- **Architecture Documentation**: [`consolidated-verb-discovery-architecture.md`](docs/consolidated-verb-discovery-architecture.md)
- **Developer Guide**: [`DEVELOPER_QUICK_REFERENCE.md`](docs/DEVELOPER_QUICK_REFERENCE.md)
- **API Documentation**: [`API.md`](docs/API.md)
- **Security Guide**: [`security_improvements.md`](docs/security_improvements.md)
- **Authentication**: [`authentication.md`](docs/authentication.md)
- **Environment Variables**: [`environment_variable_guide.md`](docs/environment_variable_guide.md)

## 🎉 Deployment Complete!

Your Stage7 system is now deployed with the enterprise-ready plugin ecosystem supporting the consolidated verb discovery architecture. The system provides:

✅ **Dynamic capability expansion** through semantic tool discovery
✅ **Multi-language plugin support** (Python, JavaScript, Container)
✅ **Brain-aware planning** with context-aware tool selection
✅ **Comprehensive security** with authentication and authorization
✅ **Scalable architecture** for production workloads
✅ **Advanced monitoring** and operational capabilities

For ongoing support and development, refer to the comprehensive documentation and consider implementing the advanced scaling and monitoring strategies for production environments.
