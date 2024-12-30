import { User } from '../models/User';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';


const librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';

export const findUserByEmail = async (email: string): Promise<User | undefined> => {
    try {
        //console.log('Finding user by email:', email, ' from ',this.librarianUrl);
        const response = await axios.post(`http://${librarianUrl}/queryData`, {
            collection: 'users',
            query: { email: email },
            limit: 1
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return undefined;
    } catch (error) { analyzeError(error as Error);
        console.error('Error finding user by email:', email, error instanceof Error ? error.message : '');
        return undefined;
    }
}

export const findUserById = async (id: string): Promise<User | undefined> => {
    try {
        //console.log('Finding user by email:', email, ' from ',this.librarianUrl);
        const response = await axios.post(`http://${librarianUrl}/queryData`, {
            collection: 'users',
            query: { id: id },
            limit: 1
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return undefined;
    } catch (error) { analyzeError(error as Error);
        console.error('Error finding user by id:', id, error instanceof Error ? error.message : '');
        return undefined;
    }
}

export const findUserByProviderId = async (provider: string, providerId: string): Promise<User | undefined> => {

    try {
        const response = await axios.post(`http://${librarianUrl}/queryData`, {
            collection: 'users',
            query: { provider: provider, providerId: providerId },
            limit: 1
        });
    
        if (response.data && response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return undefined;
    } catch (error) { analyzeError(error as Error);
        console.error('Error finding user by provider:', provider, providerId, error instanceof Error ? error.message : '');
        return undefined;
    }
}        

export const createUser = async (userData: Partial<User>): Promise<User> => {
    return await axios.post(`http://${librarianUrl}/storeData`, {
        id: uuidv4(),
        data: userData,
        storageType: 'mongo',
        collection: 'users'
    });
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<User> => {
    return await axios.post(`http://${librarianUrl}/storeData`, {
        id: id,
        data: userData,
        storageType: 'mongo',
        collection: 'users'
    });
};