/**
 * Script to regenerate RSA keys for the Stage7 system
 * This script generates new RSA key pairs for JWT signing and plugin signing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Directories where keys should be stored
const securityKeysDir = path.join(__dirname, 'services', 'security', 'keys');
const securityPluginKeysDir = path.join(securityKeysDir, 'plugins');
const sharedKeysDir = path.join(__dirname, 'shared', 'keys');

// Ensure directories exist
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`Created directory: ${directory}`);
  }
}

// Generate RSA key pair
function generateRsaKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
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
}

// Write key to file
function writeKeyToFile(keyData, filePath) {
  fs.writeFileSync(filePath, keyData);
  console.log(`Generated key: ${filePath}`);
}

// Main function to regenerate all keys
async function regenerateKeys() {
  try {
    console.log('Starting key regeneration process...');
    
    // Ensure directories exist
    ensureDirectoryExists(securityKeysDir);
    ensureDirectoryExists(securityPluginKeysDir);
    ensureDirectoryExists(sharedKeysDir);
    
    // Generate main JWT signing keys
    console.log('Generating main JWT signing keys...');
    const jwtKeyPair = generateRsaKeyPair();
    
    writeKeyToFile(jwtKeyPair.privateKey, path.join(securityKeysDir, 'private.pem'));
    writeKeyToFile(jwtKeyPair.privateKey, path.join(securityKeysDir, 'private.key'));
    writeKeyToFile(jwtKeyPair.publicKey, path.join(securityKeysDir, 'public.pem'));
    writeKeyToFile(jwtKeyPair.publicKey, path.join(securityKeysDir, 'public.key'));
    
    // Copy public keys to shared directory
    writeKeyToFile(jwtKeyPair.publicKey, path.join(sharedKeysDir, 'public.pem'));
    writeKeyToFile(jwtKeyPair.publicKey, path.join(sharedKeysDir, 'public.key'));
    
    // Generate plugin signing keys
    console.log('Generating plugin signing keys...');
    const pluginKeyPair = generateRsaKeyPair();
    
    writeKeyToFile(pluginKeyPair.privateKey, path.join(securityPluginKeysDir, 'plugin-private.pem'));
    writeKeyToFile(pluginKeyPair.publicKey, path.join(securityPluginKeysDir, 'plugin-public.pem'));
    
    // Copy plugin public key to shared directory
    writeKeyToFile(pluginKeyPair.publicKey, path.join(sharedKeysDir, 'plugin-public.pem'));
    
    console.log('Key regeneration completed successfully!');
    console.log('\nIMPORTANT: Make sure to add the following to your .env file:');
    console.log('GROQ_API_KEY=your_new_groq_api_key');
    console.log('\nAnd run the following command to rebuild your containers:');
    console.log('docker compose down && docker compose build && docker compose up -d');
    
  } catch (error) {
    console.error('Error regenerating keys:', error);
    process.exit(1);
  }
}

// Run the key regeneration
regenerateKeys();
