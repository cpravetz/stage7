import { PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

export class MongoRepository implements PluginRepository {
    type: 'mongo' = 'mongo';
    private librarianUrl: string;
    private collection: string;

    constructor(config: RepositoryConfig) {
        this.librarianUrl = config.url || process.env.LIBRARIAN_URL || 'librarian:5040';
        this.collection = config.options?.collection || 'plugins';
    }

    async publish(manifest: PluginManifest): Promise<void> {
        try {
            await axios.post(`http://${this.librarianUrl}/storeData`, {
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
            const response = await axios.get(`http://${this.librarianUrl}/getData/${id}`, {
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
            const response = await axios.post(`http://${this.librarianUrl}/searchData`, {
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
            await axios.delete(`http://${this.librarianUrl}/deleteData/${id}`, {
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

    async list(): Promise<PluginManifest[]> {
        try {
            const response = await axios.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: {},
                options: {
                    sort: { 'distribution.downloads': -1 }
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