import { stripTrailingSlashes } from '../src/utils/stripTrailingSlashes';

describe('stripTrailingSlashes', () => {
  it('strips one or many trailing slashes but preserves interior ones', () => {
    expect(stripTrailingSlashes('auth/login/')).toBe('auth/login');
    expect(stripTrailingSlashes('auth/login///')).toBe('auth/login');
    expect(stripTrailingSlashes('/auth/login')).toBe('/auth/login');
    expect(stripTrailingSlashes('a//b/')).toBe('a//b');
  });

  it('leaves strings without trailing slashes untouched', () => {
    expect(stripTrailingSlashes('auth/login')).toBe('auth/login');
    expect(stripTrailingSlashes('/')).toBe('');
    expect(stripTrailingSlashes('///')).toBe('');
    expect(stripTrailingSlashes('')).toBe('');
  });
});
