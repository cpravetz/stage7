# Service Discovery and Configuration Management

This document describes the implementation of service discovery and configuration management in the Stage7 system.

## Service Discovery

### Overview

Service discovery allows services to find and communicate with each other without hardcoded URLs. This provides several benefits:

1. **Dynamic Service Location**: Services can be moved or scaled without updating configuration
2. **Load Balancing**: Requests can be distributed across multiple instances of a service
3. **Health Checking**: Unhealthy services are automatically removed from the registry
4. **Resilience**: The system can continue to function even if some services are unavailable

### Implementation

The service discovery implementation consists of the following components:

1. **Consul**: A service discovery and configuration management tool
2. **ServiceDiscovery**: A client library for interacting with Consul
3. **BaseEntity**: Enhanced to register with Consul and discover other services

### Service Registration

When a service starts, it registers itself with Consul:

```typescript
await this.serviceDiscovery.registerService(
  this.id,
  this.componentType,
  serviceUrl,
  [this.componentType.toLowerCase()],
  parseInt(this.port)
);
```

This registration includes:
- A unique service ID
- The service type (e.g., "Brain", "PostOffice")
- The service URL
- Tags for filtering
- The port the service is running on

### Service Discovery

Services primarily discover other services through Consul. The `BaseEntity` class, which most services extend, provides a `getServiceUrl(serviceType: string)` method. This method implements the following discovery order:

1.  **Consul Lookup**: It first attempts to discover the service using the shared `ServiceDiscovery` client, which queries Consul for a healthy instance of the specified `serviceType`.
    ```typescript
    // Inside BaseEntity.getServiceUrl, simplified:
    // const discoveredUrl = await this.serviceDiscovery.discoverService(serviceType);
    // if (discoveredUrl) return discoveredUrl;
    ```
2.  **Environment Variable Fallback**: If the service is not found in Consul, it falls back to checking for an environment variable named `SERVICETYPE_URL` (e.g., `BRAIN_URL`).
    ```typescript
    // Inside BaseEntity.getServiceUrl, simplified:
    // const envUrl = process.env[`${serviceType.toUpperCase()}_URL`];
    // if (envUrl) return envUrl;
    ```

This two-step process (Consul first, then environment variable) is the standard way services locate each other.

**Special Case: PostOffice Discovery**
The `ServiceDiscovery` client itself (in `shared/src/discovery/serviceDiscovery.ts`) has a special handling for discovering the `PostOffice` service. To avoid circular dependencies during startup, it directly uses the `POSTOFFICE_URL` environment variable or a default value (`postoffice:5020`) instead of querying Consul for PostOffice.

### Fallback Mechanism Summary

The primary fallback mechanism is now simplified:

1.  **Primary**: Discover the service using Consul.
2.  **Secondary**: If Consul lookup fails or `ServiceDiscovery` is unavailable, use the specific environment variable for the target service (e.g., `BRAIN_URL`).

The previous reliance on PostOffice's local registry as a tertiary fallback for `BaseEntity` services has been removed, as services now register directly with Consul and PostOffice's role as a service registration broker has been deprecated.

This streamlined approach ensures that the system can still function if Consul is temporarily unavailable, provided the necessary environment variables are configured in the deployment (e.g., in `docker-compose.yaml`).

## Configuration Management

### Overview

Configuration management allows services to retrieve and update configuration values from a central location. This provides several benefits:

1. **Centralized Configuration**: Configuration values are stored in a single location
2. **Dynamic Updates**: Configuration can be updated without restarting services
3. **Environment-Specific Configuration**: Different environments can have different configuration values
4. **Versioning**: Configuration changes can be tracked and versioned

### Implementation

The configuration management implementation consists of the following components:

1. **Configuration Files**: JSON files for storing configuration values

### Configuration Storage

Configuration values are stored in JSON files, one for each environment:

- default.json
- development.json
- staging.json
- production.json

Services load these files at startup.

### Configuration Retrieval

Services can retrieve configuration values by reading environment variables or configuration files.

```typescript
// Example: Get database host from environment variable or use a default value
const dbHost = process.env.DATABASE_HOST || 'localhost';
```

This returns the value of the specified configuration key, or the default value if the key is not found.

### Configuration Updates

Configuration values can be updated by modifying the environment variables or configuration files and restarting the service.

### Caching

Caching mechanisms can be implemented at the application level if needed.

## Integration

The service discovery and configuration management systems are integrated with the existing Stage7 architecture:

1.  **`BaseEntity`**: This shared class is central to service discovery. Services extending `BaseEntity` automatically:
    *   Register themselves with Consul on startup.
    *   Utilize the `getServiceUrl()` method for discovering other services (Consul-first, then environment variable fallback).
2.  **`ServiceDiscovery` Client**: A shared client in `shared/src/discovery/serviceDiscovery.ts` provides the core logic for interacting with Consul (registration, discovery) and is used by `BaseEntity`.
3.  **`PostOffice`**:
    *   Like other services, PostOffice extends `BaseEntity` and thus registers with Consul and uses the standard `getServiceUrl()` method for its own outbound service discovery needs.
    *   Its previous role as a service registration endpoint (`/registerComponent`) and as a direct fallback lookup source for other services has been deprecated in favor of direct Consul interaction by each service (via `BaseEntity`).
    *   PostOffice continues to use service discovery for routing messages and for its internal components to locate other necessary services.

This integration provides a more robust and flexible system, with Consul as the authoritative source for service locations and `BaseEntity` providing a consistent implementation for all services.
