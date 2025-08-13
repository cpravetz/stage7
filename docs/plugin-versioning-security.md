# Plugin Versioning and Security

This document describes the implementation of plugin versioning, compatibility checking, and security enhancements in the Stage7 system.

## Plugin Versioning

### Overview

Plugin versioning allows for the safe evolution of plugins over time. The system now uses semantic versioning (SemVer) to track plugin versions and ensure compatibility between versions.

### Semantic Versioning

Plugins now follow the semantic versioning format: `MAJOR.MINOR.PATCH`

- **MAJOR**: Incremented for incompatible API changes
- **MINOR**: Incremented for backward-compatible functionality additions
- **PATCH**: Incremented for backward-compatible bug fixes

### Version Compatibility

The system checks for version compatibility when updating plugins:

1. **Version Comparison**: Ensures that new versions are actually newer than existing versions
2. **Compatibility Checking**: Verifies that new versions are compatible with existing versions
3. **Breaking Changes**: Identifies potential breaking changes between versions

### Compatibility Rules

The following rules are used to determine compatibility:

1. **Major Version**: Different major versions are considered incompatible
2. **Input Parameters**: Removing or changing the type of input parameters is a breaking change
3. **Output Parameters**: Removing or changing the type of output parameters is a breaking change
4. **Required Parameters**: Making an optional parameter required is a breaking change
5. **Security Permissions**: Adding new permissions is flagged as a potential issue

## Plugin Security

### Overview

Plugin security has been enhanced to provide better protection against malicious plugins. The system now includes:

1. **Permission System**: Fine-grained control over what plugins can access
2. **Sandbox Environment**: Isolated execution environment for plugins
3. **Code Signing**: Verification of plugin authenticity
4. **Security Validation**: Checks for potential security issues

### Permission System

Plugins now declare the permissions they need to function:

```typescript
security: {
  permissions: ['fs.read', 'net.fetch'],
  // ...
}
```

Available permissions include:

- **File System**: `fs.read`, `fs.write`, `fs.delete`
- **Network**: `net.fetch`, `net.listen`
- **Process**: `process.exec`, `process.env`
- **Environment**: `env.read`, `env.write`
- **Database**: `db.read`, `db.write`
- **System**: `system.info`, `system.eval`

Permissions are categorized by their danger level, with some requiring explicit user approval.

### Sandbox Environment

JavaScript plugins are now executed in a sandbox environment using the `vm2` library:

1. **Resource Limits**: Memory and CPU usage limits
2. **Module Access Control**: Only allowed modules can be imported
3. **API Restrictions**: Only allowed APIs can be used
4. **Timeout Protection**: Plugins are terminated if they run too long

### Code Signing

Plugins are now signed to verify their authenticity:

1. **Signature Generation**: A hash of the plugin's critical properties
2. **Signature Verification**: Checking that the plugin hasn't been tampered with
3. **Trust Certificates**: Optional publisher verification

### Security Validation

The system performs several security checks before executing plugins:

1. **Permission Validation**: Ensures all requested permissions are valid
2. **Dangerous Permission Detection**: Flags plugins with dangerous permissions
3. **Sandbox Configuration**: Validates sandbox settings
4. **Signature Verification**: Ensures the plugin hasn't been tampered with

## Implementation

### Versioning Implementation

The versioning system is implemented in the following files:

- `shared/src/versioning/semver.ts`: Semantic versioning utilities
- `shared/src/versioning/compatibilityChecker.ts`: Version compatibility checking

### Security Implementation

The security system is implemented in the following files:

- `shared/src/security/pluginPermissions.ts`: Permission system
- `shared/src/security/pluginSandbox.ts`: Sandbox environment
- `shared/src/security/pluginSigning.ts`: Code signing

### Integration

These features are integrated into the CapabilitiesManager:

1. **Plugin Registration**: Version compatibility and security checks during registration
2. **Plugin Execution**: Sandbox execution and permission enforcement
3. **Plugin Updates**: Compatibility checking between versions

## Usage

### Creating a Plugin

When creating a plugin, specify the version and security settings:

```typescript
const plugin: PluginDefinition = {
  // ...
  version: '1.0.0',
  security: {
    permissions: ['fs.read', 'net.fetch'],
    sandboxOptions: {
      allowEval: false,
      timeout: 5000,
      memory: 128 * 1024 * 1024,
      allowedModules: ['fs', 'path', 'http', 'https'],
      allowedAPIs: ['fetch', 'console']
    },
    trust: {
      publisher: 'system-generated'
    }
  }
};
```

### Updating a Plugin

When updating a plugin:

1. Increment the version number according to semantic versioning rules
2. Ensure backward compatibility or increment the major version
3. Only request the permissions you need

### Executing a Plugin

The system automatically:

1. Verifies the plugin signature
2. Validates the plugin permissions
3. Executes the plugin in a sandbox environment
4. Enforces resource limits and timeouts

## Future Enhancements

1. **Digital Signatures**: Implement proper asymmetric cryptography for signing
2. **Plugin Marketplace**: Add version management to the plugin marketplace
3. **Dependency Management**: Track and manage plugin dependencies
4. **User Approval**: Interactive approval for dangerous permissions
5. **Audit Logging**: Log all plugin executions for security auditing
