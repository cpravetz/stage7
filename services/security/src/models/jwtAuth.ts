/**
 * JWT Authentication Model
 */

import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { setTimeout } from 'timers/promises';

// Service Registry
interface ServiceCredential {
  id: string;
  secret: string;
  roles: string[];
}

// Define service types and their credentials
const serviceRegistry: Record<string, ServiceCredential> = {
  'PostOffice': {
    id: 'PostOffice',
    secret: process.env.POSTOFFICE_SECRET || 'stage7AuthSecret',
    roles: ['message:send', 'message:receive', 'service:discover']
  },
  'MissionControl': {
    id: 'MissionControl',
    secret: process.env.MISSIONCONTROL_SECRET || 'stage7AuthSecret',
    roles: ['mission:manage', 'agent:control']
  },
  'Brain': {
    id: 'Brain',
    secret: process.env.BRAIN_SECRET || 'stage7AuthSecret',
    roles: ['llm:invoke']
  },
  'Librarian': {
    id: 'Librarian',
    secret: process.env.LIBRARIAN_SECRET || 'stage7AuthSecret',
    roles: ['data:read', 'data:write']
  },
  'Engineer': {
    id: 'Engineer',
    secret: process.env.ENGINEER_SECRET || 'stage7AuthSecret',
    roles: ['plugin:execute']
  },
  'TrafficManager': {
    id: 'TrafficManager',
    secret: process.env.TRAFFICMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['traffic:manage']
  },
  'CapabilitiesManager': {
    id: 'CapabilitiesManager',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['capability:manage']
  },
  'AgentSet': {
    id: 'AgentSet',
    secret: process.env.AGENTSET_SECRET || 'stage7AuthSecret',
    roles: ['agent:manage']
  },
  // Add other services as needed
  'ErrorHandler': {
    id: 'ErrorHandler',
    secret: process.env.ERRORHANDLER_SECRET || 'stage7AuthSecret',
    roles: ['error:assess']
  },
  'SecurityManager': {
    id: 'SecurityManager',
    secret: process.env.SECURITYMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['user:manage', 'token:manage', 'auth:manage']
  },
  'TestClient': {
    id: 'TestClient',
    secret: 'stage7AuthSecret',
    roles: ['test:run']
  },
  
  
};

// Load keys
let PRIVATE_KEY: string;
let PUBLIC_KEY: string;

try {
  // Load private key (for signing)
  const privateKeyPaths = [
    path.join(__dirname, '../../keys/private.pem'),
    path.join(__dirname, '../../keys/private.key')
  ];

  for (const keyPath of privateKeyPaths) {
    if (fs.existsSync(keyPath)) {
      PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8');
      console.log(`Loaded RSA private key from ${keyPath}`);
      break;
    }
  }

  if (!PRIVATE_KEY) {
    throw new Error('No private key available for JWT signing');
  }

  // Load public key (for verification)
  const publicKeyPaths = [
    path.join(__dirname, '../../keys/public.pem'),
    path.join(__dirname, '../../keys/public.key')
  ];

  for (const keyPath of publicKeyPaths) {
    if (fs.existsSync(keyPath)) {
      PUBLIC_KEY = fs.readFileSync(keyPath, 'utf8');
      console.log(`Loaded RSA public key from ${keyPath}`);
      break;
    }
  }

  if (!PUBLIC_KEY) {
    throw new Error('No public key available for JWT verification');
  }

  console.log('Successfully loaded RSA keys for JWT signing and verification');
} catch (error) {
  console.error('Failed to load RSA keys:', error);
  throw new Error('Cannot start security service without RSA keys');
}

// Constants for token storage
const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
// Primary token storage - using in-memory array to avoid circular dependency with Librarian
const inMemoryTokenStore: { [key: string]: any } = {};

/**
 * Verify component credentials against the service registry
 * @param componentType The type of component to verify
 * @param clientSecret The client secret provided by the component
 * @returns True if credentials are valid, false otherwise
 */
export async function verifyComponentCredentials(componentType: string, clientSecret: string): Promise<boolean> {
  console.log(`Verifying credentials for componentType: ${componentType}`);

  // Normalize component type to handle case differences
  const normalizedComponentType = Object.keys(serviceRegistry).find(
    key => key.toLowerCase() === componentType.toLowerCase()
  ) || componentType;

  const service = serviceRegistry[normalizedComponentType];
  if (!service) {
    console.error(`Unknown service type: ${componentType}`);
    return false;
  }

  // Check if the client secret matches
  if (service.secret === clientSecret) {
    console.log(`Client verified for componentType: ${normalizedComponentType} using service registry`);
    return true;
  }

  // Check if we should use a shared secret for all services
  const sharedSecret = process.env.SHARED_CLIENT_SECRET || 'stage7AuthSecret';
  if (clientSecret === sharedSecret) {
    console.log(`Client verified for componentType: ${normalizedComponentType} using shared secret`);
    return true;
  }

  console.error(`Authentication failed for componentType: ${componentType}`);
  return false;
}

/**
 * Generate a JWT token for a service
 * @param componentType The type of component
 * @returns JWT token
 */
export function generateServiceToken(componentType: string): string {
  // Normalize component type to handle case differences
  const normalizedComponentType = Object.keys(serviceRegistry).find(
    key => key.toLowerCase() === componentType.toLowerCase()
  ) || componentType;

  // Get service from registry or create a default one
  const service = serviceRegistry[normalizedComponentType] || {
    id: normalizedComponentType,
    secret: 'unknown',
    roles: ['service:basic']
  };

  // Create the token payload with standard claims
  const payload = {
    // Standard JWT claims
    iss: 'SecurityManager',                // Issuer
    sub: service.id,                       // Subject (the service ID)
    aud: 'stage7-services',                // Audience
    exp: Math.floor(Date.now() / 1000) + 3600, // Expiration (1 hour from now)
    iat: Math.floor(Date.now() / 1000),    // Issued at
    jti: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), // JWT ID (random)

    // Custom claims
    componentType: normalizedComponentType,
    roles: service.roles,
    permissions: service.roles, // For backward compatibility
    clientId: service.id
  };

  // Sign the token with RS256 algorithm
  try {
    // Don't use expiresIn option since we already set exp in the payload
    const token = jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256'
      // Removed expiresIn option to avoid conflict with exp in payload
    });

    console.log(`Token generated for ${normalizedComponentType} with roles: ${service.roles.join(', ')}`);
    return token;
  } catch (error) {
    console.error(`Error generating token for ${normalizedComponentType}:`, error);
    throw error;
  }
}

/**
 * Verify a JWT token
 * @param token The JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): any {
  if (!token) {
    console.log('No token provided for verification');
    return null;
  }

  // First check if the token is in our in-memory store
  // This avoids expensive cryptographic operations for tokens we've already issued
  if (inMemoryTokenStore[token]) {
    const tokenData = inMemoryTokenStore[token];
    const now = new Date();

    // Check if token has expired
    if (tokenData.accessTokenExpiresAt && new Date(tokenData.accessTokenExpiresAt) > now) {
      // Return a payload similar to what jwt.verify would return
      return {
        clientId: tokenData.clientId,
        iat: Math.floor(now.getTime() / 1000) - 3600, // Approximate issue time (1 hour ago)
        exp: Math.floor(new Date(tokenData.accessTokenExpiresAt).getTime() / 1000)
      };
    }
  }

  try {
    // First check if the token is in the correct format
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.log('Invalid token format - not a valid JWT');
      return null;
    }

    // Try to parse the header to check the algorithm
    try {
      const headerStr = Buffer.from(tokenParts[0], 'base64').toString();
      const header = JSON.parse(headerStr);

      if (header.alg !== 'RS256') {
        console.log(`Token uses unsupported algorithm: ${header.alg}. Only RS256 is supported.`);
        return null;
      }
    } catch (headerError) {
      console.log('Error parsing token header:', headerError);
      return null;
    }

    // Verify with RS256 only - no fallback to HS256
    const decoded = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      complete: false // Return only the payload
    });

    // Check if the token has expired
    const now = Math.floor(Date.now() / 1000);
    if (typeof decoded === 'object' && decoded.exp && decoded.exp < now) {
      console.log('Token has expired');
      return null;
    }

    return decoded;
  } catch (error) {
    console.log('Token verification failed:', error);
    return null;
  }
}

/**
 * Authenticate a service
 * @param componentType The type of component
 * @param clientSecret The client secret provided by the component
 * @returns JWT token if authentication successful, null otherwise
 */
export async function authenticateService(componentType: string, clientSecret: string): Promise<string | null> {
  try {
    // Verify the component credentials
    const isValid = await verifyComponentCredentials(componentType, clientSecret);
    if (!isValid) {
      console.error(`Authentication failed for componentType: ${componentType}`);
      return null;
    }

    // Generate a token for the service
    const token = generateServiceToken(componentType);

    // Save the token
    await saveToken(token, componentType);

    return token;
  } catch (error) {
    console.error('Service authentication failed:', error);
    return null;
  }
}

/**
 * Save a token to storage
 * @param token The JWT token to save
 * @param componentType The type of component
 */
async function saveToken(token: string, componentType: string): Promise<void> {
  const tokenData = {
    accessToken: token,
    accessTokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    clientId: componentType,
  };

  // Store token in memory to avoid circular dependency
  inMemoryTokenStore[token] = tokenData;
  console.log(`Token for ${componentType} saved in memory`);
}

/**
 * Store a token in MongoDB
 * @param token The JWT token to store
 * @param tokenData The token data to store
 */
async function storeTokenInMongoDB(token: string, tokenData: any): Promise<void> {
  // For now, just use in-memory storage to avoid circular dependency
  // The SecurityManager needs to store tokens in Librarian, but Librarian needs
  // to authenticate with SecurityManager, creating a circular dependency
  inMemoryTokenStore[token] = tokenData;
  console.log('Token stored in memory to avoid circular dependency with Librarian');
  return;

  // The code below is commented out to avoid the circular dependency
  /*
  const storeTokenOperation = async () => {
    try {
      await axios.post(`http://${librarianUrl}/storeData`, {
        id: token,
        data: tokenData,
        collection: 'tokens',
        storageType: 'mongo'
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw error; // Rethrow connection errors to trigger retry
      }
      console.error('Error storing token:', error);
      throw error; // Rethrow other errors
    }
  };

  let retries = MAX_RETRIES;
  let delay = INITIAL_RETRY_DELAY;

  while (retries > 0) {
    try {
      await storeTokenOperation();
      return;
    } catch (error) {
      console.error(`Operation failed. Retrying in ${delay}ms. Retries left: ${retries}`);
      await setTimeout(delay);
      retries--;
      delay *= 2;
    }
  }

  throw new Error('Failed to store token in MongoDB after multiple retries');
  */
}
