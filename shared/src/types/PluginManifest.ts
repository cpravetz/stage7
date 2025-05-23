import { PluginDefinition, PluginPackage } from './Plugin'; // Ensure PluginPackage is imported
import { PluginRepositoryType } from './PluginRepository';

export interface PluginRepositoryLink {
    type: PluginRepositoryType;
    url?: string; // URL of the repository if applicable (e.g., Git repo URL, Marketplace URL)
    path?: string; // Path within the repository if the plugin is not at the root
    // Removed signature from here as it's better handled in PluginDefinition.security.trust
    dependencies?: Record<string, string>; // e.g. specific versions of other plugins from this repository
}

export interface PluginLocator {
    id: string;
    verb: string;
    version?: string; // It's useful to have version in locator
    repository: PluginRepositoryLink;
    // Potentially add 'publisher' or 'namespace' here for better unique identification
}

// PluginManifest is what's typically stored in a marketplace or registry.
// It might omit very large fields from PluginDefinition if they are stored elsewhere (e.g., detailed code in entryPoint.files for inline plugins if they are huge)
// However, for now, it mostly extends PluginDefinition.
export interface PluginManifest extends Omit<PluginDefinition, 'security' | 'entryPoint' | 'packageSource'> {
    // Overriding or ensuring these fields from PluginDefinition are present, potentially with minor differences for manifest context
    id: string;
    verb: string;
    version: string;
    language: PluginDefinition['language'];
    description: PluginDefinition['description'];
    explanation?: PluginDefinition['explanation'];
    inputDefinitions: PluginDefinition['inputDefinitions'];
    outputDefinitions: PluginDefinition['outputDefinitions'];
    
    packageSource?: PluginPackage; // Re-introducing packageSource, now typed
    entryPoint?: PluginDefinition['entryPoint']; // Making entryPoint explicitly part of manifest too

    repository: PluginRepositoryLink; // Information about where this manifest was sourced from

    // Security information that is safe to be public in a manifest
    // Specific signature details are part of PluginDefinition.security.trust
    securitySummary: {
        permissions: string[]; // Key permissions required
        sandboxLevel?: 'strict' | 'moderate' | 'none'; // Simplified indicator of sandboxing
    };
    
    // Trust and verification details, may differ slightly from internal PluginDefinition.security.trust
    // For example, a marketplace might add its own verification layer.
    trustVerifications?: {
        publisherVerified?: boolean;
        marketplaceScanned?: {
            scannerName: string;
            scanDate: string; // ISO 8601
            status: 'clean' | 'warning' | 'malicious';
            reportUrl?: string;
        }[];
        // signature here might be the one from PluginDefinition or a marketplace specific one
        signature?: string; 
    };

    distribution?: { // Optional: Information for UI/Marketplace display
        downloads?: number;
        rating?: number; // Average user rating
        userReviews?: number;
        size?: string; // e.g., "1.2MB" (if code is bundled or size is known)
        updatedAt: string; // ISO 8601 date string from PluginDefinition.updatedAt
        createdAt: string; // ISO 8601 date string from PluginDefinition.createdAt
        releaseNotes?: string; // Notes for the current version
    };
    
    // Keeping metadata, configuration definitions as directly from PluginDefinition
    metadata?: PluginDefinition['metadata'];
    configuration?: PluginDefinition['configuration'];
}