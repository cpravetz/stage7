# Health Check Endpoints

This document describes the health check endpoints used in the system.

## Endpoints

The system uses two primary health check endpoints:

1. **`/healthy`** - A simple liveness check that always returns HTTP 200
   - Used to determine if the service process is running
   - Always returns `{ status: 'ok' }` with a timestamp
   - Used by infrastructure to determine if a service should be restarted

2. **`/ready`** - A readiness check that returns HTTP 200 only if the service is ready to accept traffic
   - Returns HTTP 200 if the service is ready, HTTP 503 if not
   - Used by other services to determine if they can depend on this service
   - Accepts a `detail=full` query parameter to return detailed status information

3. **`/health`** (Legacy) - Redirects to `/ready?detail=full` for backward compatibility
   - This endpoint is maintained for backward compatibility
   - It redirects to `/ready?detail=full` with a 307 Temporary Redirect

## Usage

### Checking if a Service is Running

To check if a service process is running:

```
GET /healthy
```

This will always return HTTP 200 if the service process is running.

### Checking if a Service is Ready

To check if a service is ready to accept traffic:

```
GET /ready
```

This will return HTTP 200 if the service is ready, HTTP 503 if not.

### Getting Detailed Status Information

To get detailed status information:

```
GET /ready?detail=full
```

This will return detailed status information about the service, including:
- Connection status to dependencies
- Number of registered components
- Service-specific metrics

## Implementation

All services should implement these endpoints consistently. The `HealthCheckManager` class in the PostOffice service provides a reference implementation.

## Authentication

Health check endpoints are excluded from authentication requirements. This is handled automatically by the authentication middleware.
