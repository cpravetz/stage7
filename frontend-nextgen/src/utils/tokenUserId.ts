/**
 * Extracts the user id (`sub`) from a JWT without verifying it. Client-side
 * attribution only — the gateway verifies the token; this just survives a
 * page reload, where the auth store has the token but not the user object.
 * Returns undefined for absent or malformed tokens.
 */
export function tokenUserId(token: string | null | undefined): string | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload?.sub === 'string' && payload.sub ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
