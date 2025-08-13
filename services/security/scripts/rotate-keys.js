/**
 * Script to rotate RS256 key pair for JWT signing and verification
 * Run this script periodically to enhance security
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths for the keys
const securityKeysDir = path.join(__dirname, '../keys');
const sharedKeysDir = path.join(__dirname, '../../../shared/keys');

// Create directories if they don't exist
if (!fs.existsSync(securityKeysDir)) {
  fs.mkdirSync(securityKeysDir, { recursive: true });
  console.log(`Created directory: ${securityKeysDir}`);
}

if (!fs.existsSync(sharedKeysDir)) {
  fs.mkdirSync(sharedKeysDir, { recursive: true });
  console.log(`Created directory: ${sharedKeysDir}`);
}

// Backup existing keys
function backupKeys() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(securityKeysDir, `backup-${timestamp}`);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory: ${backupDir}`);
  }
  
  // Backup private keys
  if (fs.existsSync(path.join(securityKeysDir, 'private.key'))) {
    fs.copyFileSync(
      path.join(securityKeysDir, 'private.key'),
      path.join(backupDir, 'private.key')
    );
  }
  
  if (fs.existsSync(path.join(securityKeysDir, 'private.pem'))) {
    fs.copyFileSync(
      path.join(securityKeysDir, 'private.pem'),
      path.join(backupDir, 'private.pem')
    );
  }
  
  // Backup public keys
  if (fs.existsSync(path.join(securityKeysDir, 'public.key'))) {
    fs.copyFileSync(
      path.join(securityKeysDir, 'public.key'),
      path.join(backupDir, 'public.key')
    );
  }
  
  if (fs.existsSync(path.join(securityKeysDir, 'public.pem'))) {
    fs.copyFileSync(
      path.join(securityKeysDir, 'public.pem'),
      path.join(backupDir, 'public.pem')
    );
  }
  
  console.log('Existing keys backed up successfully');
}

// Generate new key pair
function generateNewKeys() {
  console.log('Generating new RS256 key pair...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
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

  // Save private key (only in security service)
  fs.writeFileSync(path.join(securityKeysDir, 'private.key'), privateKey);
  fs.writeFileSync(path.join(securityKeysDir, 'private.pem'), privateKey);
  console.log('Private key saved to security service keys directory');

  // Save public key (in both security service and shared)
  fs.writeFileSync(path.join(securityKeysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(securityKeysDir, 'public.pem'), publicKey);
  fs.writeFileSync(path.join(sharedKeysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(sharedKeysDir, 'public.pem'), publicKey);
  console.log('Public key saved to security service and shared keys directories');

  console.log('RS256 key pair generated successfully!');
}

// Main function
function rotateKeys() {
  console.log('Starting key rotation process...');
  
  // Backup existing keys
  backupKeys();
  
  // Generate new keys
  generateNewKeys();
  
  console.log('Key rotation completed successfully!');
  console.log('Note: You will need to restart all services to use the new keys.');
}

rotateKeys();
