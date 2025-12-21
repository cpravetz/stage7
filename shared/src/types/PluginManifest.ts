import { PluginDefinition, PluginPackage, PluginSecurity, EntryPointType, PluginParameter, PluginConfigurationItem, PluginMetadata } from './Plugin'; // Import necessary types
import { PluginRepositoryType } from './PluginRepository';

export interface PluginRepositoryLink {
    type: PluginRepositoryType;
    url?: string;
    path?: string;
    dependencies?: Record<string, string>;
}

export interface PluginLocator {
    id: string;
    verb: string;
    description?: string;
    version?: string;
    repository: PluginRepositoryLink;
    language?: string;
    name?: string; // Added name property
    category?: string;
    capabilities?: string[];
    // Potentially add 'publisher' or 'namespace' here for better unique identification
}

export interface PluginManifest {
    // Core fields from PluginDefinition that are essential for a manifest
    id: string;
    verb: string;
    version: string;
    language: PluginDefinition['language'];
    description: PluginDefinition['description'];
    explanation?: PluginDefinition['explanation'];
    inputDefinitions: PluginParameter[];
    outputDefinitions: PluginParameter[];
    inputGuidance?: string;

    packageSource?: PluginPackage;
    entryPoint?: EntryPointType;

    repository: PluginRepositoryLink; // Information about where this manifest was sourced from

    security: PluginSecurity; // Restored to match PluginDefinition for compatibility

    // Optional: Marketplace-specific or enhanced trust/verification info
    trustVerifications?: {
        publisherVerified?: boolean;
        marketplaceScanned?: {
            scannerName: string;
            scanDate: string; // ISO 8601
            status: 'clean' | 'warning' | 'malicious';
            reportUrl?: string;
        }[];
        // signature from security.trust.signature will be the primary one
    };

    // Optional: Information for UI/Marketplace display
    distribution?: {
        downloads?: number;
        rating?: number;
        userReviews?: number;
        size?: string;
        updatedAt: string; // Should align with PluginDefinition.updatedAt
        createdAt: string; // Should align with PluginDefinition.createdAt
        releaseNotes?: string;
    };

    metadata?: PluginMetadata;
        configuration?: PluginConfigurationItem[];
    
        // Discovery metadata
        semanticDescription?: string;
        capabilityKeywords?: string[];
        usageExamples?: string[];
    
        // Health status
        healthStatus?: {
            status: 'healthy' | 'unhealthy' | 'unknown';
            lastChecked: string; // ISO 8601
        };
    }
    