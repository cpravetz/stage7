/**
 * Jest setup for integration tests.
 *
 * These suites exercise real service code (ArtifactsService, worker-pool,
 * agent-runtime, temporal) whose routes reach MongoStore, which defaults to
 * `mongodb://mongo:27017` — the Docker Compose service name. That name only
 * resolves inside the compose network, so when the suite runs on a host or
 * in CI without compose, every persistence-touching test times out on DNS
 * resolution (`getaddrinfo EAI_AGAIN mongo`).
 *
 * Point Mongo at a locally reachable URI when one is available so the suites
 * can run without compose. Callers may still override MONGO_URI explicitly.
 */
import { MongoClient } from 'mongodb';

const DEFAULT_LOCAL_URI = 'mongodb://localhost:27017';

async function mongoIsReachable(uri: string): Promise<boolean> {
  let client: MongoClient | null = null;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // best-effort cleanup
      }
    }
  }
}

export default async function setup(): Promise<void> {
  if (process.env.MONGO_URI) return;
  if (await mongoIsReachable(DEFAULT_LOCAL_URI)) {
    process.env.MONGO_URI = DEFAULT_LOCAL_URI;
  }
}