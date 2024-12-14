import { PluginManifest } from './PluginManifest';

export interface PluginRepository {
    type: 'git' | 'npm' | 'local' | 'mongo';
    publish(manifest: PluginManifest): Promise<void>;
    fetch(id: string): Promise<PluginManifest | undefined>;
    fetchByVerb(verb: string): Promise<PluginManifest | undefined>;
    delete(id: string): Promise<void>;
    list(): Promise<PluginManifest[]>;
}

export interface RepositoryConfig {
    type: 'git' | 'npm' | 'local' | 'mongo';
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