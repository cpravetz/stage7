/**
 * Authentication Fix Script for Stage7
 * 
 * This script fixes authentication issues by:
 * 1. Generating new keys with proper formats
 * 2. Distributing keys to all services
 * 3. Creating a test token for verification
 * 4. Testing token verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');

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
  modulusLength: 2048,
  sharedSecret: 'stage7AuthSecret'
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
 * Create a test token using the private key
 * @param {string} privateKey Private key
 * @returns {string} JWT token
 */
function createTestToken(privateKey) {
  console.log('\nCreating test token...');
  
  const payload = {
    componentType: 'TestClient',
    roles: ['test:read', 'test:write'],
    issuedAt: Date.now()
  };
  
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '1h'
  });
  
  console.log(`Test token created: ${token.substring(0, 20)}...`);
  return token;
}

/**
 * Verify a token using the public key
 * @param {string} token JWT token
 * @param {string} publicKey Public key
 * @returns {boolean} True if token is valid
 */
function verifyToken(token, publicKey) {
  console.log('\nVerifying test token...');
  
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    console.log('Token verified successfully!');
    console.log('Decoded token:', decoded);
    return true;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return false;
  }
}

/**
 * Create a legacy token using the shared secret
 * @returns {string} JWT token
 */
function createLegacyToken() {
  console.log('\nCreating legacy token...');
  
  const payload = {
    componentType: 'TestClient',
    roles: ['test:read', 'test:write'],
    issuedAt: Date.now()
  };
  
  const token = jwt.sign(payload, CONFIG.sharedSecret, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
  
  console.log(`Legacy token created: ${token.substring(0, 20)}...`);
  return token;
}

/**
 * Verify a legacy token using the shared secret
 * @param {string} token JWT token
 * @returns {boolean} True if token is valid
 */
function verifyLegacyToken(token) {
  console.log('\nVerifying legacy token...');
  
  try {
    const decoded = jwt.verify(token, CONFIG.sharedSecret);
    console.log('Legacy token verified successfully!');
    console.log('Decoded token:', decoded);
    return true;
  } catch (error) {
    console.error('Legacy token verification failed:', error.message);
    return false;
  }
}

/**
 * Copy keys to Docker containers
 */
function copyKeysToContainers() {
  console.log('\nCopying keys to Docker containers...');
  
  try {
    // Copy keys to SecurityManager container
    execCommand(`docker compose cp ${CONFIG.keyDirs.security} securitymanager:/usr/src/app/services/security/`);
    console.log('Keys copied to SecurityManager container');
    
    // Copy keys to shared directory in all containers
    const containers = [
      'postoffice',
      'missioncontrol',
      'brain',
      'librarian',
      'engineer',
      'trafficmanager',
      'capabilitiesmanager',
      'agentset',
      'configservice'
    ];
    
    containers.forEach(container => {
      try {
        execCommand(`docker compose cp ${CONFIG.keyDirs.shared} ${container}:/usr/src/app/shared/`);
        console.log(`Keys copied to ${container} container`);
      } catch (error) {
        console.error(`Failed to copy keys to ${container} container:`, error.message);
      }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to copy keys to containers:', error.message);
    return false;
  }
}

/**
 * Restart Docker containers
 */
function restartContainers() {
  console.log('\nRestarting Docker containers...');
  
  try {
    execCommand('docker compose restart securitymanager postoffice');
    console.log('SecurityManager and PostOffice containers restarted');
    return true;
  } catch (error) {
    console.error('Failed to restart containers:', error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('Starting authentication fix...');
  
  try {
    // Ensure directories exist
    ensureDirectories();
    
    // Generate keys
    const jwtKeyPair = generateJwtKeys();
    generatePluginKeys();
    
    // Create and verify test tokens
    const testToken = createTestToken(jwtKeyPair.privateKey);
    const tokenValid = verifyToken(testToken, jwtKeyPair.publicKey);
    
    if (!tokenValid) {
      console.error('Test token verification failed! Aborting.');
      process.exit(1);
    }
    
    // Create and verify legacy token
    const legacyToken = createLegacyToken();
    const legacyTokenValid = verifyLegacyToken(legacyToken);
    
    if (!legacyTokenValid) {
      console.error('Legacy token verification failed! Aborting.');
      process.exit(1);
    }
    
    // Copy keys to containers
    const keysCopied = copyKeysToContainers();
    if (!keysCopied) {
      console.error('Failed to copy keys to containers! Aborting.');
      process.exit(1);
    }
    
    // Restart containers
    const containersRestarted = restartContainers();
    if (!containersRestarted) {
      console.error('Failed to restart containers! Aborting.');
      process.exit(1);
    }
    
    console.log('\nAuthentication fix completed successfully!');
    console.log('The system should now be functioning correctly with proper authentication between all services.');
  } catch (error) {
    console.error('Authentication fix failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();
