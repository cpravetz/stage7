# Authentication for API Calls

All services in the Stage7 platform should use authenticated API calls to communicate with each other. This document explains how to make authenticated API calls in the platform.

## Overview

The BaseEntity class provides built-in support for authenticated API calls through:

1. The `authenticatedApi` property
2. The `getAuthenticatedAxios()` method

Both of these options automatically add authentication tokens to API requests, handle token caching, and refresh tokens when needed.

## Making Authenticated API Calls

### From Services (Extending BaseEntity)

All services should extend BaseEntity and use the `authenticatedApi` property for making API calls:

```typescript
// Example of making an authenticated API call
const response = await this.authenticatedApi.get(`http://${serviceUrl}/endpoint`);
```

### Getting Service URLs

BaseEntity provides a `getServiceUrls()` method that returns URLs for commonly used services:

```typescript
// Get URLs for all services
const { 
  brainUrl, 
  librarianUrl, 
  capabilitiesManagerUrl,
  // etc.
} = await this.getServiceUrls();

// Make an authenticated call to a service
const response = await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, data);
```

### For Utility Functions

If you need to make authenticated API calls from utility functions that don't have access to a BaseEntity instance, pass the entity as a parameter:

```typescript
// Utility function that needs to make authenticated API calls
export async function myUtilityFunction(entity: BaseEntity, data: any) {
  // Get service URLs
  const { librarianUrl } = await entity.getServiceUrls();
  
  // Make authenticated API call
  const response = await entity.authenticatedApi.post(`http://${librarianUrl}/endpoint`, data);
  
  return response.data;
}

// Usage in a service
const result = await myUtilityFunction(this, someData);
```

## Authentication Bypass

The authenticated API clients automatically skip authentication for the following endpoints:

- Health check endpoints: `/health`, `/healthy`, `/ready`, `/status`
- Security manager authentication endpoints: `/auth/`, `/login`, `/public-key`

This ensures that health checks and authentication requests can still work without requiring authentication tokens.

## Best Practices

1. **Always use authenticatedApi**: Never use direct axios calls for service-to-service communication
2. **Use getServiceUrls()**: Instead of hardcoding service URLs, use the getServiceUrls() method
3. **Pass the entity to utilities**: When creating utility functions, pass the BaseEntity instance to allow them to use authenticated API calls
4. **Don't create separate axios instances**: Reuse the authenticatedApi property instead of creating new axios instances
