# Authentication Middleware

This directory contains the centralized authentication middleware for the Stage7 platform. All services should use these shared middleware functions for authentication and authorization.

## Overview

The authentication system is based on JWT tokens using RS256 asymmetric encryption. The SecurityManager service is responsible for issuing and verifying tokens, while all other services use the shared middleware to validate tokens.

## Available Middleware

### Authentication

- `createAuthMiddleware(entity: BaseEntity)`: Creates an authentication middleware using a BaseEntity instance's verifyToken method
- `isHealthCheckEndpoint(path)`: Utility function to check if a path is a health check endpoint

### Authorization

- `requireRoles(requiredRoles: string[])`: Middleware to require specific roles
- `requirePermissions(requiredPermissions: string[])`: Middleware to require specific permissions

## Usage Example

All services in the Stage7 platform should extend BaseEntity, which provides built-in authentication functionality:

```typescript
import express from 'express';
import { BaseEntity } from '@cktmcs/shared';

export class MyService extends BaseEntity {
  private app: express.Express;

  constructor() {
    super('my-service-id', 'MyService', 'myservice', '5000');
    this.app = express();

    // Apply authentication middleware to all routes
    // The BaseEntity.verifyToken method already handles skipping authentication for health check endpoints
    this.app.use((req, res, next) => this.verifyToken(req, res, next));

    // Set up routes
    this.app.get('/protected', (req, res) => {
      // The user object is added to the request by the verifyToken middleware
      const user = (req as any).user;
      res.json({ message: `Hello, ${user.componentType}!` });
    });
  }
}
```

## Health Check Endpoints

Health check endpoints are automatically excluded from authentication. The following paths are recognized as health check endpoints:

- `/health`
- `/healthy`
- `/ready`
- `/status`

Any path that exactly matches one of these or starts with one of these followed by a slash (e.g., `/health/detailed`) will bypass authentication.

## Security Service Authentication

The Security service has its own specialized authentication middleware in `services/security/src/middleware/securityAuthMiddleware.ts` that handles user authentication, MFA, email verification, and other security-specific concerns.
