/**
 * Script to copy the public key from the SecurityManager to the shared/keys directory
 */
const fs = require('fs');
const path = require('path');

// Paths
const securityKeysDir = path.join(__dirname, '../../keys');
const sharedKeysDir = path.join(__dirname, '../../../../shared/keys');

// Create shared keys directory if it doesn't exist
if (!fs.existsSync(sharedKeysDir)) {
  fs.mkdirSync(sharedKeysDir, { recursive: true });
  console.log(`Created shared keys directory: ${sharedKeysDir}`);
}

// Check if public key exists in security keys directory
const publicKeyPath = path.join(securityKeysDir, 'public.key');
if (!fs.existsSync(publicKeyPath)) {
  console.error(`Public key not found at ${publicKeyPath}`);
  process.exit(1);
}

// Copy public key to shared keys directory
const sharedPublicKeyPath = path.join(sharedKeysDir, 'public.key');
fs.copyFileSync(publicKeyPath, sharedPublicKeyPath);
console.log(`Copied public key from ${publicKeyPath} to ${sharedPublicKeyPath}`);
