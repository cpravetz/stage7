import { PluginDefinition, PluginParameter } from '../types/Plugin';
import { compareVersions, areVersionsCompatible } from './semver';

/**
 * Interface for compatibility check results
 */
export interface CompatibilityCheckResult {
  compatible: boolean;
  issues: CompatibilityIssue[];
}

/**
 * Interface for compatibility issues
 */
export interface CompatibilityIssue {
  type: 'version' | 'input' | 'output' | 'security' | 'other';
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Check if two plugins are compatible
 * @param oldPlugin Previous version of the plugin
 * @param newPlugin New version of the plugin
 * @returns Compatibility check result
 */
export function checkPluginToPluginCompatibility(
  oldPlugin: PluginDefinition,
  newPlugin: PluginDefinition
): CompatibilityCheckResult {
  const issues: CompatibilityIssue[] = [];

  // Check version compatibility
  if (!areVersionsCompatible(oldPlugin.version, newPlugin.version)) {
    issues.push({
      type: 'version',
      severity: 'error',
      message: `Major version change from ${oldPlugin.version} to ${newPlugin.version} indicates breaking changes`
    });
  }

  // Check if the new version is actually newer
  if (compareVersions(newPlugin.version, oldPlugin.version) < 0) {
    issues.push({
      type: 'version',
      severity: 'error',
      message: `New plugin version ${newPlugin.version} is older than existing version ${oldPlugin.version}`
    });
  }

  // Check input parameters compatibility
  checkInputCompatibility(oldPlugin, newPlugin, issues);

  // Check output parameters compatibility
  checkOutputCompatibility(oldPlugin, newPlugin, issues);

  // Check security compatibility
  checkSecurityCompatibility(oldPlugin, newPlugin, issues);

  return {
    compatible: !issues.some(issue => issue.severity === 'error'),
    issues
  };
}

/**
 * Check if input parameters are compatible
 * @param oldPlugin Previous version of the plugin
 * @param newPlugin New version of the plugin
 * @param issues Array to add issues to
 */
function checkInputCompatibility(
  oldPlugin: PluginDefinition,
  newPlugin: PluginDefinition,
  issues: CompatibilityIssue[]
): void {
  // Create maps for quick lookup
  const oldInputs = new Map(oldPlugin.inputDefinitions.map(input => [input.name, input]));
  const newInputs = new Map(newPlugin.inputDefinitions.map(input => [input.name, input]));

  // Check for removed inputs
  for (const [name, input] of oldInputs.entries()) {
    if (!newInputs.has(name)) {
      issues.push({
        type: 'input',
        severity: 'error',
        message: `Input parameter '${name}' has been removed`
      });
    }
  }

  // Check for changed inputs
  for (const [name, newInput] of newInputs.entries()) {
    const oldInput = oldInputs.get(name);

    if (oldInput) {
      // Check for type changes
      if (oldInput.type !== newInput.type) {
        issues.push({
          type: 'input',
          severity: 'error',
          message: `Input parameter '${name}' changed type from '${oldInput.type}' to '${newInput.type}'`
        });
      }

      // Check for required changes (making an optional parameter required is a breaking change)
      if (!oldInput.required && newInput.required) {
        issues.push({
          type: 'input',
          severity: 'error',
          message: `Input parameter '${name}' changed from optional to required`
        });
      }
    } else {
      // New required parameters are a breaking change
      if (newInput.required) {
        issues.push({
          type: 'input',
          severity: 'error',
          message: `New required input parameter '${name}' added`
        });
      } else {
        // New optional parameters are fine
        issues.push({
          type: 'input',
          severity: 'warning',
          message: `New optional input parameter '${name}' added`
        });
      }
    }
  }
}

/**
 * Interface for host compatibility check results
 */
export interface HostCompatibilityResult {
    isCompatible: boolean;
    reason?: string;
}

/**
 * Check if a plugin is compatible with the host environment
 * @param plugin The plugin definition
 * @param hostCapabilities Object containing host version and app name
 * @returns Host compatibility check result
 */
export function checkHostCompatibility(
    plugin: PluginDefinition,
    hostCapabilities: { hostVersion?: string; hostAppName?: string }
): HostCompatibilityResult {
    if (!plugin.metadata?.compatibility?.minHostVersion) {
        // If plugin doesn't specify a minHostVersion, assume it's compatible (or define a default policy)
        return { isCompatible: true, reason: "Plugin does not specify a minimum host version." };
    }

    if (!hostCapabilities.hostVersion) {
        // If host doesn't provide a version, cannot determine compatibility strictly
        return { isCompatible: false, reason: "Host version not provided for compatibility check." };
    }

    const compatible = areVersionsCompatible(plugin.metadata.compatibility.minHostVersion, hostCapabilities.hostVersion);
    if (compatible) {
        return { isCompatible: true };
    } else {
        // Check if the host is older than the plugin's requirement
        if (compareVersions(hostCapabilities.hostVersion, plugin.metadata.compatibility.minHostVersion) < 0) {
             return {
                isCompatible: false,
                reason: `Host version '${hostCapabilities.hostVersion}' is older than plugin's required minimum host version '${plugin.metadata.compatibility.minHostVersion}'.`
            };
        } else {
            // This case implies the host is newer but still not "compatible" according to areVersionsCompatible (e.g. major version mismatch)
            // For minHostVersion, typically any host version >= minHostVersion (within the same major, or if major doesn't matter) is fine.
            // areVersionsCompatible might be too strict if it implies exact match or only minor/patch differences.
            // Let's refine this: compatibility means hostVersion >= minHostVersion.
            // We need to ensure areVersionsCompatible handles this logic or use compareVersions directly.

            // Assuming areVersionsCompatible(required, actual) means actual is compatible with required:
            // If areVersionsCompatible implies "actual" can be newer, then the original 'compatible' variable is correct.
            // If it's strict, we need to adjust. Let's assume for now 'areVersionsCompatible' is suitable for "hostVersion is at least minHostVersion and not incompatible due to major version changes".
            // The existing compareVersions(a,b) returns: 1 if a > b, -1 if a < b, 0 if a === b.
            // So, hostVersion >= minHostVersion means compareVersions(hostCapabilities.hostVersion, plugin.metadata.compatibility.minHostVersion) >= 0

            const hostIsSufficient = compareVersions(hostCapabilities.hostVersion, plugin.metadata.compatibility.minHostVersion) >= 0;

            if (hostIsSufficient) {
                // If host version is sufficient, then the 'areVersionsCompatible' might have failed due to major version mismatch.
                // For minHostVersion, we typically care that the host is AT LEAST that version.
                // The 'areVersionsCompatible' function might be more about plugin-to-plugin where major bumps are breaking.
                // Let's simplify: if host version is >= minHostVersion, it's compatible in terms of minimum requirement.
                // However, a plugin might also specify a *maximum* host version or specific compatible host versions.
                // The current PluginDefinition only has minHostVersion.
                 return { isCompatible: true, reason: "Host version meets or exceeds plugin's minimum requirement. Note: areVersionsCompatible might have stricter rules on major versions." };
            } else {
                 return {
                    isCompatible: false,
                    reason: `Host version '${hostCapabilities.hostVersion}' is older than plugin's required minimum host version '${plugin.metadata.compatibility.minHostVersion}'.`
                };
            }
        }
    }
}

/**
 * Check if output parameters are compatible
 * @param oldPlugin Previous version of the plugin
 * @param newPlugin New version of the plugin
 * @param issues Array to add issues to
 */
function checkOutputCompatibility(
  oldPlugin: PluginDefinition,
  newPlugin: PluginDefinition,
  issues: CompatibilityIssue[]
): void {
  // Create maps for quick lookup
  const oldOutputs = new Map(oldPlugin.outputDefinitions.map(output => [output.name, output]));
  const newOutputs = new Map(newPlugin.outputDefinitions.map(output => [output.name, output]));

  // Check for removed outputs
  for (const [name, output] of oldOutputs.entries()) {
    if (!newOutputs.has(name)) {
      issues.push({
        type: 'output',
        severity: 'error',
        message: `Output parameter '${name}' has been removed`
      });
    }
  }

  // Check for changed outputs
  for (const [name, newOutput] of newOutputs.entries()) {
    const oldOutput = oldOutputs.get(name);

    if (oldOutput) {
      // Check for type changes
      if (oldOutput.type !== newOutput.type) {
        issues.push({
          type: 'output',
          severity: 'error',
          message: `Output parameter '${name}' changed type from '${oldOutput.type}' to '${newOutput.type}'`
        });
      }
    } else {
      // New outputs are fine
      issues.push({
        type: 'output',
        severity: 'warning',
        message: `New output parameter '${name}' added`
      });
    }
  }
}

/**
 * Check if security settings are compatible
 * @param oldPlugin Previous version of the plugin
 * @param newPlugin New version of the plugin
 * @param issues Array to add issues to
 */
function checkSecurityCompatibility(
  oldPlugin: PluginDefinition,
  newPlugin: PluginDefinition,
  issues: CompatibilityIssue[]
): void {
  // Check for new permissions
  const oldPermissions = new Set(oldPlugin.security.permissions);
  const newPermissions = new Set(newPlugin.security.permissions);

  for (const permission of newPermissions) {
    if (!oldPermissions.has(permission)) {
      issues.push({
        type: 'security',
        severity: 'warning',
        message: `New permission requested: '${permission}'`
      });
    }
  }

  // Check for changes in sandbox options
  const oldSandbox = oldPlugin.security.sandboxOptions;
  const newSandbox = newPlugin.security.sandboxOptions;

  // Check for eval permission change
  if (!oldSandbox.allowEval && newSandbox.allowEval) {
    issues.push({
      type: 'security',
      severity: 'error',
      message: 'Plugin now requests eval permission, which is a security risk'
    });
  }

  // Check for new allowed modules
  const oldModules = new Set(oldSandbox.allowedModules || []);
  const newModules = new Set(newSandbox.allowedModules || []);

  for (const module of newModules) {
    if (!oldModules.has(module)) {
      issues.push({
        type: 'security',
        severity: 'warning',
        message: `Plugin now requests access to module: '${module}'`
      });
    }
  }

  // Check for new allowed APIs
  const oldAPIs = new Set(oldSandbox.allowedAPIs || []);
  const newAPIs = new Set(newSandbox.allowedAPIs || []);

  for (const api of newAPIs) {
    if (!oldAPIs.has(api)) {
      issues.push({
        type: 'security',
        severity: 'warning',
        message: `Plugin now requests access to API: '${api}'`
      });
    }
  }
}
