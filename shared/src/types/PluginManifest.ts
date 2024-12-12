import { Plugin } from './Plugin';

export interface PluginRepositoryLink {
    type: 'git' | 'npm' | 'local' | 'mongo';
    url?: string;
    signature?: string;  // For security verification
    dependencies?: Record<string, string>;
}

export interface PluginManifest extends Omit<Plugin, 'security'> {
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
}