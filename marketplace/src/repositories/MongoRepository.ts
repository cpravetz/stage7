import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

export class MongoRepository implements PluginRepository {
    type: 'mongo' = 'mongo';
    private librarianUrl: string;
    private collection: string;
    private authenticatedApi: any;
    private securityManagerUrl: string;

    constructor(config: RepositoryConfig) {
        this.librarianUrl = config.url || process.env.LIBRARIAN_URL || 'librarian:5040';
        this.collection = config.options?.collection || 'plugins';
        this.securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

        // Create authenticated API client
        this.authenticatedApi = createAuthenticatedAxios(
            'MarketplaceMongoRepository',
            this.securityManagerUrl,
            process.env.CLIENT_SECRET || 'stage7AuthSecret'
        );
    }

    async store(manifest: PluginManifest): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: manifest.id,
                data: manifest,
                collection: this.collection,
                storageType: 'mongo'
            });
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to publish plugin to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async fetch(id: string): Promise<PluginManifest | undefined> {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/getData/${id}`, {
                params: {
                    collection: this.collection,
                    storageType: 'mongo'
                }
            });

            if (response.data && response.data.data) {
                return response.data.data as PluginManifest;
            }
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async fetchByVerb(verb: string): Promise<PluginManifest | undefined> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: { verb },
                options: { limit: 1 }
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0] as PluginManifest;
            }
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin by verb from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await this.authenticatedApi.delete(`http://${this.librarianUrl}/deleteData/${id}`, {
                params: {
                    collection: this.collection,
                    storageType: 'mongo'
                }
            });
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to delete plugin from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async list(): Promise<PluginLocator[]> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: {},
                options: {
                    projection: { id: 1, verb: 1, repository: 1 }
                }
            });

            if (response.data && response.data.data) {
                return response.data.data as PluginManifest[];
            }
            return [];
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to list plugins from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
}