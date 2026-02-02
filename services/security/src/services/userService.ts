import { User } from '../models/User';
import { v4 as uuidv4 } from 'uuid';
import { BaseEntity } from '@cktmcs/shared';
import { setTimeout } from 'timers/promises'; // Added

// Retry constants for Librarian API calls
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// This service needs to be initialized with a reference to the SecurityManager instance
let securityManager: BaseEntity;

export const initUserService = (securityManagerInstance: BaseEntity) => {
    securityManager = securityManagerInstance;
};

// Generic retry mechanism for asynchronous operations
const retryOperation = async <T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = MAX_RETRIES,
    initialDelay: number = INITIAL_RETRY_DELAY
): Promise<T> => {
    let retries = 0;
    let delay = initialDelay;

    while (retries < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            console.warn(`[RETRY] ${context} failed (attempt ${retries + 1}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`);
            retries++;
            if (retries < maxRetries) {
                await setTimeout(delay);
                delay = Math.min(delay * 2, 30000); // Max delay 30 seconds
            }
        }
    }
    throw new Error(`Failed to complete ${context} after ${maxRetries} attempts.`);
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
    console.log('findUserByEmail called for:', email);

    try {
        if (!securityManager) {
            console.log('UserService not initialized with SecurityManager instance');
            throw new Error('UserService not initialized with SecurityManager instance');
        }

        // Get the librarian URL from the service URLs
        const { librarianUrl } = await securityManager.getServiceUrls();
        console.log('Librarian URL:', librarianUrl);

        // Use the authenticated API
        const url = `${librarianUrl}/queryData`;
        console.log('Making request to:', url);

        const response = await retryOperation(async () => {
            return await securityManager.authenticatedApi.post(url, {
                collection: 'users',
                query: { email: email },
                limit: 1
            });
        }, `querying Librarian for user ${email}`);

        console.log('Response status:', response.status);
        console.log('Response data length:', response.data?.data?.length || 0);

        if (response.data && response.data.data && response.data.data.length > 0) {
            console.log('User found in database');
            return response.data.data[0];
        }

        console.log('User not found in database');
        return null;
    } catch (error) {
        console.error('Error finding user by email:', email, error instanceof Error ? error.message : '');
        // Don't use analyzeError for expected database lookup failures
        return null;
    }
}

export const findUserById = async (id: string): Promise<User | null> => {
    try {
        if (!securityManager) {
            throw new Error('UserService not initialized with SecurityManager instance');
        }

        // Get the librarian URL from the service URLs
        const { librarianUrl } = await securityManager.getServiceUrls();

        // Use the authenticated API
        const response = await retryOperation(async () => {
            return await securityManager.authenticatedApi.post(`${librarianUrl}/queryData`, {
                collection: 'users',
                query: { id: id },
                limit: 1
            });
        }, `querying Librarian for user id: ${id}`);

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        console.error('Error finding user by id:', id, error instanceof Error ? error.message : '');
        // Don't use analyzeError for expected database lookup failures
        return null;
    }
}

export const findUserByProviderId = async (provider: string, providerId: string): Promise<User | null> => {
    try {
        if (!securityManager) {
            throw new Error('UserService not initialized with SecurityManager instance');
        }

        // Get the librarian URL from the service URLs
        const { librarianUrl } = await securityManager.getServiceUrls();

        // Use the authenticated API
        const response = await retryOperation(async () => {
            return await securityManager.authenticatedApi.post(`${librarianUrl}/queryData`, {
                collection: 'users',
                query: { provider: provider, providerId: providerId },
                limit: 1
            });
        }, `querying Librarian for user provider: ${provider}, providerId: ${providerId}`);

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        console.error('Error finding user by provider:', provider, providerId, error instanceof Error ? error.message : '');
        // Don't use analyzeError for expected database lookup failures
        return null;
    }
}

export const createUser = async (userData: Partial<User>): Promise<User> => {
    if (!securityManager) {
        throw new Error('UserService not initialized with SecurityManager instance');
    }

    // Get the librarian URL from the service URLs
    const { librarianUrl } = await securityManager.getServiceUrls();

    // Use the authenticated API
    const response = await retryOperation(async () => {
        return await securityManager.authenticatedApi.post(`${librarianUrl}/storeData`, {
            id: uuidv4(),
            data: userData,
            storageType: 'mongo',
            collection: 'users'
        });
    }, `storing new user ${userData.email}`);

    return response.data;
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<User> => {
    if (!securityManager) {
        throw new Error('UserService not initialized with SecurityManager instance');
    }

    // Get the librarian URL from the service URLs
    const { librarianUrl } = await securityManager.getServiceUrls();

    // Use the authenticated API
    const response = await retryOperation(async () => {
        return await securityManager.authenticatedApi.post(`${librarianUrl}/storeData`, {
            id: id,
            data: userData,
            storageType: 'mongo',
            collection: 'users'
        });
    }, `updating user id: ${id}`);

    return response.data;
};