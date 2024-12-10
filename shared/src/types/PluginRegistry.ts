import { Plugin } from './Plugin';

export interface PluginRepository {
    type: 'git' | 'npm' | 'local' | 'mongo';
    url: string;
    version: string;
    signature?: string;  // For security verification
    dependencies?: Record<string, string>;
}

export interface PluginManifest extends Omit<Plugin, 'security'> {
    repository: PluginRepository;
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
        registry: string;
        downloads: number;
        rating: number;
    };
}