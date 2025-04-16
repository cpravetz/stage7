/**
 * Script to create a new token with the correct algorithm
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  componentType: 'MissionControl',
  roles: ['mission:manage', 'agent:control'],
  expiresIn: '1h',
  algorithm: 'HS256',
  secret: 'stage7AuthSecret'
};

// Create a token
function createToken() {
  console.log('Creating token for component:', CONFIG.componentType);
  
  const payload = {
    componentType: CONFIG.componentType,
    roles: CONFIG.roles,
    issuedAt: Date.now()
  };
  
  const token = jwt.sign(payload, CONFIG.secret, {
    algorithm: CONFIG.algorithm,
    expiresIn: CONFIG.expiresIn
  });
  
  console.log('Token created successfully!');
  console.log('Token:', token);
  
  // Save token to file
  fs.writeFileSync('token.txt', token);
  console.log('Token saved to token.txt');
  
  return token;
}

// Verify token
function verifyToken(token) {
  console.log('Verifying token...');
  
  try {
    const decoded = jwt.verify(token, CONFIG.secret);
    console.log('Token verified successfully!');
    console.log('Decoded token:', decoded);
    return true;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return false;
  }
}

// Run the script
function main() {
  const token = createToken();
  verifyToken(token);
}

main();
