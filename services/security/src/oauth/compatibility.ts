/**
 * Compatibility layer for the OAuth 2.0 server
 * This file provides compatibility functions for existing services
 */

import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeError } from '@cktmcs/errorhandler';

// Load RSA keys for JWT signing and verification
const keysDir = process.env.KEYS_DIR || path.join(__dirname, '../../keys');
let publicKey: string;
let privateKey: string;

try {
    publicKey = fs.readFileSync(path.join(keysDir, 'public.key'), 'utf8');
    privateKey = fs.readFileSync(path.join(keysDir, 'private.key'), 'utf8');
    console.log('RSA key pair loaded from', keysDir);
} catch (error) {
    console.error('Failed to load RSA key pair:', error);
    throw new Error('Failed to load RSA key pair');
}

// Service registry - this should be moved to a database in production
const serviceRegistry: { [key: string]: ServiceRegistryEntry } = {
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
        roles: ['agent:manage', 'agent:execute']
    },
};

// Interface definitions
interface ServiceRegistryEntry {
    id: string;
    secret: string;
    roles: string[];
}

/**
 * Authenticate a service using client credentials
 * @param componentType The type of component
 * @param clientSecret The client secret
 * @returns JWT token or null if authentication fails
 */
export async function authenticateService(componentType: string, clientSecret: string): Promise<string | null> {
    try {
        console.log(`Authenticating service: ${componentType}`);
        
        // Check if service exists in registry
        const service = serviceRegistry[componentType];
        if (!service) {
            console.error(`Unknown service type: ${componentType}`);
            return null;
        }
        
        // Validate client secret
        if (process.env.NODE_ENV !== 'development' && service.secret !== clientSecret) {
            console.error(`Invalid client secret for ${componentType}`);
            return null;
        }
        
        // Create payload for JWT
        const payload = {
            componentType,
            roles: service.roles,
            issuedAt: Date.now()
        };
        
        // Sign JWT with private key
        const token = jwt.sign(payload, privateKey, {
            algorithm: 'RS256',
            expiresIn: '1h'
        });
        
        console.log(`Generated token for ${componentType}`);
        return token;
    } catch (error) {
        analyzeError(error as Error);
        console.error('Error authenticating service:', error);
        return null;
    }
}

/**
 * Verify a JWT token
 * @param token JWT token
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): any {
    try {
        console.log('Verifying token');
        
        // Try to verify with RS256
        try {
            const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
            console.log('Token verified successfully with RS256');
            return decoded;
        } catch (rsaError) {
            console.error('RS256 verification failed:', rsaError);
            
            // If that fails, try with the legacy HS256 method
            console.log('Trying legacy HS256 verification');
            const legacySecret = process.env.JWT_SECRET || 'stage7AuthSecret';
            try {
                const decoded = jwt.verify(token, legacySecret);
                console.log('Token verified successfully with HS256');
                return decoded;
            } catch (hs256Error) {
                console.error('HS256 verification failed:', hs256Error);
                return null;
            }
        }
    } catch (error) {
        analyzeError(error as Error);
        console.error('Token verification failed:', error);
        return null;
    }
}
