import { 
  PluginDefinition, 
  PluginParameterType,
  compareVersions, 
  areVersionsCompatible,
  checkPluginCompatibility,
  validatePluginPermissions,
  hasDangerousPermissions,
  signPlugin,
  verifyPluginSignature
} from '../shared/src';

/**
 * Example of using the plugin versioning and security features
 */
async function main() {
  // Create a plugin definition
  const pluginV1: PluginDefinition = {
    id: 'example-plugin',
    verb: 'EXAMPLE',
    description: 'Example plugin for demonstration',
    explanation: 'This plugin demonstrates versioning and security features',
    inputDefinitions: [
      {
        name: 'input1',
        required: true,
        type: PluginParameterType.STRING,
        description: 'First input parameter'
      },
      {
        name: 'input2',
        required: false,
        type: PluginParameterType.NUMBER,
        description: 'Second input parameter'
      }
    ],
    outputDefinitions: [
      {
        name: 'output',
        required: true,
        type: PluginParameterType.STRING,
        description: 'Output parameter'
      }
    ],
    language: 'javascript',
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
  
  // Sign the plugin
  const signature = signPlugin(pluginV1);
  pluginV1.security.trust.signature = signature;
  
  console.log('Plugin v1.0.0 created and signed');
  
  // Create a compatible update (v1.1.0)
  const pluginV1_1: PluginDefinition = {
    ...pluginV1,
    version: '1.1.0',
    description: 'Updated example plugin',
    inputDefinitions: [
      ...pluginV1.inputDefinitions,
      {
        name: 'input3',
        required: false,
        type: PluginParameterType.BOOLEAN,
        description: 'Third input parameter (optional)'
      }
    ]
  };
  
  // Sign the updated plugin
  pluginV1_1.security.trust.signature = signPlugin(pluginV1_1);
  
  console.log('Plugin v1.1.0 created (compatible update)');
  
  // Create an incompatible update (v2.0.0)
  const pluginV2: PluginDefinition = {
    ...pluginV1_1,
    version: '2.0.0',
    inputDefinitions: [
      {
        name: 'input1',
        required: true,
        type: PluginParameterType.STRING,
        description: 'First input parameter'
      },
      {
        name: 'input2',
        required: true, // Changed from optional to required
        type: PluginParameterType.NUMBER,
        description: 'Second input parameter (now required)'
      },
      {
        name: 'input3',
        required: false,
        type: PluginParameterType.BOOLEAN,
        description: 'Third input parameter'
      }
    ],
    security: {
      ...pluginV1_1.security,
      permissions: [...pluginV1_1.security.permissions, 'fs.write'] // Added new permission
    }
  };
  
  // Sign the incompatible update
  pluginV2.security.trust.signature = signPlugin(pluginV2);
  
  console.log('Plugin v2.0.0 created (incompatible update)');
  
  // Version comparison
  console.log('\n--- Version Comparison ---');
  console.log(`v1.0.0 vs v1.1.0: ${compareVersions('1.0.0', '1.1.0')}`); // -1 (v1.0.0 < v1.1.0)
  console.log(`v1.1.0 vs v1.0.0: ${compareVersions('1.1.0', '1.0.0')}`); // 1 (v1.1.0 > v1.0.0)
  console.log(`v1.1.0 vs v2.0.0: ${compareVersions('1.1.0', '2.0.0')}`); // -1 (v1.1.0 < v2.0.0)
  
  // Version compatibility
  console.log('\n--- Version Compatibility ---');
  console.log(`v1.0.0 compatible with v1.1.0: ${areVersionsCompatible('1.0.0', '1.1.0')}`); // true
  console.log(`v1.1.0 compatible with v2.0.0: ${areVersionsCompatible('1.1.0', '2.0.0')}`); // false
  
  // Plugin compatibility checking
  console.log('\n--- Plugin Compatibility Checking ---');
  
  // Check v1.0.0 -> v1.1.0 (compatible)
  const compatCheck1 = checkPluginCompatibility(pluginV1, pluginV1_1);
  console.log('v1.0.0 -> v1.1.0 compatible:', compatCheck1.compatible);
  if (compatCheck1.issues.length > 0) {
    console.log('Issues:');
    compatCheck1.issues.forEach(issue => {
      console.log(`- [${issue.severity}] ${issue.type}: ${issue.message}`);
    });
  }
  
  // Check v1.1.0 -> v2.0.0 (incompatible)
  const compatCheck2 = checkPluginCompatibility(pluginV1_1, pluginV2);
  console.log('v1.1.0 -> v2.0.0 compatible:', compatCheck2.compatible);
  if (compatCheck2.issues.length > 0) {
    console.log('Issues:');
    compatCheck2.issues.forEach(issue => {
      console.log(`- [${issue.severity}] ${issue.type}: ${issue.message}`);
    });
  }
  
  // Plugin security validation
  console.log('\n--- Plugin Security Validation ---');
  
  // Validate permissions
  const permissionErrors = validatePluginPermissions(pluginV2);
  console.log('Permission validation errors:', permissionErrors.length > 0 ? permissionErrors : 'None');
  
  // Check for dangerous permissions
  console.log('Has dangerous permissions:', hasDangerousPermissions(pluginV2));
  
  // Verify signature
  console.log('Signature verification:', verifyPluginSignature(pluginV2));
  
  // Tamper with the plugin and verify again
  const tamperedPlugin = { ...pluginV2 };
  tamperedPlugin.inputDefinitions[0].required = false; // Tamper with the plugin
  console.log('Tampered plugin signature verification:', verifyPluginSignature(tamperedPlugin));
}

// Run the example
main().catch(console.error);
