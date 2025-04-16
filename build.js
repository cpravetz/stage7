/**
 * Stage7 Build Script
 * 
 * This script handles the complete build process for the Stage7 system:
 * 1. Generates RSA keys for JWT signing and verification
 * 2. Generates RSA keys for plugin signing and verification
 * 3. Distributes public keys to all services
 * 4. Builds and starts Docker containers
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  keyDirs: {
    security: path.join(__dirname, 'services', 'security', 'keys'),
    securityPlugins: path.join(__dirname, 'services', 'security', 'keys', 'plugins'),
    shared: path.join(__dirname, 'shared', 'keys'),
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
 * Execute a shell command and return the output
 * @param {string} command Command to execute
 * @returns {string} Command output
 */
function execCommand(command) {
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    console.error(`Error output: ${error.stderr}`);
    throw error;
  }
}

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
 * Build and start Docker containers
 */
function buildAndStartContainers() {
  console.log('\nBuilding and starting Docker containers...');
  
  try {
    // Stop and remove existing containers
    execCommand('docker compose down');
    
    // Build containers
    execCommand('docker compose build');
    
    // Start containers
    execCommand('docker compose up -d');
    
    console.log('Docker containers built and started successfully!');
    return true;
  } catch (error) {
    console.error('Failed to build and start Docker containers:', error);
    return false;
  }
}

/**
 * Run tests to verify system functionality
 */
function runTests() {
  console.log('\nRunning tests to verify system functionality...');
  
  try {
    // Wait for services to start
    console.log('Waiting for services to start...');
    execCommand('sleep 10');
    
    // Test SecurityManager
    console.log('Testing SecurityManager...');
    const securityManagerHealth = execCommand('curl -s http://localhost:5010/health');
    console.log(`SecurityManager health: ${securityManagerHealth}`);
    
    // Test PostOffice
    console.log('Testing PostOffice...');
    const postOfficeHealth = execCommand('curl -s http://localhost:5020/health');
    console.log(`PostOffice health: ${postOfficeHealth}`);
    
    // Test authentication
    console.log('Testing authentication...');
    const authResponse = execCommand('curl -s -X POST -H "Content-Type: application/json" -d \'{"componentType":"TestClient","clientSecret":"stage7AuthSecret"}\' http://localhost:5010/auth/service');
    console.log(`Authentication response: ${authResponse}`);
    
    // Extract token from auth response
    const authData = JSON.parse(authResponse);
    if (!authData.token) {
      throw new Error('Failed to get authentication token');
    }
    
    // Test token verification
    console.log('Testing token verification...');
    const verifyResponse = execCommand(`curl -s -X POST -H "Authorization: Bearer ${authData.token}" http://localhost:5010/verify`);
    console.log(`Verification response: ${verifyResponse}`);
    
    console.log('All tests passed!');
    return true;
  } catch (error) {
    console.error('Tests failed:', error);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('Starting Stage7 build process...');
  
  try {
    // Ensure directories exist
    ensureDirectories();
    
    // Generate keys
    generateJwtKeys();
    generatePluginKeys();
    
    // Verify key distribution
    const keysSuccess = verifyKeyDistribution();
    if (!keysSuccess) {
      console.error('Key distribution verification failed! Aborting build.');
      process.exit(1);
    }
    
    // Build and start containers
    const buildSuccess = buildAndStartContainers();
    if (!buildSuccess) {
      console.error('Failed to build and start containers! Aborting.');
      process.exit(1);
    }
    
    // Run tests
    const testsSuccess = runTests();
    if (!testsSuccess) {
      console.error('Tests failed! The system may not be functioning correctly.');
      process.exit(1);
    }
    
    console.log('\nStage7 build process completed successfully!');
    console.log('The system is now running and ready to use.');
  } catch (error) {
    console.error('Build process failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();
