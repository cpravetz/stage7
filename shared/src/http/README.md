# Authenticated HTTP Clients

This directory contains utilities for making authenticated HTTP requests in the Stage7 platform.

## Overview

All API calls between services should include authentication tokens to ensure proper security. The utilities in this directory provide a standardized way to create authenticated HTTP clients that automatically add authentication tokens to requests.

## Available Utilities

- `createAuthenticatedAxios(serviceId, securityManagerUrl, clientSecret)`: Creates an authenticated axios instance for service-to-service communication
- `createClientAuthenticatedAxios(getToken)`: Creates an authenticated axios instance for frontend-to-service communication

## Usage Examples

### For Services (Backend)

Services should use the `authenticatedApi` property provided by BaseEntity or the `getAuthenticatedAxios()` method:

```typescript
import { BaseEntity } from '@cktmcs/shared';

export class MyService extends BaseEntity {
  async callAnotherService() {
    try {
      // Use the authenticatedApi property
      const response = await this.authenticatedApi.get('http://other-service:5000/api/resource');
      
      // Or use the getAuthenticatedAxios method
      const api = this.getAuthenticatedAxios();
      const response2 = await api.get('http://other-service:5000/api/resource');
      
      return response.data;
    } catch (error) {
      console.error('Error calling another service:', error);
      throw error;
    }
  }
}
```

### For Frontend (React)

Frontend applications should create an authenticated axios instance:

```typescript
import axios from 'axios';
import { API_BASE_URL } from './config';

// Create an authenticated axios instance
function createClientAuthenticatedAxios(getToken) {
  const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add authentication interceptor
  api.interceptors.request.use(async (config) => {
    // Get token
    const token = getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });

  return api;
}

// Usage
const api = createClientAuthenticatedAxios(() => localStorage.getItem('accessToken'));
const response = await api.get('/api/resource');
```

## Authentication Bypass

The authenticated HTTP clients automatically skip authentication for the following endpoints:

- Health check endpoints: `/health`, `/healthy`, `/ready`, `/status`
- Security manager authentication endpoints: `/auth/`, `/login`, `/public-key`

This ensures that health checks and authentication requests can still work without requiring authentication tokens.
