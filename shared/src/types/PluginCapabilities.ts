export interface ExternalCapability {
    type: 'iot' | 'api' | 'file' | 'database' | 'messaging';
    protocol: string;
    authentication: {
        type: 'oauth' | 'apikey' | 'certificate';
        config: Record<string, any>;
    };
    permissions: string[];
}

export interface PluginCapabilities {
    capabilities: ExternalCapability[];
    resourceLimits: {
        memory: number;
        cpu: number;
        network: {
            rateLimit: number;
            allowedDomains: string[];
        };
    };
}

export interface TaskPerformanceMetrics {
    successRate: number;
    taskCount: number;
    averageTaskDuration: number;
    lastEvaluation: string;
    qualityScore: number;
}
