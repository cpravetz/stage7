/**
 * Key Management Script for Stage7
 * 
 * This script handles:
 * 1. Generation of RSA key pairs for JWT signing and verification
 * 2. Generation of RSA key pairs for plugin signing and verification
 * 3. Distribution of public keys to all services
 * 4. Proper file permissions for security
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  keyDirs: {
    security: path.join(__dirname, '..', 'services', 'security', 'keys'),
    securityPlugins: path.join(__dirname, '..', 'services', 'security', 'keys', 'plugins'),
    shared: path.join(__dirname, '..', 'shared', 'keys'),
  },
  keyNames: {
    jwt: {
      private: ['private.key', 'private.pem'],
      public: ['public.key', 'public.pem']
    },
    plugin: {
      private: ['plugin-private.pem'],
      public: ['plugin-public.pem']
    }
  },
  modulusLength: 2048
};

/**
 * Ensure all required directories exist
 */
function ensureDirectories() {
  console.log('Ensuring directories exist...');
  
  Object.values(CONFIG.keyDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

/**
 * Generate an RSA key pair
 * @returns {Object} Object containing public and private keys
 */
function generateRsaKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: CONFIG.modulusLength,
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

/**
 * Write a key to a file
 * @param {string} keyData Key data
 * @param {string} filePath File path
 */
function writeKeyToFile(keyData, filePath) {
  fs.writeFileSync(filePath, keyData);
  console.log(`Generated key: ${filePath}`);
  
  // Set proper permissions (readable only by owner)
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, 0o600);
    }
  } catch (error) {
    console.warn(`Warning: Could not set file permissions for ${filePath}: ${error.message}`);
  }
}

/**
 * Generate JWT signing keys
 */
function generateJwtKeys() {
  console.log('\nGenerating JWT signing keys...');
  
  const keyPair = generateRsaKeyPair();
  
  // Write private keys to security service
  CONFIG.keyNames.jwt.private.forEach(keyName => {
    writeKeyToFile(keyPair.privateKey, path.join(CONFIG.keyDirs.security, keyName));
  });
  
  // Write public keys to security service
  CONFIG.keyNames.jwt.public.forEach(keyName => {
    writeKeyToFile(keyPair.publicKey, path.join(CONFIG.keyDirs.security, keyName));
  });
  
  // Copy public keys to shared directory
  CONFIG.keyNames.jwt.public.forEach(keyName => {
    writeKeyToFile(keyPair.publicKey, path.join(CONFIG.keyDirs.shared, keyName));
  });
  
  return keyPair;
}

/**
 * Generate plugin signing keys
 */
function generatePluginKeys() {
  console.log('\nGenerating plugin signing keys...');
  
  const keyPair = generateRsaKeyPair();
  
  // Write private keys to security service plugins directory
  CONFIG.keyNames.plugin.private.forEach(keyName => {
    writeKeyToFile(keyPair.privateKey, path.join(CONFIG.keyDirs.securityPlugins, keyName));
  });
  
  // Write public keys to security service plugins directory
  CONFIG.keyNames.plugin.public.forEach(keyName => {
    writeKeyToFile(keyPair.publicKey, path.join(CONFIG.keyDirs.securityPlugins, keyName));
  });
  
  // Copy public keys to shared directory
  CONFIG.keyNames.plugin.public.forEach(keyName => {
    writeKeyToFile(keyPair.publicKey, path.join(CONFIG.keyDirs.shared, keyName));
  });
  
  return keyPair;
}

/**
 * Verify that keys are properly distributed
 */
function verifyKeyDistribution() {
  console.log('\nVerifying key distribution...');
  
  let success = true;
  
  // Check JWT keys
  CONFIG.keyNames.jwt.private.forEach(keyName => {
    const keyPath = path.join(CONFIG.keyDirs.security, keyName);
    if (!fs.existsSync(keyPath)) {
      console.error(`ERROR: JWT private key not found: ${keyPath}`);
      success = false;
    }
  });
  
  CONFIG.keyNames.jwt.public.forEach(keyName => {
    const securityKeyPath = path.join(CONFIG.keyDirs.security, keyName);
    const sharedKeyPath = path.join(CONFIG.keyDirs.shared, keyName);
    
    if (!fs.existsSync(securityKeyPath)) {
      console.error(`ERROR: JWT public key not found in security service: ${securityKeyPath}`);
      success = false;
    }
    
    if (!fs.existsSync(sharedKeyPath)) {
      console.error(`ERROR: JWT public key not found in shared directory: ${sharedKeyPath}`);
      success = false;
    }
  });
  
  // Check plugin keys
  CONFIG.keyNames.plugin.private.forEach(keyName => {
    const keyPath = path.join(CONFIG.keyDirs.securityPlugins, keyName);
    if (!fs.existsSync(keyPath)) {
      console.error(`ERROR: Plugin private key not found: ${keyPath}`);
      success = false;
    }
  });
  
  CONFIG.keyNames.plugin.public.forEach(keyName => {
    const securityKeyPath = path.join(CONFIG.keyDirs.securityPlugins, keyName);
    const sharedKeyPath = path.join(CONFIG.keyDirs.shared, keyName);
    
    if (!fs.existsSync(securityKeyPath)) {
      console.error(`ERROR: Plugin public key not found in security service: ${securityKeyPath}`);
      success = false;
    }
    
    if (!fs.existsSync(sharedKeyPath)) {
      console.error(`ERROR: Plugin public key not found in shared directory: ${sharedKeyPath}`);
      success = false;
    }
  });
  
  if (success) {
    console.log('All keys are properly distributed!');
  } else {
    console.error('Key distribution verification failed!');
  }
  
  return success;
}

/**
 * Main function
 */
function main() {
  console.log('Starting key management process...');
  
  try {
    // Ensure directories exist
    ensureDirectories();
    
    // Generate keys
    generateJwtKeys();
    generatePluginKeys();
    
    // Verify key distribution
    const success = verifyKeyDistribution();
    
    if (success) {
      console.log('\nKey management completed successfully!');
      console.log('\nIMPORTANT: You need to rebuild your Docker containers for the changes to take effect:');
      console.log('docker compose down && docker compose build && docker compose up -d');
    } else {
      console.error('\nKey management completed with errors!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during key management:', error);
    process.exit(1);
  }
}

// Run the main function
main();
