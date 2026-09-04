import { MongoClient, Db, Collection } from 'mongodb';
import { StoredSecret, SecretMetadata } from '../services/SecretStore';
import { logger } from '@stage7-nextgen/shared';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017';
const MONGO_DB = process.env.MONGO_DB || 'stage7';

export class MongoSecretStore {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private secrets: Collection<StoredSecret & { _id?: string }> | null = null;
  private connected = false;

  async connect(): Promise<void> {
    if (this.secrets) return;
    try {
      this.client = new MongoClient(MONGO_URI);
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB connection timeout')), 3000)
      );
      await Promise.race([connectPromise, timeoutPromise]);
      this.db = this.client.db(MONGO_DB);
      this.secrets = this.db.collection<StoredSecret & { _id?: string }>('secrets');
      await this.secrets.createIndex({ id: 1 }, { unique: true });
      await this.secrets.createIndex({ tenantId: 1 });
      this.connected = true;
      logger.info('MongoSecretStore connected');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'MongoSecretStore connection failed');
      this.client = null;
      this.db = null;
      this.secrets = null;
      throw err;
    }
  }

  async createSecret(secret: StoredSecret): Promise<StoredSecret> {
    if (!this.secrets) await this.connect();
    const doc = { ...secret, _id: secret.id } as any;
    await this.secrets!.replaceOne({ id: secret.id } as any, doc, { upsert: true });
    return secret;
  }

  async getSecret(id: string): Promise<StoredSecret | undefined> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.findOne({ id } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest as StoredSecret;
  }

  async listSecrets(tenantId?: string): Promise<SecretMetadata[]> {
    if (!this.secrets) await this.connect();
    const query: Record<string, string> = tenantId ? { tenantId } : {};
    const results = await this.secrets!.find(query).toArray();
    return results.map((r: any) => {
      const { _id, encrypted, ...rest } = r;
      return rest as SecretMetadata;
    });
  }

  async deleteSecret(id: string): Promise<boolean> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
