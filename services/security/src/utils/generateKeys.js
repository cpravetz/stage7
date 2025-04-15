/**
 * Utility to generate RSA key pairs for JWT signing
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate RSA key pair
 * @param {string} keysDir Directory to store keys
 * @returns {Object} Object containing public and private keys
 */
function generateRsaKeyPair(keysDir = './keys') {
  console.log('Generating RSA key pair...');
  
  // Create keys directory if it doesn't exist
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }
  
  // Generate key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
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
  
  // Save keys to files
  const publicKeyPath = path.join(keysDir, 'public.key');
  const privateKeyPath = path.join(keysDir, 'private.key');
  
  fs.writeFileSync(publicKeyPath, publicKey);
  fs.writeFileSync(privateKeyPath, privateKey);
  
  console.log(`RSA key pair generated and saved to ${keysDir}`);
  console.log(`Public key: ${publicKeyPath}`);
  console.log(`Private key: ${privateKeyPath}`);
  
  return { publicKey, privateKey, publicKeyPath, privateKeyPath };
}

/**
 * Load RSA key pair from files
 * @param {string} keysDir Directory containing keys
 * @returns {Object} Object containing public and private keys
 */
function loadRsaKeyPair(keysDir = './keys') {
  const publicKeyPath = path.join(keysDir, 'public.key');
  const privateKeyPath = path.join(keysDir, 'private.key');
  
  // Check if keys exist
  if (!fs.existsSync(publicKeyPath) || !fs.existsSync(privateKeyPath)) {
    console.log('RSA key pair not found, generating new keys...');
    return generateRsaKeyPair(keysDir);
  }
  
  // Load keys from files
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  
  console.log(`RSA key pair loaded from ${keysDir}`);
  
  return { publicKey, privateKey, publicKeyPath, privateKeyPath };
}

module.exports = {
  generateRsaKeyPair,
  loadRsaKeyPair
};
