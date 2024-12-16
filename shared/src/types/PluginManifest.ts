import { PluginDefinition } from './Plugin';
import { PluginRepositoryType } from './PluginRepository';

export interface PluginRepositoryLink {
    type: PluginRepositoryType;
    url?: string;
    signature?: string;  // For security verification
    dependencies?: Record<string, string>;
}

export interface PluginLocator {
    id: string;
    verb: string;
    repository: PluginRepositoryLink;
}

export interface PluginManifest extends Omit<PluginDefinition, 'security'> {
    repository: PluginRepositoryLink;
    security: {
        permissions: string[];
        sandboxOptions: {
            allowEval: boolean;
            timeout: number;
            memory: number;
            allowedModules: string[];
            allowedAPIs: string[];
        };
        trust: {
            signature?: string;
            publisher?: string;
            certificateHash?: string;
        };
    };
    distribution: {
        downloads: number;
        rating: number;
    };
    version: string;
}