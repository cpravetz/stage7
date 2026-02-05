# Migration from VM2 to Isolated-VM

This document describes the migration from VM2 to Isolated-VM for plugin sandboxing in the Stage7 platform.

## 1. Overview

VM2 has known security vulnerabilities that can allow malicious code to escape the sandbox. Isolated-VM provides a more secure alternative by running code in a separate V8 isolate, which provides stronger isolation guarantees.

## 2. Implementation Changes

### 2.1 Dependencies

- Removed the `vm2` dependency
- Added the `isolated-vm` dependency

### 2.2 Sandbox Implementation

Created a new implementation of the plugin sandbox using isolated-vm:

- **File**: `shared/src/security/isolatedPluginSandbox.ts`
- **Function**: `executePluginInSandbox`

The new implementation:

1. Creates a new V8 isolate with memory limits
2. Creates a context within the isolate
3. Sets up the plugin environment with safe APIs
4. Executes the plugin code in the isolate
5. Returns the results

### 2.3 Type Definitions

Created type definitions for isolated-vm:

- **File**: `shared/src/types/isolated-vm.d.ts`

### 2.4 Integration

Updated the import statements in services that use the plugin sandbox:

- **File**: `services/capabilitiesmanager/src/CapabilitiesManager.ts`
- **Change**: Updated import to use the new isolated-vm implementation

## 3. Security Improvements

### 3.1 Memory Limits

Isolated-VM allows setting memory limits for the isolate, which prevents memory exhaustion attacks:

```typescript
const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128 MB limit
```

### 3.2 Proper Context Isolation

Isolated-VM provides proper context isolation by using V8 isolates. This means that code running in the isolate cannot access the host's global object or any other resources unless explicitly provided:

```typescript
// Set up the plugin environment using context.eval
const inputsJson = JSON.stringify(inputs);
await context.eval(`global.inputs = ${inputsJson}`);

// Set up console logging with controlled access
await context.eval(`
  global.console = {
    log: function(...args) {
      console.log('[Plugin]', ...args);
    },
    // ... other console methods
  };
`);
```

### 3.3 Stronger Isolation

Isolated-VM provides stronger isolation guarantees:

- Code runs in a separate V8 isolate
- No shared memory between the host and the isolate
- No access to Node.js APIs by default
- No access to the global object of the host

### 3.4 Controlled API Access

The new implementation provides controlled access to APIs:

- Only explicitly allowed APIs are available to plugins
- APIs are provided with proper security wrappers
- No direct access to Node.js modules

## 4. Performance Considerations

### 4.1 Startup Time

Isolated-VM has a slightly higher startup time compared to VM2 due to the creation of a new V8 isolate.

### 4.2 Memory Usage

Isolated-VM uses more memory than VM2 because it creates a separate V8 isolate for each plugin execution.

### 4.3 Execution Speed

Once the isolate is created, the execution speed is comparable to VM2.

## 5. Implementation Challenges and Solutions

### 5.1 TypeScript Integration

One of the challenges in implementing isolated-vm was integrating it with TypeScript. Since isolated-vm is a native module, it doesn't come with TypeScript definitions. We created custom type definitions to ensure type safety.

### 5.2 Context Manipulation

Unlike vm2, isolated-vm doesn't allow direct manipulation of the context. Instead, we had to use the `context.eval()` method to execute code within the isolate:

```typescript
// Set up console logging
const pluginId = plugin.id || 'unknown';
await context.eval(`
  global.console = {
    log: function(...args) {
      console.log('[Plugin ${pluginId}]', ...args);
    },
    // ... other console methods
  };
`);
```

### 5.3 Data Transfer

Isolated-VM requires explicit data transfer between the host and the isolate. We used JSON serialization to pass data to the isolate:

```typescript
const inputsJson = JSON.stringify(inputs);
await context.eval(`global.inputs = ${inputsJson}`);
```

## 6. Future Improvements

### 6.1 Caching Isolates

To improve performance, we could implement a pool of pre-created isolates that can be reused for plugin execution.

### 6.2 Snapshots

Isolated-VM supports creating snapshots of isolates, which can be used to quickly create new isolates with pre-loaded code.

### 6.3 Worker Threads

For long-running plugins, we could use worker threads to run the isolates in separate threads, which would prevent blocking the main thread.

### 6.4 More Granular Permissions

We could implement more granular permissions for plugins, allowing them to access only specific APIs or resources.

## 7. Conclusion

The migration from VM2 to Isolated-VM provides significant security improvements for plugin sandboxing in the Stage7 platform. While there are some performance considerations, the security benefits outweigh the costs.
