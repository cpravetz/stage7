import { Collection } from 'mongodb';
import { MongoBaseStore, stripMongoId, logger } from '@stage7-nextgen/shared';
import { StoredSecret, SecretMetadata } from '../services/SecretStore';

export class MongoSecretStore extends MongoBaseStore {
  protected readonly storeName = 'MongoSecretStore';
  private secrets: Collection<StoredSecret & { _id?: string }> | null = null;

  protected async initialize(): Promise<void> {
    this.secrets = this.db!.collection<StoredSecret & { _id?: string }>('secrets');
    await this.secrets.createIndex({ id: 1 }, { unique: true });
    await this.secrets.createIndex({ tenantId: 1 });
    try {
      await this.secrets.createIndex({ tenantId: 1, name: 1 }, { unique: true });
    } catch (err: any) {
      // Existing duplicate legacy data can block unique index creation; keep running and rely on ensureSecret reconciliation.
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'MongoSecretStore could not enforce unique tenantId+name index');
    }
    logger.info('MongoSecretStore connected');
  }

  protected override onConnectFailed(): void {
    this.secrets = null;
  }

  async createSecret(secret: StoredSecret): Promise<StoredSecret> {
    if (!this.secrets) await this.connect();
    const doc = { ...secret, _id: secret.id } as any;
    try {
      await this.secrets!.insertOne(doc);
      return secret;
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await this.getSecretByName(secret.name, secret.tenantId);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async ensureSecret(secret: StoredSecret): Promise<{ secret: StoredSecret; existed: boolean }> {
    if (!this.secrets) await this.connect();
    const existing = await this.getSecretByName(secret.name, secret.tenantId);
    if (existing) {
      return { secret: existing, existed: true };
    }
    try {
      const doc = { ...secret, _id: secret.id } as any;
      await this.secrets!.insertOne(doc);
      return { secret, existed: false };
    } catch (err: any) {
      if (err?.code === 11000) {
        const reconciled = await this.getSecretByName(secret.name, secret.tenantId);
        if (reconciled) return { secret: reconciled, existed: true };
      }
      throw err;
    }
  }

  async updateSecret(secret: StoredSecret): Promise<boolean> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.updateOne(
      { id: secret.id } as any,
      { $set: { encrypted: secret.encrypted, updatedAt: secret.updatedAt } },
    );
    return result.matchedCount > 0;
  }

  async getSecret(id: string): Promise<StoredSecret | undefined> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.findOne({ id } as any);
    return result ? stripMongoId<StoredSecret>(result) : undefined;
  }

  async listSecrets(tenantId?: string): Promise<SecretMetadata[]> {
    if (!this.secrets) await this.connect();
    if (!tenantId) return [];
    const results = await this.secrets!.find({ tenantId }).toArray();
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

  async getSecretByName(name: string, tenantId?: string): Promise<StoredSecret | undefined> {
    if (!this.secrets) await this.connect();
    const query: Record<string, string> = { name };
    if (tenantId) query.tenantId = tenantId;
    const result = await this.secrets!.findOne(query as any);
    return result ? stripMongoId<StoredSecret>(result) : undefined;
  }

  async getSecretForTenant(id: string, tenantId: string): Promise<StoredSecret | undefined> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.findOne({ id, tenantId } as any);
    return result ? stripMongoId<StoredSecret>(result) : undefined;
  }

  async deleteSecretForTenant(id: string, tenantId: string): Promise<boolean> {
    if (!this.secrets) await this.connect();
    const result = await this.secrets!.deleteOne({ id, tenantId } as any);
    return result.deletedCount > 0;
  }
}
