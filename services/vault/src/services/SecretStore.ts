import { randomUUID } from 'crypto';
import { EncryptedSecret } from '../types/vault';
import { EnvelopeEncryption } from '../encryption/envelopeEncryption';

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

  constructor(encryption: EnvelopeEncryption) {
    this.encryption = encryption;
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
    this.secrets.set(secret.id, secret);
    return this.toMetadata(secret);
  }

  getSecret(id: string): StoredSecret | undefined {
    return this.secrets.get(id);
  }

  listSecrets(): SecretMetadata[] {
    return Array.from(this.secrets.values()).map((s) => this.toMetadata(s));
  }

  deleteSecret(id: string): boolean {
    return this.secrets.delete(id);
  }

  decryptSecret(id: string): string | undefined {
    const secret = this.secrets.get(id);
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
}
