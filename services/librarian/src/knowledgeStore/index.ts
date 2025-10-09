
import { ChromaClient, Collection, Metadata, IEmbeddingFunction } from 'chromadb';

// Simple embedding function placeholder for now.
// In a real implementation, this would use a proper model like sentence-transformers.
class SimpleEmbeddingFunction implements IEmbeddingFunction {
    public async generate(texts: string[]): Promise<number[][]> {
        // This is a very naive embedding function for demonstration purposes.
        // It creates a sparse vector where the value at the index of the first letter's
        // position in the alphabet is 1.
        return texts.map(text => {
            const embedding = new Array(26).fill(0);
            if (text && text.length > 0) {
                const charCode = text.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
                if (charCode >= 0 && charCode < 26) {
                    embedding[charCode] = 1;
                }
            }
            return embedding;
        });
    }
}

class KnowledgeStore {
    private client: ChromaClient;
    private embeddingFunction: IEmbeddingFunction;

    constructor() {
        this.client = new ChromaClient({ path: 'http://chromadb:8000' });
        this.embeddingFunction = new SimpleEmbeddingFunction();
        console.log('KnowledgeStore initialized, connecting to ChromaDB at http://chromadb:8000');
    }

    private async getOrCreateCollection(name: string): Promise<Collection> {
        try {
            const collection = await this.client.getCollection({
                name,
                embeddingFunction: this.embeddingFunction,
            });
            console.log(`Found existing collection: ${name}`);
            return collection;
        } catch (error) {
            console.log(`Collection ${name} not found, creating new one.`);
            try {
                const collection = await this.client.createCollection({
                    name,
                    embeddingFunction: this.embeddingFunction,
                });
                return collection;
            } catch (createError) {
                console.error(`Failed to create collection ${name}:`, createError);
                throw new Error(`ChromaDB connection failed: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
            }
        }
    }

    public async save(collectionName: string, content: string, metadata: Metadata = {}): Promise<void> {
        try {
            const collection = await this.getOrCreateCollection(collectionName);
            const id = new Date().toISOString(); // Simple unique ID for the document

            await collection.add({
                ids: [id],
                documents: [content],
                metadatas: [metadata],
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
            }

            console.log(`Queried collection ${collectionName} with "${queryText}", found ${results.ids[0].length} results.`);
            // Restructure the results to be more intuitive
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
