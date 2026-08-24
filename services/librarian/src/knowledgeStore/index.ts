import { ChromaClient, Collection, Metadata, EmbeddingFunction } from 'chromadb';
import * as crypto from 'crypto';

// Simple hash-based embedding function that doesn't require ONNX Runtime
// This provides basic semantic search capability using TF-IDF-like hashing
class SimpleEmbeddingFunction implements EmbeddingFunction {
    private dimension: number;

    constructor(dimension: number = 384) {
        this.dimension = dimension;
    }

    public async generate(texts: string[]): Promise<number[][]> {
        return texts.map(text => this.embed(text));
    }

    private embed(text: string): number[] {
        const embedding: number[] = new Array(this.dimension).fill(0);
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);

        for (const word of words) {
            const hash = crypto.createHash('md5').update(word).digest();
            for (let i = 0; i < this.dimension; i++) {
                // Use hash bytes to distribute word influence across dimensions
                const hashByte = hash[i % hash.length];
                // Center around 0 by subtracting 128
                embedding[i] += (hashByte - 128) / 128;
            }
        }

        // Normalize the embedding
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < this.dimension; i++) {
                embedding[i] /= magnitude;
            }
        }

        return embedding;
    }
}

// Global collection creation lock to prevent race conditions
const collectionCreationLocks = new Map<string, Promise<Collection>>();

class KnowledgeStore {
    private client: ChromaClient;
    private embeddingFunction: SimpleEmbeddingFunction;

    constructor() {
        this.client = new ChromaClient({ path: process.env.CHROMADB_PATH || 'http://chromadb:8000' });
        this.embeddingFunction = new SimpleEmbeddingFunction();
        console.log(`KnowledgeStore initialized, connecting to ChromaDB at ${process.env.CHROMADB_PATH || 'http://chromadb:8000'}`);
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
        try {
            const collection = await this.client.getCollection({
                name,
                embeddingFunction: this.embeddingFunction,
            });
            console.log(`Found existing collection: ${name}`);
            return collection;
        } catch (error) {
            // Collection not found or has incompatible embedding function
            const errorMsg = error instanceof Error ? error.message : '';
            if (errorMsg.includes('No embedding function found') || errorMsg.includes('DefaultEmbeddingFunction')) {
                console.log(`Collection ${name} has incompatible embedding function, deleting and recreating.`);
                try {
                    await this.client.deleteCollection({ name });
                    console.log(`Deleted collection ${name}`);
                } catch (deleteError) {
                    console.warn(`Failed to delete collection ${name}:`, deleteError);
                }
            }
            console.log(`Creating new collection: ${name}`);
            try {
                const collection = await this.client.createCollection({
                    name,
                    embeddingFunction: this.embeddingFunction,
                });
                console.log(`Successfully created collection: ${name}`);
                return collection;
            } catch (createError) {
                if (createError instanceof Error && createError.message.includes('already exists')) {
                    console.log(`Collection ${name} was created by another process, getting it now.`);
                    try {
                        const collection = await this.client.getCollection({
                            name,
                            embeddingFunction: this.embeddingFunction,
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
