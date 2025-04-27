import { PluginManifest } from './PluginManifest';
import { PluginLocator } from './PluginManifest';

export type PluginRepositoryType = 'git' | 'npm' | 'local' | 'mongo' | 'github';


export interface PluginRepository {
    type: PluginRepositoryType;
    store(manifest: PluginManifest): Promise<void>;
    fetch(id: string): Promise<PluginManifest | undefined>;
    fetchByVerb(verb: string): Promise<PluginManifest | undefined>;
    delete(id: string): Promise<void>;
    list(): Promise<PluginLocator[]>;
}

export interface RepositoryConfig {
    type: PluginRepositoryType;
    url?: string;
    credentials?: {
        username?: string;
        token?: string;
        email?: string;
    };
    options?: {
        defaultBranch?: string;
        registry?: string;
        localPath?: string;
        collection?: string;
    };
}