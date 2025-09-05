import { AuthenticatedApiClient } from '../src/AuthenticatedApiClient';
import { IBaseEntity } from '../src/interfaces/IBaseEntity';
import { createAuthenticatedAxios } from '../src/http/createAuthenticatedAxios';
import { AxiosRequestConfig } from 'axios';

// Mock external dependencies
jest.mock('../src/http/createAuthenticatedAxios');

// Cast mocked function
const mockCreateAuthenticatedAxios = createAuthenticatedAxios as jest.Mock;

describe('AuthenticatedApiClient', () => {
    let mockAxiosInstance: any;
    let mockBaseEntity: IBaseEntity;
    let client: AuthenticatedApiClient;

    const MOCK_SECURITY_MANAGER_URL = 'http://mock-security:5010';
    const MOCK_CLIENT_SECRET = 'mock-secret';
    const MOCK_COMPONENT_TYPE = 'TestComponent';

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock the axios instance that createAuthenticatedAxios will return
        mockAxiosInstance = {
            get: jest.fn().mockResolvedValue({}),
            post: jest.fn().mockResolvedValue({}),
            put: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        };
        mockCreateAuthenticatedAxios.mockReturnValue(mockAxiosInstance);

        // Mock the IBaseEntity
        mockBaseEntity = {
            componentType: MOCK_COMPONENT_TYPE,
            // Add other IBaseEntity properties/methods if they were used in constructor or methods
        } as IBaseEntity;

        // Set process.env variables
        process.env.SECURITYMANAGER_URL = MOCK_SECURITY_MANAGER_URL;
        process.env.CLIENT_SECRET = MOCK_CLIENT_SECRET;

        client = new AuthenticatedApiClient(mockBaseEntity);
    });

    afterEach(() => {
        // Clean up process.env changes
        delete process.env.SECURITYMANAGER_URL;
        delete process.env.CLIENT_SECRET;
    });

    describe('constructor', () => {
        it('should initialize the internal axios instance using createAuthenticatedAxios', () => {
            expect(mockCreateAuthenticatedAxios).toHaveBeenCalledWith(
                MOCK_COMPONENT_TYPE,
                MOCK_SECURITY_MANAGER_URL,
                MOCK_CLIENT_SECRET
            );
            expect((client as any).api).toBe(mockAxiosInstance);
        });

        it('should use default env vars if not set', () => {
            delete process.env.SECURITYMANAGER_URL;
            delete process.env.CLIENT_SECRET;

            const defaultClient = new AuthenticatedApiClient(mockBaseEntity);

            expect(mockCreateAuthenticatedAxios).toHaveBeenCalledWith(
                MOCK_COMPONENT_TYPE,
                'securitymanager:5010',
                'stage7AuthSecret'
            );
        });
    });

    describe('get', () => {
        it('should delegate to the internal axios instance's get method', async () => {
            const url = '/api/data';
            const config: AxiosRequestConfig = { headers: { 'X-Test': 'true' } };
            await client.get(url, config);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith(url, config);
        });
    });

    describe('post', () => {
        it('should delegate to the internal axios instance's post method', async () => {
            const url = '/api/resource';
            const data = { key: 'value' };
            const config: AxiosRequestConfig = { timeout: 1000 };
            await client.post(url, data, config);
            expect(mockAxiosInstance.post).toHaveBeenCalledWith(url, data, config);
        });
    });

    describe('put', () => {
        it('should delegate to the internal axios instance's put method', async () => {
            const url = '/api/resource/1';
            const data = { key: 'updated' };
            const config: AxiosRequestConfig = { params: { id: 1 } };
            await client.put(url, data, config);
            expect(mockAxiosInstance.put).toHaveBeenCalledWith(url, data, config);
        });
    });

    describe('delete', () => {
        it('should delegate to the internal axios instance's delete method', async () => {
            const url = '/api/resource/1';
            const config: AxiosRequestConfig = { headers: { 'Authorization': 'Bearer token' } };
            await client.delete(url, config);
            expect(mockAxiosInstance.delete).toHaveBeenCalledWith(url, config);
        });
    });
});
