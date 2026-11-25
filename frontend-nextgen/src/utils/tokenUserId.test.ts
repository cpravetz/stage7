import { describe, expect, it } from 'vitest';
import { tokenUserId } from './tokenUserId';

// Header.Payload("sub":"user-admin").Signature — payload is base64url.
const token = `eyJhbGciOiJIUzI1NiJ9.${btoa('{"sub":"user-admin","type":"user"}')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')}.sig`;

describe('tokenUserId', () => {
  it('reads the sub claim from a JWT payload', () => {
    expect(tokenUserId(token)).toBe('user-admin');
  });

  it('returns undefined for absent, malformed, or sub-less tokens', () => {
    expect(tokenUserId(null)).toBeUndefined();
    expect(tokenUserId(undefined)).toBeUndefined();
    expect(tokenUserId('not-a-jwt')).toBeUndefined();
    expect(tokenUserId(`a.${btoa('{"type":"user"}')}.c`)).toBeUndefined();
  });
});
