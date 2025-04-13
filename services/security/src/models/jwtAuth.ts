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
      console.error(`Operation failed. Retrying in ${delay}ms. Retries left: ${retries}`);
      await setTimeout(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

export async function verifyComponentCredentials(componentType: string, clientSecret: string): Promise<boolean> {
  console.log(`Verifying credentials for componentType: ${componentType}`);
  console.log(`Available environment variables: ${Object.keys(process.env).filter(key => key.includes('CLIENT_SECRET')).join(', ')}`);

  // Try to get client from environment variables
  const client = getClientFromEnv(componentType);
  if (client) {
    // If we found a client, verify the secret
    if (client.clientSecret === clientSecret) {
      console.log(`Client verified for componentType: ${componentType} using environment variables`);
      return true;
    } else {
      console.error(`Invalid client secret for componentType: ${componentType}. Expected: ${client.clientSecret}, Got: ${clientSecret}`);
    }
  } else {
    console.error(`Client not found for componentType: ${componentType} in environment variables`);
  }

  // If we couldn't verify using environment variables, check if the client secret matches any known secret
  const allSecrets = Object.keys(process.env)
    .filter(key => key.includes('CLIENT_SECRET'))
    .map(key => process.env[key]);

  if (allSecrets.includes(clientSecret)) {
    console.log(`Client verified for componentType: ${componentType} using matched secret`);
    return true;
  }

  // If all else fails, check if this is a development environment and accept any secret
  if (process.env.NODE_ENV === 'development') {
    console.log(`Development mode: accepting any client secret for ${componentType}`);
    return true;
  }

  console.error(`All verification methods failed for componentType: ${componentType}`);
  return false;
}

function getClientFromEnv(componentType: string): { clientId: string, clientSecret: string } | null {
  const envKey = `${componentType.toUpperCase()}_CLIENT_SECRET`;
  console.log(`Looking for environment variable: ${envKey}`);

  // First try component-specific secret
  const clientSecret = process.env[envKey];
  if (clientSecret) {
      console.log(`Found client secret for ${componentType} using ${envKey}`);
      return {
          clientId: componentType,
          clientSecret,
      };
  }

  // If component-specific secret not found, try the generic CLIENT_SECRET
  const genericSecret = process.env.CLIENT_SECRET;
  if (genericSecret) {
      console.log(`Using generic CLIENT_SECRET for ${componentType}`);
      return {
          clientId: componentType,
          clientSecret: genericSecret,
      };
  }

  // If neither found, try to match the client secret sent by the component
  console.error(`No client secret found for componentType: ${componentType} (env key: ${envKey})`);
  return null;
}

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

async function storeTokenInMongoDB(token: string, tokenData: any): Promise<void> {
  const MAX_RETRIES = 5;
  const INITIAL_RETRY_DELAY = 1000; // 1 second

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
};