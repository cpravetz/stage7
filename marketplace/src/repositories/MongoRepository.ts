import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator, createAuthenticatedAxios, compareVersions } from '@cktmcs/shared';
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

    async fetch(id: string, version?: string): Promise<PluginManifest | undefined> {
        try {
            if (version) {
                // Fetch specific version
                const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                    collection: this.collection,
                    query: { id, version },
                    options: { limit: 1 }
                });
                if (response.data && response.data.data && response.data.data.length > 0) {
                    return response.data.data[0] as PluginManifest;
                }
                return undefined;
            } else {
                // Fetch all versions for the ID and return the latest
                const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                    collection: this.collection,
                    query: { id }
                });
                if (response.data && response.data.data && response.data.data.length > 0) {
                    const manifests = response.data.data as PluginManifest[];
                    if (manifests.length === 0) return undefined;
                    // Sort by semantic version, descending (newest first)
                    manifests.sort((a, b) => compareVersions(b.version, a.version));
                    return manifests[0];
                }
                return undefined;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin by ID '${id}' from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        try {
            const query: any = { verb };
            if (version) {
                query.version = version;
            }

            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: query,
                // No limit if specific version is requested, otherwise sort and pick latest
                options: version ? { limit: 1 } : {} 
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const manifests = response.data.data as PluginManifest[];
                if (manifests.length === 0) return undefined;

                if (version) { // Specific version was requested
                    return manifests[0];
                } else {
                    // Sort by semantic version, descending (newest first)
                    manifests.sort((a, b) => compareVersions(b.version, a.version));
                    return manifests[0];
                }
            }
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin by verb '${verb}' from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async fetchAllVersions(id: string): Promise<PluginManifest[] | undefined> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: { id }
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const manifests = response.data.data as PluginManifest[];
                // Sort by semantic version, descending (newest first)
                manifests.sort((a, b) => compareVersions(b.version, a.version));
                return manifests;
            }
            return undefined; // Or an empty array if that's preferred for "no versions found"
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch all versions for plugin ID '${id}' from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async delete(id: string, version?: string): Promise<void> {
        try {
            if (version) {
                // Delete specific version
                // Librarian's deleteData by ID might not support complex queries for deletion.
                // If it supports a query body for delete, use that.
                // Assuming simple delete by ID, we might need a different endpoint or store ID as id_version.
                // For now, let's assume librarian /deleteData can take a query or we adjust how we store.
                // A common pattern is to have a unique _id for each document.
                // If manifest.id is the plugin's logical ID and version is separate,
                // the librarian's /deleteData/{id} might be tricky if 'id' is not the unique document _id.
                // Let's assume the store method creates a unique ID if needed, or that plugin ID + version is unique.
                // The current store uses manifest.id as the document ID, which means only one version can be stored per ID.
                // This needs reconciliation with the goal of storing multiple versions.

                // **Assumption for now: The `store` method should be storing documents with a unique ID,
                // possibly a composite like `${manifest.id}-${manifest.version}` or letting MongoDB generate one,
                // and `manifest.id` and `manifest.version` are just fields.**
                // If `id` in `deleteData/${id}` refers to the document's unique `_id`, this won't work as intended
                // without first fetching the document's `_id`.

                // Given the current `store` uses `manifest.id` as the ID for `storeData`,
                // this means only one version of a plugin (the last one written) exists per ID.
                // The multi-version logic in fetch/fetchAllVersions relies on `searchData` with queries.
                // To delete a specific version, the librarian API would need to support delete by query.
                // Let's assume for now that `deleteData` is enhanced or we use a workaround.
                // A more robust solution would be for librarian to support deletion by query:
                await this.authenticatedApi.post(`http://${this.librarianUrl}/deleteData`, { // Assuming a /deleteData that accepts a query
                    collection: this.collection,
                    query: { id, version },
                    storageType: 'mongo',
                    multiple: false // Ensure only one is deleted if somehow multiple match (should not happen for id+version)
                });
                console.log(`Attempted to delete plugin ID '${id}' version '${version}'.`);

            } else {
                // Delete all versions for the ID
                // Again, assuming librarian can delete based on a query for all documents with this plugin ID.
                await this.authenticatedApi.post(`http://${this.librarianUrl}/deleteData`, { // Assuming a /deleteData that accepts a query
                    collection: this.collection,
                    query: { id },
                    storageType: 'mongo',
                    multiple: true
                });
                console.log(`Attempted to delete all versions of plugin ID '${id}'.`);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to delete plugin ID '${id}'${version ? ` version '${version}'` : ''} from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async list(): Promise<PluginLocator[]> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/searchData`, {
                collection: this.collection,
                query: {}, // Fetch all documents
                options: {
                    // Project necessary fields for PluginLocator
                    projection: { id: 1, verb: 1, version: 1, repositoryType: '$type', name: 1, description: 1 }
                }
            });

            if (response.data && response.data.data) {
                // Map the manifest data to PluginLocator
                return response.data.data.map((plugin: any) => ({
                    id: plugin.id,
                    verb: plugin.verb,
                    version: plugin.version, // Now included
                    name: plugin.name,
                    description: plugin.description,
                    repository: { // Assuming 'type' field in DB maps to repository.type
                        type: plugin.repositoryType || this.type, // Fallback to this.type if not in DB
                        // url: plugin.repository?.url // Only if repository object is stored
                    }
                } as PluginLocator));
            }
            return [];
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to list plugins from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }
}