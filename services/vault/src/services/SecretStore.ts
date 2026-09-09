import { randomUUID } from 'crypto';
import { EncryptedSecret } from '../types/vault';
import { EnvelopeEncryption } from '../encryption/envelopeEncryption';
import { MongoSecretStore } from '../data/mongoStore';
import { logger } from '@stage7-nextgen/shared';

export interface StoredSecret {
  id: string;
  name: string;
  encrypted: EncryptedSecret;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretMetadata {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export class SecretStore {
  private secrets: Map<string, StoredSecret> = new Map();
  private encryption: EnvelopeEncryption;
  private mongoStore: MongoSecretStore | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(encryption: EnvelopeEncryption) {
    this.encryption = encryption;
    if (process.env.MONGO_URI) {
      this.mongoStore = new MongoSecretStore();
    }
  }

  private async ensureMongo(): Promise<void> {
    if (this.mongoStore?.isConnected()) return;
    if (this.connectPromise) return this.connectPromise;
    if (!this.mongoStore) return;

    this.connectPromise = (async () => {
      try {
        await this.mongoStore!.connect();
      } catch {
        this.mongoStore = null;
      }
    })();

    return this.connectPromise;
  }

  createSecret(name: string, plaintext: string, tenantId: string): SecretMetadata {
    const now = new Date().toISOString();
    const encrypted = this.encryption.encrypt(plaintext);
    const secret: StoredSecret = {
      id: randomUUID(),
      name,
      encrypted,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };

    if (this.mongoStore) {
      this.createSecretInMongo(secret).catch(() => {
        this.secrets.set(secret.id, secret);
      });
    } else {
      this.secrets.set(secret.id, secret);
    }

    return this.toMetadata(secret);
  }

  private async createSecretInMongo(secret: StoredSecret): Promise<void> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        await this.mongoStore.createSecret(secret);
      } catch {
        this.secrets.set(secret.id, secret);
      }
    } else {
      this.secrets.set(secret.id, secret);
    }
  }

  async getSecret(id: string): Promise<StoredSecret | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        const result = await this.mongoStore.getSecret(id);
        if (result) return result;
      } catch {
        // fallback
      }
    }
    return this.secrets.get(id);
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        const tenantId = this.getTenantIdFromContext();
        return await this.mongoStore.listSecrets(tenantId);
      } catch {
        // fallback
      }
    }
    return Array.from(this.secrets.values()).map((s) => this.toMetadata(s));
  }

  async deleteSecret(id: string): Promise<boolean> {
    await this.ensureMongo();
    if (this.mongoStore) {
      try {
        const deleted = await this.mongoStore.deleteSecret(id);
        if (deleted) {
          this.secrets.delete(id);
          return true;
        }
      } catch {
        // fallback
      }
    }
    const existed = this.secrets.delete(id);
    return existed;
  }

  async decryptSecret(id: string): Promise<string | undefined> {
    const secret = await this.getSecret(id);
    if (!secret) return undefined;
    return this.encryption.decrypt(secret.encrypted);
  }

  private toMetadata(secret: StoredSecret): SecretMetadata {
    return {
      id: secret.id,
      name: secret.name,
      tenantId: secret.tenantId,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }

  private getTenantIdFromContext(): string | undefined {
    return undefined;
  }
}
