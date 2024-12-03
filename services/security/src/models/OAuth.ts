import OAuth2Server from 'oauth2-server';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import { setTimeout } from 'timers/promises';


const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
});

interface DummyUser {
  id: string;
}

// Add this function at the top of the file
function createDummyUser(clientId: string): DummyUser {
  return { id: clientId };
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const inMemoryTokenStore: { [key: string]: any } = {};

async function retryOperation<T>(operation: () => Promise<T>, retries: number = MAX_RETRIES, delay: number = INITIAL_RETRY_DELAY): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.log(`Operation failed. Retrying in ${delay}ms. Retries left: ${retries}`);
      await setTimeout(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

const getClientFromEnv = (clientId: string): OAuth2Server.Client | null => {
  const clientSecret = process.env[`${clientId.toUpperCase()}_CLIENT_SECRET`];
  if (!clientSecret) {
    console.log(`No client secret found for clientId: ${clientId}`);
    return null;
  }
  return {
    id: clientId,
    clientId,
    clientSecret,
    grants: ['client_credentials'],
    // Add these properties:
    accessTokenLifetime: 3600, // 1 hour
    refreshTokenLifetime: 1209600, // 14 days
    redirectUris: [], // Add any redirect URIs if needed
  };
};

export const OAuthModel = {
  getAccessToken: async (accessToken: string): Promise<OAuth2Server.Token | null> => {
    try {
      const response = await api.post(`http://${librarianUrl}/queryData`, {
        collection: 'tokens',
        query: { accessToken },
        limit: 1
      });
      const token = response.data.data[0];
      if (!token) return null;
      
      const client = await OAuthModel.getClient(token.clientId, null);
      
      if (!client) return null;

      return {
        accessToken: token.accessToken,
        accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
        client,
        user: createDummyUser(client.id)
      };
    } catch (error) {
      console.error('Failed to get token from Librarian. Checking in-memory store:', error);
      const token = inMemoryTokenStore[accessToken];
      if (token) {
        const client = await OAuthModel.getClient(token.clientId, null);
        if (!client) return null;
        return {
          accessToken: token.accessToken,
          accessTokenExpiresAt: new Date(token.accessTokenExpiresAt),
          client,
          user: createDummyUser(client.id)
        };
      }
      return null;
    }
  },

  getUserFromClient: async (client: OAuth2Server.Client): Promise<OAuth2Server.User | null> => {
    // For client credentials grant, we can use the client itself as the user
    // or create a dummy user based on the client
    return {
      id: client.id,
      username: client.id,
    };
  },

  getClient: async (clientId: string, clientSecret: string | null): Promise<OAuth2Server.Client | null> => {
    console.log(`Attempting to get client with ID: ${clientId}`);
    const client = getClientFromEnv(clientId);

    if (!client) {
      console.log(`Client not found for clientId: ${clientId}`);
      return null;
    }

    if (clientSecret && client.clientSecret !== clientSecret) {
      console.log(`Invalid client secret for clientId: ${clientId}`);
      return null;
    }

    console.log(`Client found and validated: ${JSON.stringify({ ...client, clientSecret: '[REDACTED]' })}`);
    return client;
  },

  saveToken: async (token: OAuth2Server.Token, client: OAuth2Server.Client): Promise<OAuth2Server.Token> => {
    const tokenData = {
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      clientId: client.id,
      scope: token.scope
    };

    const storeTokenOperation = async () => {
      try {
        await api.post(`http://${librarianUrl}/storeData`, {
          id: token.accessToken,
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

    try {
      try {
        await retryOperation(storeTokenOperation);
      } catch (error) {
        console.error('Failed to save token to Librarian after multiple retries. Using in-memory storage as fallback:', error);
        inMemoryTokenStore[token.accessToken] = tokenData;
      }
      
      return {
        accessToken: token.accessToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        client,
        user: createDummyUser(client.id)
      };
    } catch (error) {
      console.error('Failed to save token after multiple retries:', error);
      throw error;
    }
  },

  getRefreshToken: async (refreshToken: string): Promise<OAuth2Server.RefreshToken | null> => {
    try {
      const response = await api.post(`http://${librarianUrl}/queryData`, {
        collection: 'tokens',
        query: { refreshToken },
        limit: 1
      });
      const token = response.data.data[0];
      if (!token) return null;
      
      const client = await OAuthModel.getClient(token.clientId, null);
      
      if (!client) return null;

      return {
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: new Date(token.refreshTokenExpiresAt),
        client,
        user: createDummyUser(client.id)
      };
    } catch (error) {
      analyzeError(error as Error);
      return null;
    }
  },

  getAuthorizationCode: async (authorizationCode: string): Promise<OAuth2Server.AuthorizationCode | null> => {
    try {
      const response = await api.post(`http://${librarianUrl}/queryData`, {
        collection: 'authorizationCodes',
        query: { authorizationCode },
        limit: 1
      });
      const code = response.data.data[0];
      if (!code) return null;
      
      const client = await OAuthModel.getClient(code.clientId, null);
      
      if (!client) return null;

      return {
        authorizationCode: code.authorizationCode,
        expiresAt: new Date(code.expiresAt),
        redirectUri: code.redirectUri,
        scope: code.scope,
        client,
        user: createDummyUser(client.id)
      };
    } catch (error) {
      analyzeError(error as Error);
      return null;
    }
  },

  saveAuthorizationCode: async (code: OAuth2Server.AuthorizationCode, client: OAuth2Server.Client): Promise<OAuth2Server.AuthorizationCode> => {
    try {
      const authorizationCodeData = {
        authorizationCode: code.authorizationCode,
        expiresAt: code.expiresAt,
        redirectUri: code.redirectUri,
        scope: code.scope,
        clientId: client.id
      };
      
      await api.post(`http://${librarianUrl}/storeData`, {
        id: code.authorizationCode,
        data: authorizationCodeData,
        collection: 'authorizationCodes',
        storageType: 'mongo'
      });
      
      return {
        authorizationCode: code.authorizationCode,
        expiresAt: code.expiresAt,
        redirectUri: code.redirectUri,
        scope: code.scope,
        client,
        user: createDummyUser(client.id)
      };
    } catch (error) {
      analyzeError(error as Error);
      throw error;
    }
  },

  revokeToken: async (token: OAuth2Server.Token): Promise<boolean> => {
    try {
      const response = await api.delete(`http://${librarianUrl}/deleteData/${token.refreshToken}`);
      return response.status === 200;
    } catch (error) {
      analyzeError(error as Error);
      return false;
    }
  },

  revokeAuthorizationCode: async (code: OAuth2Server.AuthorizationCode): Promise<boolean> => {
    try {
      const response = await api.delete(`http://${librarianUrl}/deleteData/${code.authorizationCode}`);
      return response.status === 200;
    } catch (error) {
      analyzeError(error as Error);
      return false;
    }
  },

  validateScope: async (client: OAuth2Server.Client, scope: string | string[] | OAuth2Server.Client): Promise<string | false> => {
    console.log(`Validating scope for client: ${client.id}`);
    
    // If scope is actually a client object, we'll assume all scopes are valid for this client
    if (typeof scope === 'object' && !Array.isArray(scope) && 'id' in scope) {
      console.log(`Scope parameter is a client object. Assuming all scopes are valid for client ${client.id}`);
      return 'read write'; // You can adjust this default scope as needed
    }
  
    // Convert scope to array if it's a string
    const requestedScopes = Array.isArray(scope) ? scope : (typeof scope === 'string' ? scope.split(' ') : []);
  
    // Define allowed scopes for each client
    const allowedScopes: { [clientId: string]: string[] } = {
      postoffice: ['read', 'write'],
      missioncontrol: ['read', 'write', 'admin'],
      trafficmanager: ['read', 'write'],
      brain: ['read', 'write'],
      agentset: ['read', 'write'],
      engineer: ['read', 'write'],
      capabilitiesmanager: ['read', 'write'],
      librarian: ['read', 'write'],
      securitymanager: ['read', 'write', 'admin'],
    };
  
    // Get allowed scopes for this client
    const clientAllowedScopes = allowedScopes[client.id.toLowerCase()] || [];
  
    // If no specific scopes were requested, return all allowed scopes for this client
    if (requestedScopes.length === 0) {
      return clientAllowedScopes.join(' ');
    }
  
    // Check if all requested scopes are allowed for this client
    const validScopes = requestedScopes.filter(s => clientAllowedScopes.includes(s));
  
    if (validScopes.length === requestedScopes.length) {
      // All requested scopes are valid
      return validScopes.join(' ');
    } else {
      // Some requested scopes are not valid for this client
      console.log(`Invalid scope requested for client ${client.id}. Requested: ${requestedScopes.join(', ')}, Allowed: ${clientAllowedScopes.join(', ')}`);
      return false;
    }
  },

  verifyScope: async (token: OAuth2Server.Token, scope: string): Promise<boolean> => {
    if (!token.scope) {
      return false;
    }
    const requestedScopes = scope.split(' ').filter(Boolean);
    const authorizedScopes = Array.isArray(token.scope) ? token.scope : token.scope.split(' ').filter(Boolean);

    if (requestedScopes.length === 0) {
      return true; // No specific scope requested, so it's valid
    }

    return requestedScopes.every(s => authorizedScopes.includes(s));
  }

};