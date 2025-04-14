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
  'ConfigService': {
    id: 'ConfigService',
    secret: process.env.CONFIG_SERVICE_SECRET || 'stage7AuthSecret',
    roles: ['config:read', 'config:write']
  },
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
};

// Load keys
let PRIVATE_KEY: string;
let PUBLIC_KEY: string;
let isUsingAsymmetricKeys = false;

try {
  PRIVATE_KEY = fs.readFileSync(path.join(__dirname, '../../keys/private.pem'), 'utf8');
  PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/public.pem'), 'utf8');
  isUsingAsymmetricKeys = true;
  console.log('Loaded RSA keys for JWT signing and verification');
} catch (error) {
  console.error('Failed to load RSA keys:', error);
  console.warn('Using fallback secret key for JWT signing and verification');
  PRIVATE_KEY = process.env.JWT_SECRET || 'fallback-secret-key';
  PUBLIC_KEY = PRIVATE_KEY;
}

// Constants for token storage
const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
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
    // For development or testing, accept any service type
    if (process.env.NODE_ENV === 'development' || process.env.ACCEPT_ANY_SERVICE === 'true') {
      console.log(`Development mode: accepting unknown service type ${componentType}`);
      return true;
    }
    return false;
  }

  // Check if the client secret matches
  if (service.secret === clientSecret) {
    console.log(`Client verified for componentType: ${normalizedComponentType} using service registry`);
    return true;
  }

  // Check if we should accept any client secret (for development or testing)
  if (process.env.NODE_ENV === 'development' || process.env.ACCEPT_ANY_SECRET === 'true') {
    console.log(`Development mode: accepting any client secret for ${normalizedComponentType}`);
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
  const service = serviceRegistry[componentType];
  if (!service) {
    throw new Error(`Unknown service type: ${componentType}`);
  }

  const payload = {
    componentType,
    roles: service.roles,
    issuedAt: Date.now()
  };

  if (isUsingAsymmetricKeys) {
    return jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '1h'
    });
  } else {
    return jwt.sign(payload, PRIVATE_KEY, {
      expiresIn: '1h'
    });
  }
}

/**
 * Verify a JWT token
 * @param token The JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): any {
  try {
    if (isUsingAsymmetricKeys) {
      try {
        // First try to verify with RS256
        return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
      } catch (rsaError) {
        // If that fails, try with the legacy HS256 method
        console.log('RS256 verification failed, trying legacy HS256 verification');
        const legacySecret = process.env.JWT_SECRET || 'your-secret-key';
        return jwt.verify(token, legacySecret);
      }
    } else {
      return jwt.verify(token, PUBLIC_KEY);
    }
  } catch (error) {
    console.error('Token verification failed:', error);
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
  const isValid = await verifyComponentCredentials(componentType, clientSecret);
  if (!isValid) {
    return null;
  }

  const token = generateServiceToken(componentType);

  // Store the token for future reference
  try {
    await saveToken(token, componentType);
  } catch (error) {
    console.error('Failed to save token, but continuing with authentication:', error);
  }

  return token;
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

  try {
    await storeTokenInMongoDB(token, tokenData);
  } catch (error) {
    console.error('Failed to save token to MongoDB. Using in-memory storage as fallback:', error);
    inMemoryTokenStore[token] = tokenData;
  }
}

/**
 * Store a token in MongoDB
 * @param token The JWT token to store
 * @param tokenData The token data to store
 */
async function storeTokenInMongoDB(token: string, tokenData: any): Promise<void> {
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
}