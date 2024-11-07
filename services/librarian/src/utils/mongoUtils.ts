import { MongoClient, Db, Collection } from 'mongodb';
import dotenv from 'dotenv';
import { analyzeError } from '@cktmcs/errorhandler';

dotenv.config();

let db: Db;

export async function connectMongo() {
    const client = new MongoClient(process.env.MONGO_URI || 'mongodb://mongo:27017');
    await client.connect();
    db = client.db(process.env.MONGO_DB || 'mcsdata');
    console.log(`Connected to MongoDB database: ${process.env.MONGO_DB}`);
    return db;
} 

export async function storeInMongo(collectionName: string, document: any) {
    try {
        const collection: Collection = db.collection(collectionName);
        const filter = { _id: document._id };
        const result = await collection.updateOne(
            filter,
            { $set: document },
            { upsert: true }
        );
        return result;
    } catch (error) { analyzeError(error as Error);
        console.log('StoreInMongo error:', error instanceof Error ? error.message : error);
    }
}

export async function loadFromMongo(collectionName: string, query: any, options?: any): Promise<any> {
    const collection: Collection = db.collection(collectionName);
    return await collection.findOne(query, options);
}

export async function loadManyFromMongo(collectionName: string, query: any, options?: any): Promise<any> {
    const collection: Collection = db.collection(collectionName);
    const cursor = collection.find(query, options);
    return await cursor.toArray();
}

export async function deleteManyFromMongo(collectionName: string, query: any) {
    const collection: Collection = db.collection(collectionName);
    await collection.deleteMany(query);
}

export async function deleteFromMongo(collectionName: string, query: any) {
    const collection: Collection = db.collection(collectionName);
    await collection.deleteOne(query);
}

export async function updateInMongo(collectionName: string, query: any, update: any) {
    const collection: Collection = db.collection(collectionName);
    await collection.updateOne(query, update);
}

export async function updateManyInMongo(collectionName: string, query: any, update: any) {
    const collection: Collection = db.collection(collectionName);
    await collection.updateMany(query, update);
}

export async function aggregateInMongo(collectionName: string, pipeline: any) {
    const collection: Collection = db.collection(collectionName);
    return await collection.aggregate(pipeline).toArray();
}

connectMongo();