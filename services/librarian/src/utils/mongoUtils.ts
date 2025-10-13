import { MongoClient, Db, Collection } from 'mongodb';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';

dotenv.config();

let db: Db;
let connected: boolean = false;

export async function connectMongo() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017';
        const dbName = process.env.MONGO_DB || 'librarianDB';

        console.log(`Connecting to MongoDB at ${mongoUri}, database: ${dbName}`);

        const client = new MongoClient(mongoUri);
        await client.connect();

        db = client.db(dbName);
        console.log(`Successfully connected to MongoDB database: ${dbName}`);

        // Create collections if they don't exist
        const collections = ['agents', 'deliverables', 'step-outputs', 'mcsdata', 'data_versions', 'knowledge_domains', 'agent_specializations'];
        for (const collection of collections) {
            const exists = await db.listCollections({ name: collection }).hasNext();
            if (!exists) {
                console.log(`Creating collection: ${collection}`);
                await db.createCollection(collection);
            }
        }

        connected = true;
        return db;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error instanceof Error ? error.message : error);
        throw error;
    }
}

export async function storeInMongo(collectionName: string, document: any) {
    try {
        if (!connected) {
            await connectMongo();
        }

        console.log(`Storing document in collection ${collectionName} with ID ${document._id}`);

        const collection: Collection = db.collection(collectionName);
        const sanitizedDocument: Record<string, any> = {};

        for (const key in document) {
            if (key !== '_id') {  // Exclude _id from the update
                sanitizedDocument[key] = document[key];
            }
        }

        if (document._id) {
            const filter = { _id: document._id };
            const result = await collection.updateOne(
                filter,
                { $set: sanitizedDocument },
                { upsert: true }
            );

            console.log(`Document stored successfully in collection ${collectionName} with ID ${document._id}`);
            return result.upsertedId;
        }
        const result = await collection.insertOne(document);
        console.log(`Document stored successfully in collection ${collectionName} with ID ${result.insertedId}`);
        return result.insertedId;
    } catch (error) {
        analyzeError(error as Error);
        console.error(`Error storing document in collection ${collectionName}:`, error instanceof Error ? error.message : error);
        throw error; // Re-throw the error so the caller can handle it
    }
}

export async function loadFromMongo(collectionName: string, query: any, options?: any): Promise<any> {
    try {
        if (!connected) {
            await connectMongo();
        }

        console.log(`Loading document from collection ${collectionName} with query:`, JSON.stringify(query));

        const collection: Collection = db.collection(collectionName);
        const result = await collection.findOne(query, options);

        if (result) {
            console.log(`Document found in collection ${collectionName} with ID ${result._id}`);
            return result;
        } else {
            console.log(`No document found in collection ${collectionName} matching query:`, JSON.stringify(query));
            return null;
        }
    } catch (error) {
        analyzeError(error as Error);
        console.error(`Error loading document from collection ${collectionName}:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

export async function loadManyFromMongo(collectionName: string, query: any, options?: any): Promise<any> {
    try {
        if (!connected) {
            await connectMongo();
        }

        console.log(`Loading multiple documents from collection ${collectionName} with query:`, JSON.stringify(query));

        const collection: Collection = db.collection(collectionName);

        // Special case for _id queries - don't use $eq operator
        if (query && query._id) {
            console.log(`Using direct _id query for ${query._id}`);
            // Use the query directly without adding $eq
            const cursor = collection.find(query, options);
            const results = await cursor.toArray();
            console.log(`Found ${results.length} documents in collection ${collectionName} with _id query`);
            return results;
        }

        // For other queries, use the sanitized approach
        const sanitizedQuery: Record<string, any> = {};

        // Only sanitize if query is not empty
        if (Object.keys(query).length > 0) {
            for (const key in query) {
                sanitizedQuery[key] = { $eq: query[key] };
            }
        }

        const cursor = collection.find(Object.keys(query).length > 0 ? sanitizedQuery : {}, options);
        const results = await cursor.toArray();

        console.log(`Found ${results.length} documents in collection ${collectionName}`);
        return results;
    } catch (error) {
        analyzeError(error as Error);
        console.error(`Error loading documents from collection ${collectionName}:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

export async function deleteManyFromMongo(collectionName: string, query: any) {
    if (!connected) {
        await connectMongo();
    }
    const collection: Collection = db.collection(collectionName);
    await collection.deleteMany(query);
}

export async function deleteFromMongo(collectionName: string, query: any) {
    if (!connected) {
        await connectMongo();
    }
    const collection: Collection = db.collection(collectionName);
    await collection.deleteOne(query);
}

export async function updateInMongo(collectionName: string, query: any, update: any) {
    if (!connected) {
        await connectMongo();
    }
    const collection: Collection = db.collection(collectionName);
    await collection.updateOne(query, update);
}

export async function updateManyInMongo(collectionName: string, query: any, update: any) {
    if (!connected) {
        await connectMongo();
    }
    const collection: Collection = db.collection(collectionName);
    await collection.updateMany(query, update);
}

export async function aggregateInMongo(collectionName: string, pipeline: any) {
    if (!connected) {
        await connectMongo();
    }
    const collection: Collection = db.collection(collectionName);
    return await collection.aggregate(pipeline).toArray();
}

connectMongo();