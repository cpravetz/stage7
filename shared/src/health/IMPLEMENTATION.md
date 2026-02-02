# Unified Health Check Architecture

## Overview

All services extending `BaseService` now use a single unified `HealthCheckManager` class for consistent health check endpoints across the entire system.

## Key Components

### HealthCheckManager (`shared/src/health/HealthCheckManager.ts`)

A reusable manager that provides:

- **`/healthy`** - Liveness check (always returns 200 if process running)
- **`/ready`** - Readiness check (returns 200 only if service is ready)
- **`/status`** - Alias for `/ready?detail=full`
- **`/health`** - Legacy endpoint (redirects to `/ready?detail=full`)

### BaseService Enhancement

The `setupHealthCheck(app)` method in `BaseService` automatically:

1. Creates a `HealthCheckManager` instance
2. Registers RabbitMQ dependency (if available)
3. Registers Consul dependency (if available)
4. Sets up all endpoints with consistent behavior

## Usage

Services should call `this.setupHealthCheck(app)` after creating their Express app:

```typescript
class MyService extends BaseEntity {
  init() {
    const app = express();
    
    // Set up unified health check endpoints
    this.setupHealthCheck(app);
    
    // ... rest of initialization
  }
}
```

## Dependency Registration

Services can extend the default dependencies by overriding `setupHealthCheck`:

```typescript
class MyService extends BaseEntity {
  init() {
    const app = express();
    
    // Set up default health checks
    this.setupHealthCheck(app);
    
    // Add custom dependency
    const { HealthCheckManager } = require('@cktmcs/shared');
    const manager = new HealthCheckManager(app, 'MyService');
    manager.registerDependency({
      name: 'CustomDB',
      isConnected: () => this.dbConnected,
      test: async () => await this.testDBConnection()
    });
  }
}
```

## Response Format

### Liveness Check (`/healthy`)
```json
{
  "status": "ok",
  "timestamp": "2026-01-30T20:40:00.000Z",
  "message": "Brain service is running"
}
```

### Readiness Check (`/ready`)
```json
{
  "ready": true,
  "timestamp": "2026-01-30T20:40:00.000Z",
  "message": "Brain is ready"
}
```

### Detailed Status (`/ready?detail=full`)
```json
{
  "ready": true,
  "timestamp": "2026-01-30T20:40:00.000Z",
  "message": "Brain is ready",
  "dependencies": {
    "RabbitMQ": "ok",
    "Consul": "ok"
  }
}
```

## Benefits

1. **Consistency** - All services use the same endpoint structure
2. **Maintainability** - Single point of update for health check logic
3. **Extensibility** - Services can easily add custom dependencies
4. **Decoupling** - Health checks are independent from service implementations
5. **Observability** - Detailed status information for troubleshooting

## Migration Path

Services can gradually migrate from custom implementations to the unified system:

1. Remove individual `/health`, `/healthy`, `/ready` endpoint definitions
2. Call `this.setupHealthCheck(app)` instead
3. Use `registerDependency()` for custom checks if needed

## Service Registry Integration

The `Consul` service discovery automatically uses the `/ready` endpoint for health checks during service registration:

```
Check: {
  HTTP: "http://service:port/ready",
  Interval: "45s",
  Timeout: "15s",
  DeregisterCriticalServiceAfter: "5m"
}
```

Services that are not ready will be deregistered from Consul, preventing requests from being routed to them.
