/**
 * Script to generate RSA key pairs for plugin signing and verification
 * 
 * Usage:
 * node generate-plugin-keys.js
 */

const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

// Create plugin keys directory if it doesn't exist
const keysDir = path.join(__dirname, '../keys/plugins');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

// Generate RSA key pair
console.log('Generating RSA key pair for plugin signing...');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Write keys to files
fs.writeFileSync(path.join(keysDir, 'plugin-private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'plugin-public.pem'), publicKey);

// Copy public key to shared keys directory
const sharedKeysDir = path.join(__dirname, '../../../shared/keys');
if (!fs.existsSync(sharedKeysDir)) {
  fs.mkdirSync(sharedKeysDir, { recursive: true });
}
fs.writeFileSync(path.join(sharedKeysDir, 'plugin-public.pem'), publicKey);

console.log('RSA key pair for plugin signing generated successfully.');
console.log(`Private key saved to: ${path.join(keysDir, 'plugin-private.pem')}`);
console.log(`Public key saved to: ${path.join(keysDir, 'plugin-public.pem')}`);
console.log(`Public key copied to shared keys directory: ${path.join(sharedKeysDir, 'plugin-public.pem')}`);
