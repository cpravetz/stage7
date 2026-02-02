import { ChromaClient, Collection, Metadata, EmbeddingFunction } from 'chromadb';

// Use dynamic import for @xenova/transformers
let Transformers: any;
let pipeline: any;

// Global collection creation lock to prevent race conditions
const collectionCreationLocks = new Map<string, Promise<Collection>>();

class TransformerEmbeddingFunction implements EmbeddingFunction {
    private pipe: any;

    private constructor(pipe: any) {
        this.pipe = pipe;
    }

    public static async create() {
        if (!Transformers) {
            Transformers = await import('@xenova/transformers');

        }
        // Use a pre-downloaded and locally available model
        // This model should be part of the service's deployment package.
        const pipe = await Transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        return new TransformerEmbeddingFunction(pipe);
    }

    public async generate(texts: string[]): Promise<number[][]> {
        const output = await this.pipe(texts, { pooling: 'mean', normalize: true });
        return output.tolist();
    }
}

class KnowledgeStore {
    private client: ChromaClient;
    private embeddingFunction: EmbeddingFunction | null = null;
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        this.client = new ChromaClient({ path: process.env.CHROMADB_PATH || 'http://chromadb:8000' });
        console.log(`KnowledgeStore initialized, connecting to ChromaDB at ${process.env.CHROMADB_PATH || 'http://chromadb:8000'}`);
        this.initializationPromise = this.initializeEmbeddingFunction();
    }

    private async initializeEmbeddingFunction(): Promise<void> {
        try {
            this.embeddingFunction = await TransformerEmbeddingFunction.create();
            console.log('Transformer embedding function initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize transformer embedding function:', error);
            // In a production environment, you might want to handle this more gracefully,
            // perhaps by falling back to a simpler function or preventing the service from starting.
            throw new Error('Could not initialize embedding function.');
        }
    }

    private async getEmbeddingFunction(): Promise<EmbeddingFunction> {
        if (!this.initializationPromise) {
            throw new Error("KnowledgeStore embedding function not initialized.");
        }
        await this.initializationPromise;
        if (!this.embeddingFunction) {
            throw new Error("Embedding function is null after initialization.");
        }
        return this.embeddingFunction;
    }

    private async getOrCreateCollection(name: string): Promise<Collection> {
        // Check if another process is already creating this collection
        if (collectionCreationLocks.has(name)) {
            console.log(`Collection ${name} is being created by another process, waiting for completion...`);
            return collectionCreationLocks.get(name)!;
        }

        // Create a promise that will be resolved when this collection is created
        const creationPromise = this._createCollectionWithLock(name);
        
        // Store the promise so other requests can wait for it
        collectionCreationLocks.set(name, creationPromise);

        try {
            const collection = await creationPromise;
            // Clean up the lock after a brief delay to allow any lingering operations
            setTimeout(() => collectionCreationLocks.delete(name), 100);
            return collection;
        } catch (error) {
            // Remove lock on error so retries can try again
            collectionCreationLocks.delete(name);
            throw error;
        }
    }

    private async _createCollectionWithLock(name: string): Promise<Collection> {
        const embeddingFunction = await this.getEmbeddingFunction();
        try {
            const collection = await this.client.getCollection({
                name,
                embeddingFunction,
            });
            console.log(`Found existing collection: ${name}`);
            return collection;
        } catch (error) {
            console.log(`Collection ${name} not found, creating new one.`);
            try {
                const collection = await this.client.createCollection({
                    name,
                    embeddingFunction,
                });
                console.log(`Successfully created collection: ${name}`);
                return collection;
            } catch (createError) {
                if (createError instanceof Error && createError.message.includes('already exists')) {
                    console.log(`Collection ${name} was created by another process, getting it now.`);
                    try {
                        const collection = await this.client.getCollection({
                            name,
                            embeddingFunction,
                        });
                        return collection;
                    } catch (getError) {
                        console.error(`Failed to get collection ${name} after creation race condition:`, getError);
                        throw new Error(`ChromaDB connection failed after race condition: ${getError instanceof Error ? getError.message : 'Unknown error'}`);
                    }
                }
                console.error(`Failed to create collection ${name}:`, createError);
                throw new Error(`ChromaDB connection failed: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
            }
        }
    }

    public async save(collectionName: string, content: string, metadata: Metadata = {}): Promise<void> {
        try {
            const collection = await this.getOrCreateCollection(collectionName);
            // Use a more robust unique ID, like a hash of the content or a UUID
            const id = metadata.id as string || new Date().toISOString();

            // Sanitize metadata for ChromaDB
            const sanitizedMetadata: Metadata = {};
            for (const key in metadata) {
                if (typeof metadata[key] === 'object' && metadata[key] !== null) {
                    sanitizedMetadata[key] = JSON.stringify(metadata[key]);
                } else {
                    sanitizedMetadata[key] = metadata[key];
                }
            }

            await collection.upsert({
                ids: [id],
                documents: [content],
                metadatas: [sanitizedMetadata],
            });

            console.log(`Saved content to collection ${collectionName} with id ${id}`);
        } catch (error) {
            console.error(`Failed to save to knowledge base collection ${collectionName}:`, error);
            throw new Error(`Failed to save knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async query(collectionName: string, queryText: string, maxResults: number = 5): Promise<any[]> {
        try {
            const collection = await this.getOrCreateCollection(collectionName);

            const results = await collection.query({
                nResults: maxResults,
                queryTexts: [queryText],
            });

            if (!results.distances) {
                console.warn('Warning: results.distances is null or undefined.');
                return [];
            }

            console.log(`Queried collection ${collectionName} with "${queryText}", found ${results.ids[0].length} results.`);
            
            const formattedResults = results.ids[0].map((id, index) => ({
                id,
                document: results.documents[0][index],
                metadata: results.metadatas[0][index],
                distance: results.distances ? results.distances[0][index] : null,
            }));

            return formattedResults;
        } catch (error) {
            console.error(`Failed to query knowledge base collection ${collectionName}:`, error);
            throw new Error(`Failed to query knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export const knowledgeStore = new KnowledgeStore();