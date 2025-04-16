# Stage7 Authentication System

## Overview

The Stage7 authentication system provides secure service-to-service communication using asymmetric key cryptography (RS256). This document outlines the architecture, implementation, and usage of the authentication system.

## Architecture

The authentication system consists of the following components:

1. **SecurityManager**: Central service responsible for:
   - Generating and distributing authentication tokens
   - Verifying tokens
   - Providing public keys for token verification

2. **ServiceTokenManager**: Client-side component responsible for:
   - Obtaining and caching authentication tokens
   - Verifying tokens locally when possible
   - Managing token expiration and renewal

3. **Key Management**: RSA key pairs are used for:
   - Signing tokens (private key, SecurityManager only)
   - Verifying tokens (public key, distributed to all services)

## Token Flow

1. **Service Registration**:
   - Each service is registered in the SecurityManager's service registry
   - Services are assigned roles that determine their permissions

2. **Authentication**:
   - Service sends authentication request to SecurityManager with its ID and secret
   - SecurityManager verifies credentials and generates a signed JWT token
   - Token contains service ID, roles, and expiration time

3. **Token Usage**:
   - Service includes token in Authorization header for all requests
   - Receiving service verifies token before processing request
   - Token verification can happen locally or via SecurityManager

4. **Token Renewal**:
   - ServiceTokenManager monitors token expiration
   - Tokens are automatically renewed before they expire

## Implementation Details

### Key Generation and Distribution

RSA key pairs are generated during system initialization:

```javascript
// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});
```

- Private key is stored only in the SecurityManager service
- Public key is distributed to all services for local token verification

### Token Generation

Tokens are generated using the RS256 algorithm:

```javascript
const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '1h'
});
```

The token payload includes:
- `componentType`: Service identifier
- `roles`: Array of roles assigned to the service
- `issuedAt`: Timestamp when the token was issued
- Standard JWT claims (iat, exp)

### Token Verification

Tokens can be verified in multiple ways:

1. **Local Verification** (preferred):
   ```javascript
   const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
   ```

2. **SecurityManager Verification** (fallback):
   ```javascript
   const response = await axios.post(`http://${securityManagerUrl}/verify`, {}, {
     headers: {
       'Authorization': `Bearer ${token}`
     }
   });
   ```

### Robust Verification Process

The system implements a multi-step verification process:

1. Try to verify locally using public key from file
2. If that fails, fetch public key from SecurityManager and verify
3. If that fails, use SecurityManager's verification endpoint
4. If all else fails, try legacy verification with shared secret

This ensures maximum reliability while minimizing network traffic.

## Security Considerations

1. **Key Protection**:
   - Private keys are stored only in the SecurityManager service
   - Keys are stored with appropriate file permissions (600)
   - Keys are never transmitted over the network

2. **Token Security**:
   - Tokens have a limited lifetime (1 hour)
   - Tokens contain only necessary information
   - RS256 algorithm provides strong cryptographic security

3. **Service Authentication**:
   - Services must provide a valid client secret to obtain a token
   - Client secrets can be configured via environment variables
   - A shared secret can be used for all services in simple deployments

## Usage

### Service Authentication

```javascript
const response = await axios.post('http://securitymanager:5010/auth/service', {
  componentType: 'MyService',
  clientSecret: process.env.CLIENT_SECRET || 'stage7AuthSecret'
});

const token = response.data.token;
```

### Making Authenticated Requests

```javascript
const response = await axios.get('http://otherservice:5000/api/resource', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Using ServiceTokenManager

```javascript
const tokenManager = new ServiceTokenManager(
  'http://securitymanager:5010',
  'MyService',
  process.env.CLIENT_SECRET || 'stage7AuthSecret'
);

// Get token (automatically handles renewal)
const token = await tokenManager.getToken();

// Get authorization header
const authHeader = await tokenManager.getAuthHeader();
```

### Verifying Tokens in Express Middleware

```javascript
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = await tokenManager.verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    req.service = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token verification failed' });
  }
});
```

## Testing

The authentication system can be tested using the provided test script:

```bash
cd test
npm install
npm test
```

The test script verifies:
1. Authentication with SecurityManager
2. Token verification with SecurityManager
3. Local token verification using public key
4. WebSocket connection to PostOffice
5. Service-to-service communication

## Troubleshooting

### Common Issues

1. **Token Verification Fails**:
   - Ensure public keys are properly distributed
   - Check that the token is not expired
   - Verify that the correct algorithm is being used (RS256)

2. **Authentication Fails**:
   - Check that the service is registered in the service registry
   - Verify that the correct client secret is being used
   - Ensure SecurityManager is running and accessible

3. **Public Key Not Found**:
   - Run the key management script to regenerate and distribute keys
   - Check file permissions on key files
   - Verify that the key paths are correct

### Debugging

Enable detailed logging by setting the `DEBUG` environment variable:

```bash
DEBUG=stage7:auth* node your-service.js
```

This will output detailed information about token generation, verification, and key management.

## Conclusion

The Stage7 authentication system provides a secure and robust mechanism for service-to-service communication. By using asymmetric cryptography and implementing multiple verification methods, it ensures both security and reliability.
