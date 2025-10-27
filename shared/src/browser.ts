/**
 * This file exports a browser-compatible subset of the shared package.
 * It excludes any Node.js-specific modules like crypto.
 */

// Re-export browser-compatible types and utilities
export * from './BaseEntity';
export * from './interfaces/IBaseEntity';
export * from './AuthenticatedApiClient';
export * from './types/Message';
export * from './types/Plugin';
export * from './types/PluginManifest';
export * from './types/PluginCapabilities';
export * from './types/PluginRepository';
export * from './types/Mission';
export * from './types/Status';
export * from './types/Agent';
export * from './types/Statistics';
export * from './Serializer';
export * from './versioning/semver';
export * from './versioning/compatibilityChecker';
export * from './types/DefinitionManifest';
export * from './types/OpenAPITool';
export * from './types/MCPTool';

// Note: We exclude the following Node.js-specific modules:
// - security/pluginSigning (uses crypto)
// - security/isolatedPluginSandbox (uses isolated-vm)
// - security/pluginSandbox (uses vm2)
// - messaging/queueClient (uses amqplib)
// - discovery/serviceDiscovery (uses Node.js-specific APIs)
