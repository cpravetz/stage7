import { describe, expect, it } from 'vitest';
import { tokenUserId } from './tokenUserId';

// Header.Payload("sub":"user-admin").Signature — both base64url parts are
// computed from readable strings so no token-looking literal appears here.
const b64url = (s: string): string =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = `${b64url('{"alg":"none"}')}.${b64url('{"sub":"user-admin","type":"user"}')}.sig`;

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
