import axios from 'axios';
import { redisCache } from '@cktmcs/shared';
import { ModelConfiguration, ServiceHealthStatus } from '../types/ModelConfig';

/**
 * ServiceHealthChecker - Validates model credentials and performs health checks
 * Ensures models are never attempted if credentials are unavailable or service is down
 */
export class ServiceHealthChecker {
    private healthCheckInterval: Map<string, NodeJS.Timer> = new Map();
    private healthStatus: Map<string, ServiceHealthStatus> = new Map();
    private readonly HEALTH_STATUS_TTL = 600; // 10 minutes in Redis

    /**
     * Load credentials from vault based on configuration
     */
    async loadCredential(keyVault: string, credentialName: string): Promise<string | null> {
        try {
            // Support multiple vault types
            switch (keyVault.toUpperCase()) {
                case 'AWS_SECRETS_MANAGER':
                    return await this.loadFromAwsSecretsManager(credentialName);
                case 'VAULT':
                    return await this.loadFromHashiCorpVault(credentialName);
                case 'ENV':
                default:
                    return this.loadFromEnvironment(credentialName);
            }
        } catch (error) {
            console.error(`[Health Check] Error loading credential ${credentialName}:`, error);
            return null;
        }
    }

    /**
     * Load credential from AWS Secrets Manager
     */
    private async loadFromAwsSecretsManager(credentialName: string): Promise<string | null> {
        try {
            // In production, use AWS SDK: import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
            // For now, use environment variable as fallback
            const value = process.env[credentialName];
            if (!value) {
                console.warn(`[Health Check] Credential ${credentialName} not found in environment (AWS Secrets Manager fallback)`);
                return null;
            }
            return value;
        } catch (error) {
            console.error(`[Health Check] Failed to load from AWS Secrets Manager:`, error);
            return null;
        }
    }

    /**
     * Load credential from HashiCorp Vault
     */
    private async loadFromHashiCorpVault(credentialName: string): Promise<string | null> {
        try {
            const vaultAddr = process.env.VAULT_ADDR || 'http://vault:8200';
            const vaultToken = process.env.VAULT_TOKEN;

            if (!vaultToken) {
                console.warn('[Health Check] VAULT_TOKEN not set');
                return null;
            }

            const response = await axios.get(
                `${vaultAddr}/v1/secret/data/${credentialName}`,
                {
                    headers: { 'X-Vault-Token': vaultToken },
                    timeout: 5000
                }
            );

            return response.data.data.data.api_key || response.data.data.data.key || null;
        } catch (error) {
            console.error(`[Health Check] Failed to load from HashiCorp Vault:`, error);
            return null;
        }
    }

    /**
     * Load credential from environment variable
     */
    private loadFromEnvironment(credentialName: string): string | null {
        return process.env[credentialName] || null;
    }

    /**
     * Validate model credentials are available and working
     */
    async validateModelCredentials(model: ModelConfiguration): Promise<boolean> {
        try {
            const credential = await this.loadCredential(
                model.providerCredentials.keyVault,
                model.providerCredentials.credentialName
            );

            if (!credential || credential.length === 0) {
                console.error(`[Health Check] No credential found for ${model.name}`);
                this.recordHealthStatus(model.name, 'unavailable', 'Credential not found', 'auth_failed');
                return false;
            }

            // Perform health check to validate credential works
            const testResult = await this.performHealthCheck(model, credential);

            if (testResult.success) {
                console.info(`[Health Check] Credentials validated for ${model.name}`);
                this.recordHealthStatus(model.name, 'available', undefined, undefined, 0);
                return true;
            } else {
                console.warn(`[Health Check] Credential validation failed for ${model.name}: ${testResult.error}`);
                this.recordHealthStatus(model.name, 'unavailable', testResult.error, testResult.errorType);
                return false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Health Check] Error validating credentials for ${model.name}:`, errorMessage);
            this.recordHealthStatus(model.name, 'unavailable', `Validation error: ${errorMessage}`, 'other');
            return false;
        }
    }

    /**
     * Schedule periodic health checks for a model
     */
    scheduleHealthCheck(model: ModelConfiguration) {
        const checkInterval = model.healthChecks.frequency || 5 * 60 * 1000; // 5 min default

        // Clear any existing timer
        if (this.healthCheckInterval.has(model.name)) {
            clearInterval(this.healthCheckInterval.get(model.name) as any);
        }

        // Schedule periodic check
        const timer = setInterval(async () => {
            try {
                const credential = await this.loadCredential(
                    model.providerCredentials.keyVault,
                    model.providerCredentials.credentialName
                );

                if (!credential) {
                    this.recordHealthStatus(model.name, 'unavailable', 'Credential not found', 'auth_failed');
                    return;
                }

                const startTime = Date.now();
                const result = await this.performHealthCheck(model, credential);
                const duration = Date.now() - startTime;

                if (result.success) {
                    console.debug(`[Health Check] ${model.name} healthy (${duration}ms)`);
                    this.recordHealthStatus(model.name, 'available', undefined, undefined, 0, duration);
                } else {
                    const status = (result.status || 'unavailable') as 'available' | 'degraded' | 'unavailable';
                    console.warn(`[Health Check] ${model.name} unhealthy: ${result.error}`);
                    this.recordHealthStatus(model.name, status, result.error, result.errorType);
                }
            } catch (error) {
                console.error(`[Health Check] Periodic check failed for ${model.name}:`, error);
                this.recordHealthStatus(model.name, 'unavailable',
                    `Check error: ${error instanceof Error ? error.message : String(error)}`, 'other');
            }
        }, checkInterval);

        this.healthCheckInterval.set(model.name, timer);
    }

    /**
     * Execute health check against provider endpoint
     */
    private async performHealthCheck(
        model: ModelConfiguration,
        credential: string
    ): Promise<{ success: boolean; error?: string; errorType?: string; status?: string; duration?: number }> {
        const config = model.healthChecks;
        const timeout = config.timeout || 5000;

        try {
            const response = await Promise.race([
                axios({
                    method: config.method,
                    url: config.endpoint,
                    headers: {
                        'Authorization': `Bearer ${credential}`,
                        'User-Agent': 'MCS-Brain-HealthCheck/1.0'
                    },
                    timeout
                }),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), timeout + 500)
                )
            ]);

            // Check response status
            if (!config.expectedStatusCodes.includes(response.status)) {
                if (response.status === 429) {
                    return {
                        success: false,
                        error: `Rate limited (status ${response.status})`,
                        errorType: 'rate_limited',
                        status: 'degraded'
                    };
                }
                if (response.status === 401 || response.status === 403) {
                    return {
                        success: false,
                        error: `Authentication failed (status ${response.status})`,
                        errorType: 'auth_failed',
                        status: 'unavailable'
                    };
                }
                return {
                    success: false,
                    error: `Unexpected status code: ${response.status}`,
                    errorType: 'service_error'
                };
            }

            // Validate response body if configured
            if (config.expectedResponseBody) {
                const bodyRegex = new RegExp(config.expectedResponseBody);
                const responseBody = JSON.stringify(response.data);
                if (!bodyRegex.test(responseBody)) {
                    return {
                        success: false,
                        error: 'Response body does not match expected format',
                        errorType: 'service_error'
                    };
                }
            }

            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Classify error type
            let errorType = 'other';
            if (errorMessage.includes('timeout')) {
                errorType = 'timeout';
            } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
                errorType = 'auth_failed';
            } else if (errorMessage.includes('429') || errorMessage.includes('rate')) {
                errorType = 'rate_limited';
            }

            return {
                success: false,
                error: errorMessage,
                errorType
            };
        }
    }

    /**
     * Record health status and cache in Redis
     */
    private recordHealthStatus(
        modelName: string,
        status: 'available' | 'degraded' | 'unavailable',
        reason?: string,
        errorType?: string,
        errorCount: number = 0,
        duration: number = 0
    ) {
        const healthStatus: ServiceHealthStatus = {
            modelName,
            status,
            lastChecked: new Date().toISOString(),
            checksDuration: duration,
            errorCount,
            credentialValid: status !== 'unavailable',
            credentialValidatedAt: new Date().toISOString(),
            errorType: errorType as any,
            errorMessage: reason
        };

        // Update in-memory cache
        this.healthStatus.set(modelName, healthStatus);

        // Also cache in Redis for distributed access
        (async () => {
            try {
                await redisCache.set(
                    `model-health:${modelName}`,
                    healthStatus,
                    this.HEALTH_STATUS_TTL
                );
            } catch (error) {
                console.error(`[Health Check] Failed to cache health status for ${modelName}:`, error);
            }
        })();
    }

    /**
     * Check if model is available for use
     */
    isModelAvailable(modelName: string): boolean {
        const status = this.healthStatus.get(modelName);
        if (!status) {
            return true; // Unknown status, allow attempt
        }
        return (status.status === 'available' || status.status === 'degraded') &&
            status.credentialValid === true;
    }

    /**
     * Get health status for a model
     */
    getHealthStatus(modelName: string): ServiceHealthStatus | undefined {
        return this.healthStatus.get(modelName);
    }

    /**
     * Get health status for all models
     */
    getAllHealthStatus(): Map<string, ServiceHealthStatus> {
        return new Map(this.healthStatus);
    }

    /**
     * Get availability for all models
     */
    getAvailableModels(): string[] {
        const available: string[] = [];
        for (const [modelName, status] of this.healthStatus.entries()) {
            if (this.isModelAvailable(modelName)) {
                available.push(modelName);
            }
        }
        return available;
    }

    /**
     * Validate all models and schedule periodic checks
     */
    async validateAllModels(models: ModelConfiguration[]): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();

        console.log(`[Health Check] Validating ${models.length} models...`);

        for (const model of models) {
            const isValid = await this.validateModelCredentials(model);
            results.set(model.name, isValid);

            // Only schedule periodic checks for models we're using
            if (model.status === 'active' || model.status === 'beta') {
                this.scheduleHealthCheck(model);
            }
        }

        const validCount = Array.from(results.values()).filter(v => v).length;
        console.log(`[Health Check] Validation complete: ${validCount}/${models.length} models available`);

        return results;
    }

    /**
     * Stop all health checks (for graceful shutdown)
     */
    stopAllChecks() {
        for (const [modelName, timer] of this.healthCheckInterval.entries()) {
            clearInterval(timer as any);
            console.log(`[Health Check] Stopped checks for ${modelName}`);
        }
        this.healthCheckInterval.clear();
    }
}

// Export singleton instance
export const serviceHealthChecker = new ServiceHealthChecker();
