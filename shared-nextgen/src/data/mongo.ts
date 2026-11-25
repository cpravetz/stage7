import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { logger } from '../utils/logger';

/** Connection defaults shared by every service store. */
const DEFAULT_MONGO_URI = 'mongodb://mongo:27017';
const DEFAULT_MONGO_DB = 'stage7';

/**
 * Hard cap on the connection wait. Bounded so an unreachable Mongo fails in
 * seconds rather than the driver's 30s default per attempt. Callers retry and
 * then refuse to start.
 */
const DEFAULT_CONNECT_TIMEOUT_MS = 3000;

export interface ConnectMongoOptions {
  /** Defaults to MONGO_URI, then mongodb://mongo:27017. */
  uri?: string;
  /** Defaults to MONGO_DB, then 'stage7'. */
  dbName?: string;
  /** Passed straight to the MongoClient constructor. */
  clientOptions?: MongoClientOptions;
  /**
   * Max ms to wait for connect() before rejecting with 'MongoDB connection
   * timeout'. null relies on the driver's own serverSelectionTimeoutMS
   * instead. Default 3000.
   */
  connectTimeoutMs?: number | null;
}

export interface MongoConnection {
  client: MongoClient;
  db: Db;
}

/** Resolved connection settings, for logging. */
export interface ResolvedMongoSettings {
  uri: string;
  dbName: string;
}

export function resolveMongoSettings(options: ConnectMongoOptions = {}): ResolvedMongoSettings {
  return {
    uri: (options.uri ?? process.env.MONGO_URI) || DEFAULT_MONGO_URI,
    dbName: (options.dbName ?? process.env.MONGO_DB) || DEFAULT_MONGO_DB,
  };
}

/**
 * Opens a Mongo connection with the settings every service store shares.
 * Env vars are read at call time, not module load, so test setup that sets
 * MONGO_URI after import still takes effect.
 */
export async function connectMongo(options: ConnectMongoOptions = {}): Promise<MongoConnection> {
  const { uri, dbName } = resolveMongoSettings(options);
  const client = new MongoClient(uri, options.clientOptions);
  const connectPromise = client.connect();

  if (options.connectTimeoutMs === null) {
    await connectPromise;
  } else {
    const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MongoDB connection timeout')), timeoutMs)
    );
    await Promise.race([connectPromise, timeoutPromise]);
  }

  return { client, db: client.db(dbName) };
}

/**
 * Connection lifecycle shared by the per-service Mongo stores: lazy connect
 * with a bounded wait, isConnected, disconnect, and failure logging. Stores
 * subclass it and wire their own collections and indexes in `initialize`.
 */
export abstract class MongoBaseStore {
  protected client: MongoClient | null = null;
  protected db: Db | null = null;
  /** Resolved settings of the live connection, for logging. */
  protected settings: ResolvedMongoSettings | null = null;
  private connected = false;

  /** Log label, e.g. 'MongoUserStore'. */
  protected abstract readonly storeName: string;

  async connect(): Promise<void> {
    if (this.connected) return;
    try {
      const { client, db } = await connectMongo(this.connectOptions());
      this.client = client;
      this.db = db;
      this.settings = resolveMongoSettings(this.connectOptions());
      await this.initialize();
      this.connected = true;
    } catch (err) {
      this.client = null;
      this.db = null;
      this.settings = null;
      this.onConnectFailed();
      logger.error({ err }, `${this.storeName} connection failed`);
      throw err;
    }
  }

  /** Collection wiring and index creation; runs on every fresh connect. */
  protected abstract initialize(): Promise<void>;

  /** Per-store connect tuning. Default: the 3s bounded wait. */
  protected connectOptions(): ConnectMongoOptions {
    return {};
  }

  /**
   * Clears subclass state after a failed connect, so lazy per-store guards
   * (e.g. `if (!this.collection) await this.connect()`) retry next call.
   */
  protected onConnectFailed(): void {
    // No subclass state by default.
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.settings = null;
    }
    this.connected = false;
  }
}

/**
 * Removes the Mongo `_id` field from a fetched document and returns it as the
 * application-level type. Shallow copy, matching direct destructuring.
 */
export function stripMongoId<T>(doc: unknown): T {
  if (doc === null || typeof doc !== 'object') return doc as T;
  const copy = { ...(doc as Record<string, unknown>) };
  delete copy._id;
  return copy as T;
}
