import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { TokenPayload, AuthResult, User, ServiceAccount } from '../types';

export class TokenService {
  private jwtSecret: string;

  constructor(secret?: string) {
    this.jwtSecret = secret || 'dev-secret-key';
  }

  generateUserToken(user: User): string {
    const payload: TokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      orgId: user.orgId,
      roles: user.roles,
      permissions: user.permissions,
      type: 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  generateServiceToken(service: ServiceAccount): string {
    const payload: TokenPayload = {
      sub: service.id,
      tenantId: service.tenantId,
      orgId: service.tenantId,
      roles: [],
      permissions: service.scopes,
      type: 'service',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  hashApiKey(apiKey: string): string {
    return bcrypt.hashSync(apiKey, 10);
  }

  compareApiKey(apiKey: string, hash: string): boolean {
    return bcrypt.compareSync(apiKey, hash);
  }
}
