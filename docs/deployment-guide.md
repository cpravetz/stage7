# Stage7 Deployment Guide

## 🚀 Overview

This guide covers deploying the Stage7 system with the new enterprise-ready plugin ecosystem supporting Python, JavaScript, and Container plugins.

## 📋 Prerequisites

### System Requirements
- **Docker**: Version 20.10+ with Docker Compose
- **Node.js**: Version 18+ for frontend and services
- **Python**: Version 3.9+ for Python plugins
- **Memory**: Minimum 8GB RAM recommended
- **Storage**: Minimum 20GB available space

### Environment Setup
- **Operating System**: Linux, macOS, or Windows with WSL2
- **Network**: Ports 5000-5100 available for services
- **Docker**: Docker daemon running with container support

## 🔧 Pre-Deployment Configuration

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
# Core Configuration
NODE_ENV=production
CLIENT_SECRET=your-secure-secret-here

# Service URLs (adjust for your deployment)
POSTOFFICE_URL=postoffice:5020
BRAIN_URL=brain:5030
LIBRARIAN_URL=librarian:5040
CAPABILITIESMANAGER_URL=capabilitiesmanager:5060
MARKETPLACE_URL=marketplace:5050
ENGINEER_URL=engineer:5080
SECURITYMANAGER_URL=securitymanager:5010

# Database Configuration
MONGODB_URI=mongodb://mongodb:27017/stage7
REDIS_URL=redis://redis:6379

# External APIs (optional)
OPENWEATHER_API_KEY=your-openweather-api-key
DUCKDUCKGO_API_KEY=your-duckduckgo-api-key

# Security
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here

# Plugin Configuration
PLUGIN_TIMEOUT=30000
CONTAINER_MEMORY_LIMIT=512m
CONTAINER_CPU_LIMIT=1.0
```

### 2. Docker Configuration

Ensure Docker daemon is running:
```bash
# Check Docker status
docker --version
docker compose --version

# Start Docker daemon (if needed)
sudo systemctl start docker
```

### 3. Network Configuration

The system uses the following ports:
- **5010**: SecurityManager
- **5020**: PostOffice (main entry point)
- **5030**: Brain
- **5040**: Librarian
- **5050**: Marketplace
- **5060**: CapabilitiesManager
- **5070**: Frontend
- **5080**: Engineer
- **27017**: MongoDB
- **6379**: Redis

## 🏗️ Deployment Steps

### Step 1: Build All Services

```bash
# Build all services
docker compose build

# Build specific services (if needed)
docker compose build capabilitiesmanager
docker compose build marketplace
docker compose build engineer
```

### Step 2: Start Infrastructure Services

```bash
# Start database services first
docker compose up -d mongodb redis

# Wait for databases to be ready
sleep 10
```

### Step 3: Start Core Services

```bash
# Start security and messaging services
docker compose up -d securitymanager postoffice

# Wait for core services
sleep 5

# Start remaining services
docker compose up -d brain librarian capabilitiesmanager marketplace engineer

# Start frontend
docker compose up -d frontend
```

### Step 4: Verify Deployment

```bash
# Check all services are running
docker compose ps

# Check service health
curl http://localhost:5020/health  # PostOffice
curl http://localhost:5060/health  # CapabilitiesManager
curl http://localhost:5050/health  # Marketplace
curl http://localhost:5080/health  # Engineer
```

## 🧪 Post-Deployment Testing

### 1. Run Integration Tests

```bash
# Run comprehensive plugin ecosystem tests
node scripts/test-plugin-ecosystem.js

# Expected output: All tests should pass
```

### 2. Test Plugin Discovery

```bash
# List available plugins
curl http://localhost:5020/plugins

# Expected: Should return 5 production plugins
```

### 3. Test Plugin Execution

```bash
# Test TEXT_ANALYSIS plugin
curl -X POST http://localhost:5020/execute \
  -H "Content-Type: application/json" \
  -d '{
    "actionVerb": "TEXT_ANALYSIS",
    "inputs": {
      "text": "This is a test message for analysis."
    }
  }'
```

### 4. Test Frontend Access

```bash
# Access frontend
open http://localhost:5070
```

## 🔍 Monitoring and Troubleshooting

### Service Logs

```bash
# View all service logs
docker compose logs

# View specific service logs
docker compose logs capabilitiesmanager
docker compose logs marketplace
docker compose logs engineer

# Follow logs in real-time
docker compose logs -f postoffice
```

### Common Issues

#### 1. Plugin Execution Failures
```bash
# Check CapabilitiesManager logs
docker compose logs capabilitiesmanager

# Check Python plugin dependencies
docker compose exec capabilitiesmanager pip list
```

#### 2. Container Plugin Issues
```bash
# Check Docker daemon
docker info

# Check container plugin images
docker images | grep stage7

# Check container plugin execution
docker compose logs capabilitiesmanager | grep -i container
```

#### 3. Service Communication Issues
```bash
# Check service discovery
curl http://localhost:5020/components

# Check authentication
curl http://localhost:5010/health
```

### Performance Monitoring

```bash
# Check resource usage
docker stats

# Check plugin execution times
docker compose logs capabilitiesmanager | grep -i "execution time"

# Monitor container plugin resource usage
docker stats | grep stage7-plugin
```

## 🔧 Configuration Tuning

### Plugin Performance

Adjust plugin timeouts in `.env`:
```bash
PLUGIN_TIMEOUT=60000  # Increase for complex plugins
CONTAINER_MEMORY_LIMIT=1g  # Increase for memory-intensive plugins
CONTAINER_CPU_LIMIT=2.0  # Increase for CPU-intensive plugins
```

### Service Scaling

Scale services based on load:
```bash
# Scale CapabilitiesManager for high plugin usage
docker compose up -d --scale capabilitiesmanager=3

# Scale Marketplace for high discovery load
docker compose up -d --scale marketplace=2
```

### Database Optimization

```bash
# MongoDB optimization
docker compose exec mongodb mongo --eval "db.adminCommand('setParameter', {logLevel: 1})"

# Redis optimization
docker compose exec redis redis-cli CONFIG SET maxmemory 1gb
```

## 🔒 Security Considerations

### 1. Authentication
- Change default `CLIENT_SECRET` in production
- Use strong JWT secrets
- Enable HTTPS in production environments

### 2. Plugin Security
- Review plugin permissions before deployment
- Monitor plugin resource usage
- Use container isolation for untrusted plugins

### 3. Network Security
- Use firewalls to restrict access to internal ports
- Enable TLS for inter-service communication
- Monitor network traffic for anomalies

## 📊 Production Checklist

### Pre-Production
- [ ] All environment variables configured
- [ ] Security secrets updated from defaults
- [ ] Database backups configured
- [ ] Monitoring and alerting set up
- [ ] Load testing completed
- [ ] Security audit performed

### Production Deployment
- [ ] All services healthy
- [ ] Plugin ecosystem tests passing
- [ ] Frontend accessible
- [ ] Database connections working
- [ ] External API integrations working
- [ ] Backup and recovery procedures tested

### Post-Production
- [ ] Monitor service logs
- [ ] Track plugin execution metrics
- [ ] Monitor resource usage
- [ ] Verify backup procedures
- [ ] Document any issues and resolutions

## 🚀 Scaling for Production

### Horizontal Scaling
```bash
# Scale compute-intensive services
docker compose up -d --scale capabilitiesmanager=5
docker compose up -d --scale brain=3
docker compose up -d --scale engineer=2
```

### Load Balancing
Consider using nginx or a cloud load balancer for:
- Frontend traffic distribution
- API endpoint load balancing
- Plugin execution load distribution

### Database Scaling
- MongoDB replica sets for high availability
- Redis clustering for cache scaling
- Regular database maintenance and optimization

## 📞 Support and Maintenance

### Regular Maintenance
- Update Docker images monthly
- Review and update plugin dependencies
- Monitor and clean up unused container images
- Backup databases regularly

### Troubleshooting Resources
- Service logs: `docker compose logs [service]`
- Plugin execution logs: Check CapabilitiesManager logs
- System metrics: `docker stats`
- Integration tests: `node scripts/test-plugin-ecosystem.js`

---

## 🎉 Deployment Complete!

Your Stage7 system is now deployed with the enterprise-ready plugin ecosystem. The system supports unlimited plugin development capabilities across any programming language! 🚀

For ongoing support and development, refer to:
- **Plugin Development Guide**: `docs/plugin-development-guide.md`
- **Architecture Documentation**: `docs/gemini-cm-architecture-update.md`
- **Integration Tests**: `scripts/test-plugin-ecosystem.js`
