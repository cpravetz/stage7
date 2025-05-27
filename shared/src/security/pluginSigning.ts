import { PluginDefinition } from '../types/Plugin';
import { PluginManifest } from '../types/PluginManifest';
import { createHash, createSign, createVerify } from 'crypto';
import fs from 'fs';
import path from 'path';

// Try to load the RSA keys for plugin signing and verification
let PLUGIN_PRIVATE_KEY: string | null = null;
let PLUGIN_PUBLIC_KEY: string | null = null;
let isUsingAsymmetricKeys = false;

try {
  // Try to load the private key (only available in the security service)
  try {
    PLUGIN_PRIVATE_KEY = fs.readFileSync(path.join(__dirname, '../../keys/plugins/plugin-private.pem'), 'utf8');
    console.log('Loaded RSA private key for plugin signing');
  } catch (error) {
    console.log('RSA private key for plugin signing not found (this is normal for most services)');
  }

  // Try to load the public key (available in all services)
  PLUGIN_PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../../keys/plugin-public.pem'), 'utf8');
  console.log('Loaded RSA public key for plugin verification');

  isUsingAsymmetricKeys = PLUGIN_PUBLIC_KEY !== null;
} catch (error) {
  console.error('Failed to load RSA keys for plugin signing/verification:', error);
  console.warn('Using fallback hash-based signing/verification');
}

/**
 * Create a canonical representation of a plugin for signing
 * @param plugin Plugin definition
 * @returns Canonical string representation
 */
function createCanonicalRepresentation(plugin: PluginDefinition): string {
  // Create a deterministic subset of plugin properties for signing
  const contentToSign = {
    id: plugin.id,
    verb: plugin.verb,
    version: plugin.version,
    entryPoint: plugin.entryPoint || {},
    security: {
      permissions: plugin.security.permissions,
      sandboxOptions: plugin.security.sandboxOptions
    }
  };

  // Create a deterministic string representation
  return JSON.stringify(contentToSign, Object.keys(contentToSign).sort());
}

/**
 * Sign a plugin
 * @param plugin Plugin definition
 * @param privateKey Private key for signing (optional)
 * @returns Signature
 */
export function signPlugin(plugin: PluginDefinition, privateKey?: string): string {
  try {
    console.log('Signing plugin:', plugin.id, plugin.verb);

    // Create a canonical representation of the plugin
    const content = createCanonicalRepresentation(plugin);
    console.log('Canonical content:', content);

    // If we have the RSA private key and no specific key is provided, use it
    if (isUsingAsymmetricKeys && PLUGIN_PRIVATE_KEY && !privateKey) {
      console.log('Using RSA private key for signing');
      const sign = createSign('SHA256');
      sign.update(content);
      sign.end();
      const signature = sign.sign(PLUGIN_PRIVATE_KEY, 'base64');
      console.log('Generated RSA signature');
      return signature;
    }

    // If a specific private key is provided, use it
    if (privateKey) {
      console.log('Using provided private key for signing');
      try {
        // Try to use it as an RSA key
        const sign = createSign('SHA256');
        sign.update(content);
        sign.end();
        const signature = sign.sign(privateKey, 'base64');
        console.log('Generated RSA signature with provided key');
        return signature;
      } catch (error) {
        console.warn('Failed to use provided key as RSA key, falling back to hash-based signing');
        // Fall back to hash-based signing
        const signature = createHash('sha256').update(content + privateKey).digest('hex');
        console.log('Generated hash-based signature with provided key');
        return signature;
      }
    }

    // Otherwise, just use a hash
    console.log('Using hash-based signing (no private key available)');
    const signature = createHash('sha256').update(content).digest('hex');
    console.log('Generated hash-based signature');
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
export function verifyPluginSignature(plugin: PluginManifest, publicKey?: string): boolean {
  try {
    if (!plugin.security?.trust?.signature) {
      console.log('Plugin has no signature to verify');
      return false;
    }

    // Get the signature and the data to verify
    const signature = plugin.security.trust.signature;
    const objectToVerify = {
      id: plugin.id,
      verb: plugin.verb,
      version: plugin.version,
      entryPoint: plugin.entryPoint || {}, // Match canonical representation's handling of optional entryPoint
      security: {
        permissions: plugin.security.permissions,
        sandboxOptions: plugin.security.sandboxOptions
      }
    };
    const dataToVerify = JSON.stringify(objectToVerify, Object.keys(objectToVerify).sort());

    // Use the provided public key or load from environment/file
    const keyToUse = publicKey || process.env.PLUGIN_PUBLIC_KEY || '';
    if (!keyToUse) {
      console.error('No public key available for plugin signature verification');
      return false;
    }

    // Verify the signature using crypto
    const crypto = require('crypto');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(dataToVerify);
    const isValid = verifier.verify(keyToUse, signature, 'base64');

    console.log(`Plugin signature verification: ${isValid ? 'passed' : 'failed'}`);
    return isValid;
  } catch (error) {
    console.error('Error verifying plugin signature:', error);
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

  // Create a certificate hash using the publisher information
  let certificateHash: string;

  try {
    // Try to use RSA for the certificate hash
    const sign = createSign('SHA256');
    sign.update(publisher);
    sign.end();
    certificateHash = sign.sign(privateKey, 'base64');
  } catch (error) {
    // Fall back to hash-based certificate
    certificateHash = createHash('sha256').update(publisher + privateKey).digest('hex');
  }

  // Update trust information
  updatedPlugin.security = {
    ...updatedPlugin.security,
    trust: {
      ...updatedPlugin.security.trust,
      publisher,
      signature: signPlugin(updatedPlugin, privateKey),
      certificateHash
    }
  };

  return updatedPlugin;
}

/**
 * Verify a plugin's trust certificate
 * @param plugin Plugin definition
 * @param trustedPublishers List of trusted publishers
 * @param publicKeys Map of publisher to public key
 * @returns True if the plugin is trusted
 */
export function verifyTrustCertificate(
  plugin: PluginDefinition,
  trustedPublishers: string[],
  publicKeys?: Map<string, string>
): boolean {
  try {
    if (!plugin.security || !plugin.security.trust) {
      console.log('Plugin security or trust information missing');
      return false;
    }

    const { publisher, signature, certificateHash } = plugin.security.trust;

    // Check if the publisher is trusted
    if (!publisher || !trustedPublishers.includes(publisher)) {
      console.log(`Publisher ${publisher} is not in the trusted publishers list`);
      return false;
    }

    // Check if the signature is valid
    if (!signature) {
      console.log('Plugin signature is missing');
      return false;
    }

    // Get the public key for this publisher if available
    const publisherPublicKey = publicKeys?.get(publisher);

    // Verify the plugin signature
    const isSignatureValid = verifyPluginSignature(plugin, publisherPublicKey);
    if (!isSignatureValid) {
      console.log('Plugin signature verification failed');
      return false;
    }

    // Verify the certificate hash if we have the public key
    if (publisherPublicKey && certificateHash) {
      try {
        // Try to verify the certificate hash using RSA
        const verify = createVerify('SHA256');
        verify.update(publisher);
        verify.end();
        const isCertificateValid = verify.verify(publisherPublicKey, certificateHash, 'base64');

        if (!isCertificateValid) {
          console.log('Certificate hash verification failed');
          return false;
        }
      } catch (error) {
        console.warn('RSA certificate verification failed, falling back to hash comparison');
        // Fall back to hash comparison
        const expectedHash = createHash('sha256').update(publisher + publisherPublicKey).digest('hex');
        if (certificateHash !== expectedHash) {
          console.log('Certificate hash comparison failed');
          return false;
        }
      }
    }

    console.log('Plugin trust certificate verification passed');
    return true;
  } catch (error) {
    console.error('Error verifying trust certificate:', error instanceof Error ? error.message : error);
    return false;
  }
}
