/**
 * OAuth 2.0 model implementation
 * This file implements the required methods for the OAuth 2.0 server
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Service registry - this should be moved to a database in production
const serviceRegistry = {
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

// In-memory token storage - this should be moved to a database in production
const tokenStorage = {};
const authorizationCodeStorage = {};
const refreshTokenStorage = {};

// Load RSA keys for JWT signing and verification
const keysDir = process.env.KEYS_DIR || path.join(__dirname, '../keys');
let publicKey;
let privateKey;

try {
    publicKey = fs.readFileSync(path.join(keysDir, 'public.key'), 'utf8');
    privateKey = fs.readFileSync(path.join(keysDir, 'private.key'), 'utf8');
    console.log('RSA key pair loaded from', keysDir);
} catch (error) {
    console.error('Failed to load RSA key pair:', error);
    throw new Error('Failed to load RSA key pair');
}

/**
 * Get access token.
 */
async function getAccessToken(accessToken) {
    try {
        console.log('Getting access token:', accessToken);
        
        // First, check if token exists in memory storage
        const token = Object.values(tokenStorage).find(t => t.accessToken === accessToken);
        if (token) {
            console.log('Token found in storage');
            return token;
        }
        
        // If not in storage, try to verify JWT
        try {
            const decoded = jwt.verify(accessToken, publicKey, { algorithms: ['RS256'] });
            console.log('JWT token verified:', decoded);
            
            // Create a token object from the decoded JWT
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 3600 * 1000); // 1 hour from now
            
            const tokenObj = {
                accessToken,
                accessTokenExpiresAt: expiresAt,
                client: { id: decoded.componentType },
                user: decoded
            };
            
            // Store for future reference
            const tokenId = uuidv4();
            tokenStorage[tokenId] = tokenObj;
            
            return tokenObj;
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            return null;
        }
    } catch (error) {
        console.error('Error getting access token:', error);
        return null;
    }
}

/**
 * Get client.
 */
async function getClient(clientId, clientSecret) {
    try {
        console.log(`Getting client: ${clientId}`);
        
        // Check if client exists in service registry
        const client = serviceRegistry[clientId];
        if (!client) {
            console.error(`Unknown client: ${clientId}`);
            return null;
        }
        
        // If clientSecret is provided, validate it
        if (clientSecret && client.secret !== clientSecret) {
            console.error(`Invalid client secret for ${clientId}`);
            return null;
        }
        
        // Return client with grants
        return {
            id: clientId,
            grants: ['client_credentials', 'refresh_token'],
            accessTokenLifetime: 3600, // 1 hour
            refreshTokenLifetime: 86400 // 24 hours
        };
    } catch (error) {
        console.error('Error getting client:', error);
        return null;
    }
}

/**
 * Save token.
 */
async function saveToken(token, client, user) {
    try {
        console.log('Saving token for client:', client.id);
        
        // Create token object
        const tokenObj = {
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            refreshToken: token.refreshToken,
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
            client,
            user
        };
        
        // Generate a unique ID for the token
        const tokenId = uuidv4();
        tokenStorage[tokenId] = tokenObj;
        
        // If there's a refresh token, store it separately
        if (token.refreshToken) {
            refreshTokenStorage[token.refreshToken] = {
                refreshToken: token.refreshToken,
                refreshTokenExpiresAt: token.refreshTokenExpiresAt,
                client,
                user
            };
        }
        
        console.log('Token saved with ID:', tokenId);
        return tokenObj;
    } catch (error) {
        console.error('Error saving token:', error);
        return null;
    }
}

/**
 * Get refresh token.
 */
async function getRefreshToken(refreshToken) {
    try {
        console.log('Getting refresh token:', refreshToken);
        
        // Check if refresh token exists in storage
        const token = refreshTokenStorage[refreshToken];
        if (!token) {
            console.error('Refresh token not found');
            return null;
        }
        
        return token;
    } catch (error) {
        console.error('Error getting refresh token:', error);
        return null;
    }
}

/**
 * Revoke refresh token.
 */
async function revokeToken(token) {
    try {
        console.log('Revoking token:', token.refreshToken);
        
        // Check if refresh token exists in storage
        if (!refreshTokenStorage[token.refreshToken]) {
            console.error('Refresh token not found');
            return false;
        }
        
        // Remove refresh token from storage
        delete refreshTokenStorage[token.refreshToken];
        
        // Also remove any access tokens associated with this refresh token
        for (const [id, accessToken] of Object.entries(tokenStorage)) {
            if (accessToken.refreshToken === token.refreshToken) {
                delete tokenStorage[id];
            }
        }
        
        console.log('Token revoked successfully');
        return true;
    } catch (error) {
        console.error('Error revoking token:', error);
        return false;
    }
}

/**
 * Generate access token.
 */
async function generateAccessToken(client, user, scope) {
    try {
        console.log('Generating access token for client:', client.id);
        
        // Create payload for JWT
        const payload = {
            componentType: client.id,
            roles: user.roles || [],
            scope: scope || '',
            issuedAt: Date.now()
        };
        
        // Sign JWT with private key
        const accessToken = jwt.sign(payload, privateKey, {
            algorithm: 'RS256',
            expiresIn: '1h'
        });
        
        console.log('Access token generated');
        return accessToken;
    } catch (error) {
        console.error('Error generating access token:', error);
        throw error;
    }
}

/**
 * Generate refresh token.
 */
async function generateRefreshToken(client, user, scope) {
    try {
        console.log('Generating refresh token for client:', client.id);
        
        // Generate a random refresh token
        const refreshToken = uuidv4();
        
        console.log('Refresh token generated');
        return refreshToken;
    } catch (error) {
        console.error('Error generating refresh token:', error);
        throw error;
    }
}

/**
 * Get user from client credentials.
 */
async function getUserFromClient(client) {
    try {
        console.log('Getting user from client:', client.id);
        
        // Check if client exists in service registry
        const service = serviceRegistry[client.id];
        if (!service) {
            console.error(`Unknown client: ${client.id}`);
            return null;
        }
        
        // Return user object with roles from service registry
        return {
            id: client.id,
            roles: service.roles
        };
    } catch (error) {
        console.error('Error getting user from client:', error);
        return null;
    }
}

/**
 * Validate scope.
 */
async function validateScope(user, client, scope) {
    try {
        console.log('Validating scope:', scope);
        
        // If no scope is requested, return default scope
        if (!scope) {
            return 'read';
        }
        
        // Split scope string into array
        const scopes = scope.split(' ');
        
        // Filter out invalid scopes
        const validScopes = scopes.filter(s => ['read', 'write'].includes(s));
        
        // If no valid scopes, return default scope
        if (validScopes.length === 0) {
            return 'read';
        }
        
        // Return valid scopes
        return validScopes.join(' ');
    } catch (error) {
        console.error('Error validating scope:', error);
        return null;
    }
}

/**
 * Verify scope.
 */
async function verifyScope(token, scope) {
    try {
        console.log('Verifying scope:', scope);
        
        // If token has no scope, it can't access any scope
        if (!token.scope) {
            return false;
        }
        
        // Split scope strings into arrays
        const tokenScopes = token.scope.split(' ');
        const requiredScopes = scope.split(' ');
        
        // Check if token has all required scopes
        return requiredScopes.every(s => tokenScopes.includes(s));
    } catch (error) {
        console.error('Error verifying scope:', error);
        return false;
    }
}

// Export the model
module.exports = {
    getAccessToken,
    getClient,
    saveToken,
    getRefreshToken,
    revokeToken,
    generateAccessToken,
    generateRefreshToken,
    getUserFromClient,
    validateScope,
    verifyScope
};
