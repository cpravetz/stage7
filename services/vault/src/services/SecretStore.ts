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
      } catch (error) {
        this.connectPromise = null;
        throw error;
      }
    })();

    return this.connectPromise;
  }

  async createSecret(name: string, plaintext: string, tenantId: string): Promise<SecretMetadata> {
    const secret = await this.createSecretRecord(name, plaintext, tenantId);
    await this.ensureMongo();
    if (this.mongoStore) {
      const persisted = await this.mongoStore.createSecret(secret);
      return this.toMetadata(persisted);
    }
    const existing = this.findInMemoryByName(name, tenantId);
    if (existing) return this.toMetadata(existing);
    this.secrets.set(secret.id, secret);
    return this.toMetadata(secret);
  }

  async ensureSecret(name: string, plaintext: string | undefined, tenantId: string): Promise<{ secret: SecretMetadata; existed: boolean; created: boolean }> {
    await this.ensureMongo();
    if (this.mongoStore) {
      const existing = await this.mongoStore.getSecretByName(name, tenantId);
      if (existing) {
        return { secret: this.toMetadata(existing), existed: true, created: false };
      }
      if (typeof plaintext !== 'string') {
        return { secret: undefined as any, existed: false, created: false };
      }
      const record = await this.createSecretRecord(name, plaintext, tenantId);
      const result = await this.mongoStore.ensureSecret(record);
      return { secret: this.toMetadata(result.secret), existed: result.existed, created: !result.existed };
    }

    const existing = this.findInMemoryByName(name, tenantId);
    if (existing) {
      return { secret: this.toMetadata(existing), existed: true, created: false };
    }
    if (typeof plaintext !== 'string') {
      return { secret: undefined as any, existed: false, created: false };
    }
    const record = await this.createSecretRecord(name, plaintext, tenantId);
    this.secrets.set(record.id, record);
    return { secret: this.toMetadata(record), existed: false, created: true };
  }

  private async createSecretRecord(name: string, plaintext: string, tenantId: string): Promise<StoredSecret> {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name,
      encrypted: this.encryption.encrypt(plaintext),
      tenantId,
      createdAt: now,
      updatedAt: now,
    };
  }

  private findInMemoryByName(name: string, tenantId: string): StoredSecret | undefined {
    for (const secret of this.secrets.values()) {
      if (secret.name === name && secret.tenantId === tenantId) return secret;
    }
    return undefined;
  }

  async updateSecret(id: string, plaintext: string): Promise<SecretMetadata | undefined> {
    const existing = await this.getSecret(id);
    if (!existing) return undefined;
    const updated: StoredSecret = {
      ...existing,
      encrypted: this.encryption.encrypt(plaintext),
      updatedAt: new Date().toISOString(),
    };

    await this.ensureMongo();
    if (this.mongoStore) {
      if (!await this.mongoStore.updateSecret(updated)) return undefined;
    } else {
      this.secrets.set(id, updated);
    }
    return this.toMetadata(updated);
  }

  async getSecret(id: string, tenantId?: string): Promise<StoredSecret | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      if (tenantId && (this.mongoStore as any).getSecretForTenant) {
        return (this.mongoStore as any).getSecretForTenant(id, tenantId);
      }
      const secret = await this.mongoStore.getSecret(id);
      if (secret && tenantId && secret.tenantId !== tenantId) return undefined;
      return secret;
    }
    const secret = this.secrets.get(id);
    if (secret && tenantId && secret.tenantId !== tenantId) return undefined;
    return secret;
  }

  async listSecrets(tenantId?: string): Promise<SecretMetadata[]> {
    await this.ensureMongo();
    if (this.mongoStore) {
      return this.mongoStore.listSecrets(tenantId);
    }
    const values = Array.from(this.secrets.values());
    const scoped = tenantId ? values.filter((s) => s.tenantId === tenantId) : values;
    return scoped.map((s) => this.toMetadata(s));
  }

  async deleteSecret(id: string, tenantId?: string): Promise<boolean> {
    await this.ensureMongo();
    if (this.mongoStore) {
      if (tenantId && (this.mongoStore as any).deleteSecretForTenant) {
        const deleted = await (this.mongoStore as any).deleteSecretForTenant(id, tenantId);
        if (deleted) this.secrets.delete(id);
        return deleted;
      }
      if (tenantId) {
        const existing = await this.mongoStore.getSecret(id);
        if (!existing || existing.tenantId !== tenantId) return false;
      }
      const deleted = await this.mongoStore.deleteSecret(id);
      if (deleted) this.secrets.delete(id);
      return deleted;
    }
    const existing = this.secrets.get(id);
    if (!existing) return false;
    if (tenantId && existing.tenantId !== tenantId) return false;
    return this.secrets.delete(id);
  }

  async getSecretByName(name: string, tenantId?: string): Promise<StoredSecret | undefined> {
    await this.ensureMongo();
    if (this.mongoStore) {
      return this.mongoStore.getSecretByName(name, tenantId);
    }
    for (const secret of this.secrets.values()) {
      if (secret.name === name && (!tenantId || secret.tenantId === tenantId)) {
        return secret;
      }
    }
    return undefined;
  }

  async decryptSecret(id: string, tenantId?: string): Promise<string | undefined> {
    const secret = await this.getSecret(id, tenantId);
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

  getTenantIdFromContext(): string | undefined {
    return undefined;
  }
}
