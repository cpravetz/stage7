/**
 * Script to fix authentication keys
 * This script ensures that the public key is properly generated and distributed
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths for the keys
const securityKeysDir = path.join(__dirname, '../keys');
const sharedKeysDir = path.join(__dirname, '../../../shared/keys');
const rootKeysDir = path.join(__dirname, '../../../keys');

console.log('Starting authentication key fix...');

// Create directories if they don't exist
function ensureDirectories() {
  const directories = [securityKeysDir, sharedKeysDir, rootKeysDir];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

// Check if keys exist
function checkExistingKeys() {
  const privateKeyPath = path.join(securityKeysDir, 'private.key');
  const publicKeyPath = path.join(securityKeysDir, 'public.key');
  
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    console.log('Existing keys found in security service');
    return true;
  }
  
  return false;
}

// Generate new RSA key pair
function generateNewKeys() {
  console.log('Generating new RSA key pair...');
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

  return publicKey;
}

// Distribute public key to all required locations
function distributePublicKey(publicKey) {
  console.log('Distributing public key to all required locations...');
  
  // Security service
  fs.writeFileSync(path.join(securityKeysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(securityKeysDir, 'public.pem'), publicKey);
  
  // Shared directory
  fs.writeFileSync(path.join(sharedKeysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(sharedKeysDir, 'public.pem'), publicKey);
  
  // Root keys directory
  fs.writeFileSync(path.join(rootKeysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(rootKeysDir, 'public.pem'), publicKey);
  
  console.log('Public key distributed to all required locations');
}

// Main function
function fixAuthKeys() {
  try {
    // Ensure directories exist
    ensureDirectories();
    
    let publicKey;
    
    // Check if keys exist
    if (checkExistingKeys()) {
      // Use existing public key
      publicKey = fs.readFileSync(path.join(securityKeysDir, 'public.key'), 'utf8');
      console.log('Using existing public key');
    } else {
      // Generate new keys
      publicKey = generateNewKeys();
      console.log('Generated new RSA key pair');
    }
    
    // Distribute public key
    distributePublicKey(publicKey);
    
    console.log('\nAuthentication key fix completed successfully!');
    console.log('\nIMPORTANT: You need to restart all services for the changes to take effect.');
  } catch (error) {
    console.error('Error fixing authentication keys:', error);
    process.exit(1);
  }
}

// Run the main function
fixAuthKeys();
