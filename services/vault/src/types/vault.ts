export interface EncryptedSecret {
  ciphertext: string;
  keyId: string;
  version: number;
  createdAt: number;
}

export interface SecretMetadata {
  keyId: string;
  version: number;
  createdAt: number;
  expiresAt?: number;
}
