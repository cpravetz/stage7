# Authentication and Authorization System

This document provides a comprehensive overview of the authentication and authorization system used in the Stage7 platform.

## 1. Overview

The Stage7 platform uses a centralized authentication service, the `SecurityManager`, to issue JSON Web Tokens (JWTs) for both service-to-service and user authentication. The system is built on the RS256 (RSA Signature with SHA-256) asymmetric algorithm, which uses a private key for signing tokens and a public key for verification.

This approach ensures that only the `SecurityManager` can issue valid tokens, while any service can verify the authenticity of a token without needing access to the private key.

## 2. Architecture

The authentication system consists of the following key components:

*   **SecurityManager Service**: A central service responsible for:
    *   Authenticating services and users.
    *   Generating and signing JWT tokens with the private key.
    *   Providing an endpoint to verify tokens.
    *   Serving the public key to other services.

*   **ServiceTokenManager**: A shared utility class used by all services to manage authentication tokens. Its responsibilities include:
    *   Requesting tokens from the `SecurityManager`.
    *   Caching tokens to reduce the number of requests to the `SecurityManager`.
    *   Proactively refreshing tokens before they expire.
    *   Verifying tokens, first by attempting local verification with the public key, and falling back to the `SecurityManager`'s verification endpoint if needed.

*   **BaseEntity**: A base class that all services extend. It provides common functionality, including a `verifyToken` method that acts as an authentication middleware for Express routes.

*   **Authentication Middleware**: A set of Express middleware functions that protect routes and enforce role-based access control (RBAC). These include:
    *   `createAuthMiddleware`: A middleware that uses the `BaseEntity.verifyToken` method to protect routes.
    *   `requireRoles`: A middleware that checks if a user has the required roles to access a route.
    *   `requirePermissions`: A middleware that checks for specific permissions.

## 3. Authentication Flow

### 3.1. Service-to-Service Authentication

1.  When a service starts, its `ServiceTokenManager` instance requests a token from the `SecurityManager` by providing its service ID and a shared secret.
2.  The `SecurityManager` verifies the credentials against its service registry.
3.  If the credentials are valid, the `SecurityManager` generates a JWT signed with the private key and returns it to the service.
4.  The service's `ServiceTokenManager` caches the token.
5.  For subsequent requests to other services, the `ServiceTokenManager` attaches the token to the `Authorization` header.
6.  The receiving service uses its `verifyToken` middleware to verify the token's signature and claims.

### 3.2. User Authentication

1.  A user logs in with their credentials (e.g., username and password) via an endpoint in the `SecurityManager`.
2.  The `SecurityManager` verifies the credentials against the user database.
3.  If successful, it generates a JWT for the user, containing their ID, roles, and permissions.
4.  The client application receives the token and stores it securely.
5.  For subsequent API requests, the client includes the token in the `Authorization` header.

## 4. Token Management

### 4.1. JWT Token Structure

The JWT token contains the following claims:

*   **iss** (Issuer): The issuer of the token (`SecurityManager`).
*   **sub** (Subject): The user ID or service ID.
*   **aud** (Audience): The intended audience for the token (`stage7-services`).
*   **exp** (Expiration Time): The timestamp after which the token expires (typically 1 hour).
*   **iat** (Issued At): The timestamp at which the token was issued.
*   **jti** (JWT ID): A unique identifier for the token.
*   **componentType**: The type of component (e.g., `Service`, `User`).
*   **roles**: An array of roles assigned to the subject.
*   **permissions**: An array of permissions assigned to the subject.

### 4.2. Token Verification

The `BaseEntity.verifyToken` method, in conjunction with the `ServiceTokenManager`, performs a robust, multi-step verification process:

1.  **Cache Check**: It first checks an in-memory cache for the token to avoid re-verification.
2.  **Local Verification**: If not in the cache, it attempts to verify the token locally using the public key. This is the preferred method as it avoids a network call.
3.  **SecurityManager Verification**: If local verification fails (e.g., the public key is not available), it calls the `SecurityManager`'s `/verify` endpoint as a fallback.

### 4.3. Token Refresh

The `ServiceTokenManager` proactively refreshes tokens before they expire to ensure that services always have a valid token.

## 5. Key Management

*   **Private Key**: The RSA private key is stored securely within the `SecurityManager` service (`services/security/keys/private.key`) and is never exposed.
*   **Public Key**: The corresponding public key is made available to all other services for token verification. It is distributed in the `shared/keys` directory and also available via the `SecurityManager`'s `/public-key` endpoint.

## 6. Role-Based Access Control (RBAC)

The system implements RBAC to control access to resources.

*   **Roles**: Users and services are assigned roles (e.g., `admin`, `mission:manage`).
*   **Permissions**: Roles are associated with a set of permissions (e.g., `user:create`, `data:read`).
*   **Middleware**: The `requireRoles` and `requirePermissions` middleware are used to protect routes by checking the roles and permissions present in the user's or service's validated JWT.

## 7. Implementation Example

Here is a basic example of how to protect an Express route in a service:

```typescript
import express from 'express';
import { BaseEntity, createAuthMiddleware, requireRoles } from '@cktmcs/shared';

class MyService extends BaseEntity {
  private app: express.Express;

  constructor() {
    super('my-service-id', 'MyService', 'myservice', '5000');
    this.app = express();
    this.configureRoutes();
  }

  private configureRoutes() {
    const authMiddleware = createAuthMiddleware(this);

    // This route requires a valid token
    this.app.get('/protected', authMiddleware, (req, res) => {
      const user = (req as any).user;
      res.json({ message: `Hello, ${user.componentType}!` });
    });

    // This route requires a valid token and the 'admin' role
    this.app.get('/admin', authMiddleware, requireRoles(['admin']), (req, res) => {
      res.json({ message: 'Admin access granted' });
    });
  }
}
```

## 8. Future Improvement Opportunities

While the current system is robust, the following enhancements could be considered in the future:

*   **OAuth/SAML Integration**: Add support for third-party identity providers.
*   **Advanced MFA**: Implement more multi-factor authentication methods like WebAuthn/FIDO2.
*   **Comprehensive Audit Logging**: Implement detailed logging for all security-related events.
*   **User Session Management**: Add capabilities to manage and revoke user sessions.
*   **Advanced Security Policies**: Implement configurable password policies, IP-based restrictions, and device management.

## 9. Implementation Details

The RS256 authentication system involved the following key changes and implementations:

### 9.1. SecurityManager Service Enhancements
*   **Token Verification Endpoint:** Enhanced to accept tokens from the `Authorization` header.
*   **Client Authentication Endpoint:** Added for user authentication flows.
*   **Service Registry:** Updated to manage registered services and their credentials.
*   **Key Management:** Implemented secure generation, storage, and distribution of RS256 key pairs.

### 9.2. ServiceTokenManager Fixes and Enhancements
*   **`verifyToken` Method:** Removed bypass code and implemented proper token verification using the `SecurityManager` service, with fallback to local verification if the `SecurityManager` is unavailable.
*   **`getToken` Method:** Fixed to reliably fetch tokens from the `SecurityManager`.
*   **`fetchPublicKey` Method:** Enhanced to handle public key distribution.

### 9.3. BaseEntity Integration
*   **`verifyToken` Middleware:** Removed bypass code and integrated proper token verification using the `ServiceTokenManager`. User information is now added to the request object after successful verification.

### 9.4. Authentication Middleware
*   **Reusable Middleware:** Created for token verification and applied to protected routes.
*   **Role-Based Access Control:** Implemented `requireRoles` and `requirePermissions` middleware to enforce fine-grained access control.

### 9.5. Key Management
*   **Key Generation and Rotation:** Scripts were created for secure key generation and rotation.
*   **Public Key Distribution:** Enhanced mechanism for distributing the public key to all services.
*   **Key Backup:** Added functionality for backing up keys.

### 9.6. Testing and Documentation
*   **Comprehensive Test Scripts:** Created for token generation, verification, client authentication, and end-to-end authentication.
*   **Deployment Script:** Developed to assist with deploying the authentication system.
*   **Detailed Documentation:** Created comprehensive documentation covering authentication flow, token structure, key management, service registry, middleware, RBAC, testing, deployment, and security considerations.

## 10. Prerequisites for Deployment

Before deploying the RS256 authentication system, ensure the following:

*   **Security Service:** The Security service is running and accessible.
*   **RS256 Key Pair:** An RS256 key pair is generated and the private key is securely stored by the SecurityManager, while the public key is distributed to all services.
*   **Environment Variables:** All necessary environment variables (e.g., `SECURITYMANAGER_URL`, `CLIENT_SECRET`) are properly configured in each service.
*   **Service Registry:** The SecurityManager's service registry is up-to-date with all registered services.

## 11. Testing Procedures

To ensure the proper functioning of the RS256 authentication system, perform the following tests:

*   **Token Generation and Verification:**
    *   Run `test-auth.js` to verify token generation and verification by the SecurityManager.
    *   Test token verification with invalid tokens (e.g., tampered, incorrect signature).
    *   Test token verification with expired tokens.
    *   Test token verification with no tokens provided.
*   **Client Authentication:**
    *   Run `test-client-auth.js` to verify client authentication flow.
*   **End-to-End Authentication:**
    *   Run `test-auth-e2e.js` to verify end-to-end authentication across services.
*   **Role-Based Access Control (RBAC):**
    *   Test access to routes protected by `requireRoles` with users having and lacking the required roles.
    *   Test access to routes protected by `requirePermissions` with users having and lacking the required permissions.

## 12. Deployment Procedures

Follow these steps for deploying the RS256 authentication system:

*   **Key Generation/Rotation:** Generate new RS256 keys or rotate existing ones.
*   **Public Key Distribution:** Distribute the new public key to all services that need to verify tokens.
*   **Environment Variable Update:** Update environment variables in all services to reflect any changes in SecurityManager URL or client secrets.
*   **Service Restart:** Restart all services to pick up the new configurations and keys.
*   **End-to-End Testing:** Perform end-to-end authentication tests to ensure the system is functioning correctly after deployment.
*   **Monitoring:** Monitor authentication events and system logs for any anomalies.

## 13. Security Considerations

The following security considerations are crucial for maintaining the integrity and confidentiality of the authentication system:

*   **Asymmetric Cryptography:** The use of RS256 (asymmetric cryptography) ensures that the private key, used for signing, remains exclusively with the `SecurityManager`, while the public key is safely distributed for verification. This prevents token forgery.
*   **Private Key Protection:** The private key must be stored securely and only accessible to the `SecurityManager` service.
*   **Public Key Distribution:** The public key should be distributed to all services that need to verify tokens.
*   **Secure Communication:** All token transmissions must occur over HTTPS to prevent eavesdropping and tampering.
*   **Token Expiration:** Tokens should have appropriate and short expiration times (e.g., 1 hour) to limit the window of opportunity for compromise.
*   **Role-Based Access Control (RBAC):** Proper implementation of RBAC ensures fine-grained access control based on assigned roles and permissions.
*   **Logging and Monitoring:** Failed authentication attempts and other security-related events should be logged and monitored for suspicious activity.
*   **Key Rotation:** Implement a regular schedule for key rotation to mitigate the risk of long-term key compromise.
*   **Security Auditing:** Conduct regular security audits of the authentication system.
