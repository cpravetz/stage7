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

Services can discover other services using the ServiceDiscovery client:

```typescript
const serviceUrl = await this.serviceDiscovery.discoverService('Brain');
```

This returns the URL of a healthy instance of the specified service type.

### Fallback Mechanism

If service discovery fails, the system falls back to environment variables:

1. First, try to discover the service using Consul
2. If that fails, check the local registry
3. If that fails, use the environment variable

This ensures that the system can continue to function even if Consul is unavailable.

## Configuration Management

### Overview

Configuration management allows services to retrieve and update configuration values from a central location. This provides several benefits:

1. **Centralized Configuration**: Configuration values are stored in a single location
2. **Dynamic Updates**: Configuration can be updated without restarting services
3. **Environment-Specific Configuration**: Different environments can have different configuration values
4. **Versioning**: Configuration changes can be tracked and versioned

### Implementation

The configuration management implementation consists of the following components:

1. **ConfigService**: A service for storing and retrieving configuration values
2. **ConfigClient**: A client library for interacting with the ConfigService
3. **Configuration Files**: JSON files for storing configuration values

### Configuration Storage

Configuration values are stored in JSON files, one for each environment:

- default.json
- development.json
- staging.json
- production.json

The ConfigService loads these files at startup and provides an API for retrieving and updating values.

### Configuration Retrieval

Services can retrieve configuration values using the ConfigClient:

```typescript
const value = await configClient.get('app.name', 'Default Name');
```

This returns the value of the specified configuration key, or the default value if the key is not found.

### Configuration Updates

Services can update configuration values using the ConfigClient:

```typescript
await configClient.set('app.name', 'New Name', 'Application name');
```

This updates the value of the specified configuration key and saves it to the appropriate configuration file.

### Caching

The ConfigClient caches configuration values to reduce the number of requests to the ConfigService. The cache is invalidated after a configurable TTL (default: 1 minute).

## Integration

The service discovery and configuration management systems are integrated with the existing Stage7 architecture:

1. **BaseEntity**: Enhanced to register with Consul and discover other services
2. **PostOffice**: Updated to use service discovery for routing messages
3. **All Services**: Updated to use the ConfigClient for configuration

This integration provides a more robust and flexible system that can adapt to changing environments and requirements.
