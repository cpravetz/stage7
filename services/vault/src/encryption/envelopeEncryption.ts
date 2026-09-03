import crypto from 'crypto';
import { EncryptedSecret, SecretMetadata } from '../types/vault';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

export class EnvelopeEncryption {
  private masterKey: Buffer;

  constructor(masterKey?: string) {
    const keySource = masterKey || process.env.MASTER_KEY || 'default-master-key-change-me';
    this.masterKey = crypto.scryptSync(keySource, 'salt', KEY_LENGTH);
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, ciphertext]);

    return {
      ciphertext: combined.toString('base64'),
      keyId: 'master-key',
      version: 1,
      createdAt: Date.now(),
    };
  }

  decrypt(encrypted: EncryptedSecret): string {
    const combined = Buffer.from(encrypted.ciphertext, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  rotateKey(newKey: string): void {
    this.masterKey = crypto.scryptSync(newKey, 'salt', KEY_LENGTH);
  }
}
