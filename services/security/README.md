# Security Manager Service

The Security Manager service is responsible for authentication and authorization in the system. It uses RS256 asymmetric key authentication for secure token generation and verification.

## RS256 Authentication

The system uses RS256 (RSA Signature with SHA-256) for JWT token signing and verification. This is an asymmetric algorithm that uses a private key for signing tokens and a public key for verification.

### Key Management

- The private key is stored only in the security service and is used to sign tokens
- The public key is distributed to all services for token verification
- Keys are stored in the following locations:
  - Private key: `services/security/keys/private.key` and `services/security/keys/private.pem`
  - Public key: `services/security/keys/public.key`, `services/security/keys/public.pem`, `shared/keys/public.key`, and `shared/keys/public.pem`

### Generating New Keys

If you need to generate new keys, run the following command:

```bash
cd services/security
npm run generate-keys
```

This will generate new RS256 key pairs and save them to the appropriate locations.

### Token Verification

All services use the BaseEntity class for token verification. The verification process works as follows:

1. The client sends a request with an Authorization header containing a JWT token
2. The BaseEntity.verifyToken middleware extracts the token from the header
3. The token is sent to the SecurityManager service for verification
4. If verification succeeds, the decoded token payload is added to the request object
5. If verification fails, an error response is returned

### Service-to-Service Authentication

Services authenticate with each other using JWT tokens. The process works as follows:

1. A service requests a token from the SecurityManager by providing its service ID and secret
2. The SecurityManager verifies the service credentials against the service registry
3. If verification succeeds, the SecurityManager generates a JWT token signed with the private key
4. The service uses this token for subsequent requests to other services

## Security Best Practices

- Keep the private key secure and never expose it outside the security service
- Rotate keys periodically for enhanced security
- Use environment variables for service secrets in production
- Monitor failed authentication attempts for potential security issues
