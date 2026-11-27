import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { TokenPayload, AuthResult, User, ServiceAccount } from '../types';

const DEFAULT_JWT_SECRET = 'dev-secret-key';

// Why: the fallback warning describes a deployment misconfiguration, not a
// per-request event — emit it once per process instead of once per token.
let warnedAboutDefaultSecret = false;

export class TokenService {
  private jwtSecret: string;

  constructor(secret?: string) {
    if (secret) {
      this.jwtSecret = secret;
      return;
    }
    this.jwtSecret = DEFAULT_JWT_SECRET;
    if (!warnedAboutDefaultSecret) {
      warnedAboutDefaultSecret = true;
      console.warn(
        '[auth] JWT_SECRET is not set: using the built-in development default. ' +
        'JWTs are signed with a well-known key and are not deployment-secured — ' +
        'set JWT_SECRET before deploying.'
      );
    }
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
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
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
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
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
