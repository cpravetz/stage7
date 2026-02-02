import { LLMConversationType } from '@cktmcs/shared';

/**
 * Model Configuration - Defines a supported LLM model and its metadata
 */
export interface ModelConfiguration {
    id: string;                          // Unique ID (e.g., "gpt-4-turbo")
    name: string;                        // Display name
    provider: string;                    // "openai" | "anthropic" | "google" | "local"
    providerModelId: string;             // Model ID at provider (e.g., "gpt-4-turbo-2024-04-09")
    tokenLimit: number;                  // Context window size
    costPer1kTokens: {
        input: number;                   // Cost per 1k input tokens
        output: number;                  // Cost per 1k output tokens
    };
    supportedConversationTypes: LLMConversationType[];
    status: 'active' | 'beta' | 'deprecated' | 'retired';
    deployedAt: string;                  // ISO8601 DateTime
    retiredAt?: string;                  // ISO8601 DateTime
    rolloutPercentage: number;           // 0-100, for gradual deployment

    // Provider credentials configuration
    providerCredentials: {
        keyVault: string;                // Reference to vault ("AWS_SECRETS_MANAGER", "VAULT", "ENV")
        credentialName: string;          // Vault key name (e.g., "openai-api-key-prod")
        validated: boolean;              // Did health check pass?
        validatedAt?: string;            // ISO8601 DateTime
        validationError?: string;        // If failed, why?
    };

    // Service availability status
    availability: {
        status: 'available' | 'degraded' | 'unavailable' | 'unknown';
        checkedAt?: string;              // ISO8601 DateTime
        reason?: string;                 // Why unavailable?
        nextCheckAt?: string;            // ISO8601 DateTime
    };

    // Health check configuration
    healthChecks: {
        endpoint: string;                // Service endpoint to probe
        method: 'GET' | 'POST';
        timeout: number;                 // ms
        expectedStatusCodes: number[];   // e.g., [200, 429]
        expectedResponseBody?: string;   // Regex pattern to match
        frequency: number;               // ms between checks (e.g., 300000 = 5 min)
    };

    // SLA targets
    sla?: {
        successRateMinimum: number;      // e.g., 0.98 = 98%
        p99LatencyMs: number;            // e.g., 3000 = 3 seconds
        availabilityPercentage: number;  // e.g., 0.99 = 99% uptime
    };

    // Metadata
    metadata: {
        version: string;                 // Model version
        releaseNotes: string;            // What changed
        knownLimitations: string[];      // e.g., ["Max 32k tokens", "No streaming JSON"]
        optimizations: string[];         // e.g., ["Code generation", "Reasoning"]
    };

    // Audit trail
    createdBy: string;
    createdAt: string;                   // ISO8601 DateTime
    updatedBy: string;
    updatedAt: string;                   // ISO8601 DateTime
}

/**
 * Health check result
 */
export interface ServiceHealthStatus {
    modelName: string;
    status: 'available' | 'degraded' | 'unavailable';
    lastChecked: string;                 // ISO8601 DateTime
    checksDuration: number;              // ms to complete health check
    errorCount: number;                  // Consecutive failures
    credentialValid: boolean;
    credentialValidatedAt: string;       // ISO8601 DateTime
    errorType?: 'auth_failed' | 'timeout' | 'service_error' | 'rate_limited' | 'other';
    errorMessage?: string;
}

/**
 * Model config change for audit trail
 */
export interface ModelConfigChange {
    timestamp: string;                   // ISO8601 DateTime
    changedBy: string;
    previousValue: any;
    newValue: any;
    reason: string;
}

/**
 * Stored model config version (with history)
 */
export interface ModelConfigVersion {
    version: number;
    modelId: string;
    config: ModelConfiguration;
    changedBy: string;
    changedAt: string;                   // ISO8601 DateTime
    reason: string;
    previousVersion?: number;
    status: 'active' | 'superseded';
}
