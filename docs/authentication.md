# Authentication System

This document provides a comprehensive overview of the authentication system used in the Stage7 platform.

## Overview

The Stage7 platform uses RS256 (RSA Signature with SHA-256) for JWT token-based authentication. This is an asymmetric algorithm that uses a private key for signing tokens and a public key for verification.

## Components

The authentication system consists of the following components:

1. **SecurityManager Service**: Responsible for authenticating services and clients, generating JWT tokens, and verifying tokens.
2. **ServiceTokenManager**: A shared utility class that handles token management, including fetching, caching, and verifying tokens.
3. **BaseEntity**: A base class for all services that includes token verification functionality.
4. **Authentication Middleware**: Express middleware for protecting routes and enforcing role-based access control.

## Authentication Flow

### Service-to-Service Authentication

1. A service requests a token from the SecurityManager by providing its service ID and secret.
2. The SecurityManager verifies the service credentials against the service registry.
3. If verification succeeds, the SecurityManager generates a JWT token signed with the private key.
4. The service uses this token for subsequent requests to other services.
5. The receiving service verifies the token using the public key.

### Client Authentication

1. A client requests a token from the SecurityManager by providing its client ID and secret.
2. The SecurityManager verifies the client credentials.
3. If verification succeeds, the SecurityManager generates a JWT token signed with the private key.
4. The client uses this token for subsequent requests to services.
5. The services verify the token using the public key.

## Token Verification

Token verification follows these steps:

1. Extract the token from the Authorization header.
2. Verify the token with the SecurityManager service (preferred method).
3. If the SecurityManager is unavailable, verify the token locally using the public key.
4. If verification succeeds, extract the user information from the token and add it to the request.

## Key Management

- The private key is stored only in the security service and is used to sign tokens.
- The public key is distributed to all services for token verification.
- Keys are stored in the following locations:
  - Private key: `services/security/keys/private.key` and `services/security/keys/private.pem`
  - Public key: `services/security/keys/public.key`, `services/security/keys/public.pem`, `shared/keys/public.key`, and `shared/keys/public.pem`

## Service Registry

The service registry is maintained in the SecurityManager service and contains information about all authorized services, including:

- Service ID
- Service secret
- Service roles

## Implementation Details

### JWT Token Structure

The JWT token contains the following claims:

- **iss** (Issuer): The issuer of the token (SecurityManager).
- **sub** (Subject): The subject of the token (service ID or client ID).
- **aud** (Audience): The intended audience for the token (stage7-services).
- **exp** (Expiration Time): The time after which the token expires.
- **iat** (Issued At): The time at which the token was issued.
- **jti** (JWT ID): A unique identifier for the token.
- **componentType**: The type of component (service or client).
- **roles**: The roles assigned to the service or client.
- **permissions**: The permissions assigned to the service or client.
- **clientId**: The ID of the client or service.

### Authentication Middleware

The authentication middleware performs the following tasks:

1. Extract the token from the Authorization header.
2. Verify the token using the ServiceTokenManager.
3. If verification succeeds, add the decoded user information to the request.
4. If verification fails, return an error response.

### Role-Based Access Control

The role-based access control middleware performs the following tasks:

1. Check if the user has the required roles.
2. If the user has the required roles, allow the request to proceed.
3. If the user does not have the required roles, return an error response.

## Testing

The authentication system includes several test scripts:

- `test-auth.js`: Tests the token generation and verification process.
- `test-client-auth.js`: Tests the client authentication process.
- `test-auth-e2e.js`: Tests the entire authentication flow from service authentication to accessing protected resources.

To run the tests, use the following commands:

```bash
cd services/security
npm run test-auth
npm run test-client-auth
npm run test-auth-e2e
```

## Security Considerations

- Keep the private key secure and never expose it outside the security service.
- Rotate keys periodically for enhanced security.
- Use environment variables for service secrets in production.
- Monitor failed authentication attempts for potential security issues.
- Always use HTTPS in production to protect tokens in transit.

## Troubleshooting

### Token Verification Fails

If token verification fails, check the following:

1. Make sure the public key is available to the service.
2. Check that the token is properly formatted and not expired.
3. Verify that the token was signed with the correct private key.
4. Check the logs for specific error messages.

### Service Authentication Fails

If service authentication fails, check the following:

1. Make sure the service ID and secret are correct.
2. Check that the service is registered in the service registry.
3. Verify that the SecurityManager service is running and accessible.
4. Check the logs for specific error messages.

## Best Practices

1. Always use HTTPS in production to protect tokens in transit.
2. Store tokens securely (use secure cookies or localStorage with proper security measures).
3. Implement token refresh mechanisms to handle token expiration.
4. Include proper error handling for authentication failures.
5. Use role-based or permission-based authorization for fine-grained access control.
6. Regularly rotate keys and secrets.
7. Monitor and log authentication events for security auditing.
