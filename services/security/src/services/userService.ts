import { User } from '../models/User';
import { v4 as uuidv4 } from 'uuid';
import { BaseEntity } from '@cktmcs/shared';

// This service needs to be initialized with a reference to the SecurityManager instance
let securityManager: BaseEntity;

export const initUserService = (securityManagerInstance: BaseEntity) => {
    securityManager = securityManagerInstance;
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
        const url = `http://${librarianUrl}/queryData`;
        console.log('Making request to:', url);

        const response = await securityManager.authenticatedApi.post(url, {
            collection: 'users',
            query: { email: email },
            limit: 1
        });

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
        const response = await securityManager.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
            collection: 'users',
            query: { id: id },
            limit: 1
        });

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
        const response = await securityManager.authenticatedApi.post(`http://${librarianUrl}/queryData`, {
            collection: 'users',
            query: { provider: provider, providerId: providerId },
            limit: 1
        });

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
    return (await securityManager.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
        id: uuidv4(),
        data: userData,
        storageType: 'mongo',
        collection: 'users'
    })).data;
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<User> => {
    if (!securityManager) {
        throw new Error('UserService not initialized with SecurityManager instance');
    }

    // Get the librarian URL from the service URLs
    const { librarianUrl } = await securityManager.getServiceUrls();

    // Use the authenticated API
    return (await securityManager.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
        id: id,
        data: userData,
        storageType: 'mongo',
        collection: 'users'
    })).data;
};