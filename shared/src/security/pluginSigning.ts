import { PluginDefinition } from '../types/Plugin';
import { createHash } from 'crypto';

/**
 * Sign a plugin
 * @param plugin Plugin definition
 * @param privateKey Private key for signing (optional)
 * @returns Signature
 */
export function signPlugin(plugin: PluginDefinition, privateKey?: string): string {
  try {
    console.log('Signing plugin:', plugin.id, plugin.verb);

    // Create a deterministic subset of plugin properties for signing
    const contentToSign = {
      id: plugin.id,
      verb: plugin.verb,
      version: plugin.version,
      entryPoint: plugin.entryPoint,
      security: {
        permissions: plugin.security.permissions,
        sandboxOptions: plugin.security.sandboxOptions
      }
    };

    console.log('Content to sign:', JSON.stringify(contentToSign, null, 2));

    // Create a deterministic string representation
    const content = JSON.stringify(contentToSign, Object.keys(contentToSign).sort());
    console.log('Sorted content:', content);

    // If a private key is provided, use it for signing
    if (privateKey) {
      console.log('Using private key for signing');
      // In a real implementation, this would use asymmetric cryptography
      // For now, we'll just use a hash of the content combined with the key
      const signature = createHash('sha256').update(content + privateKey).digest('hex');
      console.log('Generated signature with private key:', signature);
      return signature;
    }

    // Otherwise, just use a hash
    const signature = createHash('sha256').update(content).digest('hex');
    console.log('Generated signature without private key:', signature);
    return signature;
  } catch (error) {
    console.error('Error signing plugin:', error instanceof Error ? error.message : error);
    // Return a null signature that will fail verification
    return '';
  }
}

/**
 * Verify a plugin signature
 * @param plugin Plugin definition
 * @param publicKey Public key for verification (optional)
 * @returns True if the signature is valid
 */
export function verifyPluginSignature(plugin: PluginDefinition, publicKey?: string): boolean {
  try {
    console.log('Verifying plugin signature for plugin:', plugin.id, plugin.verb);

    if (!plugin.security || !plugin.security.trust || !plugin.security.trust.signature) {
      console.log('Plugin security, trust, or signature is missing:',
        !plugin.security ? 'security missing' :
        !plugin.security.trust ? 'trust missing' :
        !plugin.security.trust.signature ? 'signature missing' : 'unknown issue');
      return false;
    }

    // Regenerate the signature
    const expectedSignature = signPlugin(plugin, publicKey);
    console.log('Expected signature:', expectedSignature);
    console.log('Actual signature:', plugin.security.trust.signature);

    // Compare with the stored signature
    const isValid = expectedSignature === plugin.security.trust.signature;
    console.log('Signature verification result:', isValid);
    return isValid;
  } catch (error) {
    console.error('Error verifying plugin signature:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Create a trust certificate for a plugin
 * @param plugin Plugin definition
 * @param publisher Publisher information
 * @param privateKey Private key for signing
 * @returns Updated plugin with trust certificate
 */
export function createTrustCertificate(
  plugin: PluginDefinition,
  publisher: string,
  privateKey: string
): PluginDefinition {
  // Create a copy of the plugin
  const updatedPlugin: PluginDefinition = { ...plugin };

  // Update trust information
  updatedPlugin.security = {
    ...updatedPlugin.security,
    trust: {
      ...updatedPlugin.security.trust,
      publisher,
      signature: signPlugin(updatedPlugin, privateKey),
      certificateHash: createHash('sha256').update(publisher + privateKey).digest('hex')
    }
  };

  return updatedPlugin;
}

/**
 * Verify a plugin's trust certificate
 * @param plugin Plugin definition
 * @param trustedPublishers List of trusted publishers
 * @returns True if the plugin is trusted
 */
export function verifyTrustCertificate(
  plugin: PluginDefinition,
  trustedPublishers: string[]
): boolean {
  try {
    if (!plugin.security || !plugin.security.trust) {
      return false;
    }

    const { publisher, signature, certificateHash } = plugin.security.trust;

    // Check if the publisher is trusted
    if (!publisher || !trustedPublishers.includes(publisher)) {
      return false;
    }

    // Check if the signature is valid
    if (!signature || !verifyPluginSignature(plugin)) {
      return false;
    }

    // In a real implementation, we would verify the certificate hash
    // against a public key infrastructure

    return true;
  } catch (error) {
    console.error('Error verifying trust certificate:', error instanceof Error ? error.message : error);
    return false;
  }
}
