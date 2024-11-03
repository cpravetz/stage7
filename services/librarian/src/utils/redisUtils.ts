import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export async function storeInRedis(key: string, value: any) {
    return await redisClient.set(key, JSON.stringify(value));
}

export async function loadFromRedis(key: string): Promise<any> {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
}

export async function deleteFromRedis(key: string) {
    return await redisClient.del(key);
}