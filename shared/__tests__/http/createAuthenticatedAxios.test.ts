import { createAuthenticatedAxios, createClientAuthenticatedAxios, AuthenticatedAxiosOptions, ClientAuthenticatedAxiosOptions } from '../src/http/createAuthenticatedAxios';
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { ServiceTokenManager } from '../src/security/ServiceTokenManager';

// Mock external dependencies
jest.mock('axios');
jest.mock('../src/security/ServiceTokenManager');

// Cast mocked functions/classes
const mockAxiosCreate = axios.create as jest.Mock;
const mockServiceTokenManagerGetInstance = ServiceTokenManager.getInstance as jest.Mock;

describe('createAuthenticatedAxios', () => {
    let mockAxiosInstance: AxiosInstance;
    let mockTokenManager: jest.Mocked<ServiceTokenManager>;
    let requestInterceptor: any;
    let responseInterceptorSuccess: any;
    let responseInterceptorError: any;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_SERVICE_ID = 'TestService';
    const MOCK_SECURITY_MANAGER_URL = 'http://mock-security:5010';
    const MOCK_CLIENT_SECRET = 'mock-secret';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock ServiceTokenManager
        mockTokenManager = {
            getToken: jest.fn().mockResolvedValue('mock-jwt-token'),
            refreshToken: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockServiceTokenManagerGetInstance.mockReturnValue(mockTokenManager);

        // Mock axios.create to capture interceptors
        mockAxiosInstance = {
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() },
            },
            get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
        } as any;
        mockAxiosCreate.mockReturnValue(mockAxiosInstance);

        // Create the authenticated axios instance
        createAuthenticatedAxios(MOCK_SERVICE_ID, MOCK_SECURITY_MANAGER_URL, MOCK_CLIENT_SECRET);

        // Extract interceptor functions
        requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
        responseInterceptorSuccess = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
        responseInterceptorError = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

        // Set default env vars
        process.env.NODE_ENV = 'development';
        process.env.LOG_LEVEL = 'debug';
        process.env.MAX_RETRIES = '3';
        process.env.RETRY_DELAY_MS = '1000';
        process.env.SECURITYMANAGER_URL = MOCK_SECURITY_MANAGER_URL;
        process.env.CLIENT_SECRET = MOCK_CLIENT_SECRET;
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('request interceptor', () => {
        it('should add X-Request-ID and Authorization header', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/api/data' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('X-Request-ID')).toBeDefined();
            expect(processedConfig.headers.get('Authorization')).toBe('Bearer mock-jwt-token');
            expect(mockTokenManager.getToken).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('Extracted path: /api/data'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('started'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('Added authentication token'));
        });

        it('should bypass auth for health check paths', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/health' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('Authorization')).toBeUndefined();
            expect(mockTokenManager.getToken).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Bypassing auth for health check path'));
        });

        it('should bypass auth for auth paths', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/auth/login' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('Authorization')).toBeUndefined();
            expect(mockTokenManager.getToken).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Bypassing auth for auth path'));
        });

        it('should log error if getting token fails', async () => {
            mockTokenManager.getToken.mockRejectedValueOnce(new Error('Token error'));
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/api/data' };
            await requestInterceptor(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting token'), expect.any(Error));
        });

        it('should handle various URL formats for path extraction', async () => {
            const testCases = [
                { url: 'http://example.com/path/to/resource?query=1', expectedPath: '/path/to/resource' },
                { url: 'https://api.com/v1/users', expectedPath: '/v1/users' },
                { url: '/absolute/path', expectedPath: '/absolute/path' },
                { url: 'relative/path', expectedPath: '/relative/path' },
                { url: 'relative/path/', expectedPath: '/relative/path' },
                { url: '/ready?detail=full', expectedPath: '/ready' },
            ];

            for (const tc of testCases) {
                const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: tc.url };
                await requestInterceptor(config);
                expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Extracted path: ${tc.expectedPath}`));
                consoleLogSpy.mockClear();
            }
        });
    });

    describe('response interceptor', () => {
        it('should log successful response', async () => {
            const response: AxiosResponse = { config: { headers: { 'X-Request-ID': 'req1' } } as any, status: 200, data: {}, statusText: 'OK', headers: {} };
            (response.config as any)._requestStartTime = Date.now() - 100;

            const processedResponse = await responseInterceptorSuccess(response);

            expect(processedResponse).toBe(response);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Completed in 100ms with status 200'));
        });

        it('should log error response', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req2' } } as any, response: { status: 500, statusText: 'Internal Server Error', data: 'Error' } };
            (error.config as any)._requestStartTime = Date.now() - 200;

            await expect(responseInterceptorError(error)).rejects.toBe(error);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed after 200ms'), expect.objectContaining({
                status: 500,
                statusText: 'Internal Server Error',
                data: 'Error',
            }));
        });

        it('should retry failed requests (5xx)', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req3' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 0;

            mockAxios.mockResolvedValueOnce({ data: 'success' }); // Mock successful retry

            const retryPromise = responseInterceptorError(error);
            jest.advanceTimersByTime(1000); // Advance for retry delay
            await retryPromise;

            expect(error.config._retryCount).toBe(1);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Retrying (1/3)'));
            expect(mockAxios).toHaveBeenCalledTimes(1); // axios(originalRequest) called
        });

        it('should retry failed requests (401) and refresh token', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req4' } } as any, response: { status: 401 } };
            (error.config as any)._retryCount = 0;

            mockTokenManager.getToken.mockResolvedValueOnce('new-jwt-token'); // Mock new token
            mockAxios.mockResolvedValueOnce({ data: 'success' }); // Mock successful retry

            const retryPromise = responseInterceptorError(error);
            jest.advanceTimersByTime(1000); // Advance for retry delay
            await retryPromise;

            expect(error.config._retryCount).toBe(1);
            expect(mockTokenManager.getToken).toHaveBeenCalledTimes(1);
            expect(error.config.headers.get('Authorization')).toBe('Bearer new-jwt-token');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Got new token, retrying request'));
        });

        it('should not retry if max retries reached', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req5' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 3; // Max retries reached

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });

        it('should not retry for non-retryable status codes (e.g., 400)', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req6' } } as any, response: { status: 400 } };
            (error.config as any)._retryCount = 0;

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });

        it('should not retry if enableRetry is false', async () => {
            createAuthenticatedAxios({ serviceId: MOCK_SERVICE_ID, enableRetry: false });
            const error = { config: { headers: { 'X-Request-ID': 'req7' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 0;

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });
    });
});

describe('createClientAuthenticatedAxios', () => {
    let mockAxiosInstance: AxiosInstance;
    let requestInterceptor: any;
    let responseInterceptorSuccess: any;
    let responseInterceptorError: any;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_GET_TOKEN = jest.fn().mockReturnValue('client-token');
    const MOCK_BASE_URL = 'http://client-api.com';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock axios.create to capture interceptors
        mockAxiosInstance = {
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() },
            },
            get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
        } as any;
        mockAxiosCreate.mockReturnValue(mockAxiosInstance);

        // Create the client authenticated axios instance
        createClientAuthenticatedAxios(MOCK_GET_TOKEN, MOCK_BASE_URL);

        // Extract interceptor functions
        requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
        responseInterceptorSuccess = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
        responseInterceptorError = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

        // Set default env vars
        process.env.NODE_ENV = 'development';
        process.env.LOG_LEVEL = 'debug';
        process.env.MAX_RETRIES = '3';
        process.env.RETRY_DELAY_MS = '1000';
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('request interceptor', () => {
        it('should add X-Request-ID and Authorization header', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/api/data' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('X-Request-ID')).toBeDefined();
            expect(processedConfig.headers.get('Authorization')).toBe('Bearer client-token');
            expect(MOCK_GET_TOKEN).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('Extracted path: /api/data'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('started'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Request'), expect.stringContaining('Added authentication token'));
        });

        it('should bypass auth for health check paths', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/health' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('Authorization')).toBeUndefined();
            expect(MOCK_GET_TOKEN).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Bypassing auth for health check path'));
        });

        it('should bypass auth for auth paths', async () => {
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/auth/login' };
            const processedConfig = await requestInterceptor(config);

            expect(processedConfig.headers.get('Authorization')).toBeUndefined();
            expect(MOCK_GET_TOKEN).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Bypassing auth for auth path'));
        });

        it('should log warning if no token available', async () => {
            MOCK_GET_TOKEN.mockReturnValueOnce(null);
            const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: '/api/data' };
            await requestInterceptor(config);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No token available'));
        });

        it('should handle various URL formats for path extraction', async () => {
            const testCases = [
                { url: 'http://example.com/path/to/resource?query=1', expectedPath: '/path/to/resource' },
                { url: 'https://api.com/v1/users', expectedPath: '/v1/users' },
                { url: '/absolute/path', expectedPath: '/absolute/path' },
                { url: 'relative/path', expectedPath: '/relative/path' },
                { url: 'relative/path/', expectedPath: '/relative/path' },
                { url: '/ready?detail=full', expectedPath: '/ready' },
            ];

            for (const tc of testCases) {
                const config: InternalAxiosRequestConfig = { headers: new axios.AxiosHeaders(), url: tc.url };
                await requestInterceptor(config);
                expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Extracted path: ${tc.expectedPath}`));
                consoleLogSpy.mockClear();
            }
        });
    });

    describe('response interceptor', () => {
        it('should log successful response', async () => {
            const response: AxiosResponse = { config: { headers: { 'X-Request-ID': 'req1' } } as any, status: 200, data: {}, statusText: 'OK', headers: {} };
            (response.config as any)._requestStartTime = Date.now() - 100;

            const processedResponse = await responseInterceptorSuccess(response);

            expect(processedResponse).toBe(response);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Completed in 100ms with status 200'));
        });

        it('should log error response', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req2' } } as any, response: { status: 500, statusText: 'Internal Server Error', data: 'Error' } };
            (error.config as any)._requestStartTime = Date.now() - 200;

            await expect(responseInterceptorError(error)).rejects.toBe(error);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed after 200ms'), expect.objectContaining({
                status: 500,
                statusText: 'Internal Server Error',
                data: 'Error',
            }));
        });

        it('should retry failed requests (5xx)', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req3' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 0;

            mockAxios.mockResolvedValueOnce({ data: 'success' }); // Mock successful retry

            const retryPromise = responseInterceptorError(error);
            jest.advanceTimersByTime(1000); // Advance for retry delay
            await retryPromise;

            expect(error.config._retryCount).toBe(1);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Retrying (1/3)'));
            expect(mockAxios).toHaveBeenCalledTimes(1); // axios(originalRequest) called
        });

        it('should not retry if max retries reached', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req5' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 3; // Max retries reached

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });

        it('should not retry for non-retryable status codes (e.g., 400)', async () => {
            const error = { config: { headers: { 'X-Request-ID': 'req6' } } as any, response: { status: 400 } };
            (error.config as any)._retryCount = 0;

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });

        it('should not retry if enableRetry is false', async () => {
            createClientAuthenticatedAxios({ getToken: MOCK_GET_TOKEN, enableRetry: false });
            const error = { config: { headers: { 'X-Request-ID': 'req7' } } as any, response: { status: 500 } };
            (error.config as any)._retryCount = 0;

            await expect(responseInterceptorError(error)).rejects.toBe(error);
            expect(mockAxios).not.toHaveBeenCalled();
        });
    });
});
