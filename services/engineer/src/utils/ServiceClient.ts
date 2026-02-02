/**
 * Service client utilities with timeout and retry configuration
 * Provides resilient communication with external services (Brain, Librarian)
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { withRetry, RetryStrategy, DEFAULT_RETRY_STRATEGY, EngineerErrorHandler, ErrorSeverity } from './ErrorHandler';
import logger, { ScopedLogger } from './Logger';

export interface ServiceClientConfig {
    baseUrl: string;
    timeout?: number;
    retryStrategy?: RetryStrategy;
    headers?: Record<string, string>;
}

/**
 * Service client wrapper with built-in retry logic and timeout handling
 */
export class ServiceClient {
    private client: AxiosInstance;
    private config: ServiceClientConfig;

    constructor(config: ServiceClientConfig) {
        this.config = {
            timeout: 30000,
            ...config
        };

        this.client = axios.create({
            baseURL: config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                ...config.headers
            }
        });

        // Add request/response interceptors
        this.setupInterceptors();
    }

    /**
     * Setup logging interceptors
     */
    private setupInterceptors(): void {
        this.client.interceptors.request.use(
            config => {
                const context = logger.getContext();
                config.headers['X-Correlation-ID'] = context.correlationId;
                logger.debug(`Outgoing request: ${config.method?.toUpperCase()} ${config.url}`, {
                    correlationId: context.correlationId
                });
                return config;
            },
            error => {
                logger.error('Request interceptor error', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            response => {
                logger.debug(`Response received: ${response.status} from ${response.config.url}`);
                return response;
            },
            error => {
                const status = error.response?.status || 'unknown';
                logger.warn(`Response error: ${status}`, { url: error.config?.url });
                return Promise.reject(error);
            }
        );
    }

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            () => this.client.get<T>(url, config),
            `GET ${url}`,
            this.config.retryStrategy || DEFAULT_RETRY_STRATEGY,
            (attempt, error) => {
                logger.warn(`Retry attempt ${attempt} for GET ${url}`, {
                    error: error.message
                });
            }
        ).then(response => response.data);
    }

    /**
     * Make a POST request with retry logic
     */
    async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            () => this.client.post<T>(url, data, config),
            `POST ${url}`,
            this.config.retryStrategy || DEFAULT_RETRY_STRATEGY,
            (attempt, error) => {
                logger.warn(`Retry attempt ${attempt} for POST ${url}`, {
                    error: error.message
                });
            }
        ).then(response => response.data);
    }

    /**
     * Make a PUT request with retry logic
     */
    async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            () => this.client.put<T>(url, data, config),
            `PUT ${url}`,
            this.config.retryStrategy || DEFAULT_RETRY_STRATEGY,
            (attempt, error) => {
                logger.warn(`Retry attempt ${attempt} for PUT ${url}`, {
                    error: error.message
                });
            }
        ).then(response => response.data);
    }

    /**
     * Make a DELETE request with retry logic
     */
    async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        return withRetry(
            () => this.client.delete<T>(url, config),
            `DELETE ${url}`,
            this.config.retryStrategy || DEFAULT_RETRY_STRATEGY,
            (attempt, error) => {
                logger.warn(`Retry attempt ${attempt} for DELETE ${url}`, {
                    error: error.message
                });
            }
        ).then(response => response.data);
    }

    /**
     * Update base URL (useful for dynamic service discovery)
     */
    updateBaseUrl(baseUrl: string): void {
        this.client.defaults.baseURL = baseUrl;
        this.config.baseUrl = baseUrl;
        logger.debug(`Service client base URL updated to ${baseUrl}`);
    }

    /**
     * Update timeout
     */
    updateTimeout(timeout: number): void {
        this.client.defaults.timeout = timeout;
        this.config.timeout = timeout;
        logger.debug(`Service client timeout updated to ${timeout}ms`);
    }
}

/**
 * Brain service client (for LLM interactions)
 */
export class BrainClient extends ServiceClient {
    constructor(baseUrl: string) {
        const strategy: RetryStrategy = {
            maxAttempts: 3,
            initialBackoff: 2000,
            maxBackoff: 8000,
            backoffMultiplier: 2,
            timeoutMs: 60000 // Brain operations can take longer
        };

        super({
            baseUrl,
            timeout: 60000,
            retryStrategy: strategy,
            headers: {
                'User-Agent': 'Engineer-Service/1.0'
            }
        });
    }

    /**
     * Send chat request to Brain
     */
    async chat(payload: any, scoped?: ScopedLogger): Promise<any> {
        if (scoped) {
            scoped.debug('Sending request to Brain', { endpoint: '/chat' });
        }
        return this.post('/chat', payload);
    }
}

/**
 * Librarian service client (for data storage/retrieval)
 */
export class LibrarianClient extends ServiceClient {
    constructor(baseUrl: string) {
        const strategy: RetryStrategy = {
            maxAttempts: 2,
            initialBackoff: 1000,
            maxBackoff: 5000,
            backoffMultiplier: 2,
            timeoutMs: 30000
        };

        super({
            baseUrl,
            timeout: 30000,
            retryStrategy: strategy,
            headers: {
                'User-Agent': 'Engineer-Service/1.0'
            }
        });
    }

    /**
     * Store data in Librarian
     */
    async storeData(payload: any, scoped?: ScopedLogger): Promise<any> {
        if (scoped) {
            scoped.debug('Storing data in Librarian', { collection: payload.collection });
        }
        return this.post('/storeData', payload);
    }

    /**
     * Load data from Librarian
     */
    async loadData(id: string, collection: string, scoped?: ScopedLogger): Promise<any> {
        if (scoped) {
            scoped.debug('Loading data from Librarian', { id, collection });
        }
        return this.get(`/loadData/${id}?collection=${collection}&storageType=mongo`);
    }
}

/**
 * Centralized service client manager
 */
export class ServiceClientManager {
    private brainClient: BrainClient | null = null;
    private librarianClient: LibrarianClient | null = null;

    /**
     * Initialize service clients
     */
    initialize(brainUrl: string, librarianUrl: string): void {
        this.brainClient = new BrainClient(`http://${brainUrl}`);
        this.librarianClient = new LibrarianClient(`http://${librarianUrl}`);
        logger.info('Service clients initialized', { brainUrl, librarianUrl });
    }

    /**
     * Get Brain client
     */
    getBrainClient(): BrainClient {
        if (!this.brainClient) {
            throw new Error('Brain client not initialized. Call initialize() first.');
        }
        return this.brainClient;
    }

    /**
     * Get Librarian client
     */
    getLibrarianClient(): LibrarianClient {
        if (!this.librarianClient) {
            throw new Error('Librarian client not initialized. Call initialize() first.');
        }
        return this.librarianClient;
    }

    /**
     * Update Brain service URL (for service discovery/failover)
     */
    updateBrainUrl(url: string): void {
        if (this.brainClient) {
            this.brainClient.updateBaseUrl(`http://${url}`);
            logger.info(`Brain service URL updated to ${url}`);
        }
    }

    /**
     * Update Librarian service URL
     */
    updateLibrarianUrl(url: string): void {
        if (this.librarianClient) {
            this.librarianClient.updateBaseUrl(`http://${url}`);
            logger.info(`Librarian service URL updated to ${url}`);
        }
    }
}

export const serviceClientManager = new ServiceClientManager();
