/**
 * Default tenant for paths that do not carry an explicit tenant id.
 *
 * Entity-memory slots are keyed by sha256(tenantId\0assistantId\0entityId), so
 * every writer and reader that falls back to a default must fall back to the
 * SAME default — extraction under one tenant and execution under another would
 * strand the memories in a slot nobody reads. Import this constant rather than
 * repeating a literal.
 */
export const DEFAULT_TENANT_ID = 'system';
