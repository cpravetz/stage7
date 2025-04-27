# Authentication Example

This document provides examples of how to implement authentication in your services using the RS256 authentication system.

## Basic Authentication

Here's a basic example of how to implement authentication in an Express service:

```typescript
import express from 'express';
import { BaseEntity, createAuthMiddleware, requireRoles } from '@cktmcs/shared';

// Create your service extending BaseEntity
class MyService extends BaseEntity {
  private app: express.Express;

  constructor() {
    // Initialize BaseEntity
    super('my-service-id', 'MyService', 'myservice', '5000');
    
    this.app = express();
    this.configureRoutes();
  }

  private configureRoutes() {
    // Create an authentication middleware using this service's BaseEntity instance
    const authMiddleware = createAuthMiddleware(this);
    
    // Public routes (no authentication required)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Protected routes (authentication required)
    this.app.get('/protected', authMiddleware, (req, res) => {
      // The user object is added to the request by the authMiddleware
      const user = (req as any).user;
      res.json({ message: `Hello, ${user.componentType}!` });
    });
    
    // Role-based protected routes
    this.app.get('/admin', authMiddleware, requireRoles(['admin']), (req, res) => {
      res.json({ message: 'Admin access granted' });
    });
  }
}
```

## Service-to-Service Authentication

When making requests to other services, you should include the authentication token:

```typescript
import { BaseEntity } from '@cktmcs/shared';
import axios from 'axios';

class MyService extends BaseEntity {
  async callAnotherService() {
    try {
      // Get the authentication token
      const tokenManager = this.getTokenManager();
      const authHeader = await tokenManager.getAuthHeader();
      
      // Make the authenticated request
      const response = await axios.get('http://other-service:5000/api/resource', {
        headers: authHeader
      });
      
      return response.data;
    } catch (error) {
      console.error('Error calling another service:', error);
      throw error;
    }
  }
}
```

## Client Authentication

For client applications, you'll need to:

1. Authenticate the client with the SecurityManager service
2. Store the received token
3. Include the token in all subsequent requests

```typescript
// Client-side authentication example
async function authenticateClient() {
  try {
    const response = await axios.post('http://securitymanager:5010/auth/client', {
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret'
    });
    
    if (response.data.token) {
      // Store the token
      localStorage.setItem('auth_token', response.data.token);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Authentication failed:', error);
    return false;
  }
}

// Making authenticated requests
async function fetchProtectedResource() {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  try {
    const response = await axios.get('http://api-gateway:5000/api/resource', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid, try to re-authenticate
      const authenticated = await authenticateClient();
      if (authenticated) {
        return fetchProtectedResource();
      }
    }
    
    throw error;
  }
}
```

## Best Practices

1. Always use HTTPS in production to protect tokens in transit
2. Store tokens securely (use secure cookies or localStorage with proper security measures)
3. Implement token refresh mechanisms to handle token expiration
4. Include proper error handling for authentication failures
5. Use role-based or permission-based authorization for fine-grained access control
