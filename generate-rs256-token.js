/**
 * Script to generate an RS256 token for testing
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Read the private key
const privateKeyPath = path.join(__dirname, 'services', 'security', 'src', 'keys', 'private.key');
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

// Generate a token
const payload = {
  componentType: 'MissionControl',
  roles: ['mission:manage', 'agent:control'],
  issuedAt: Date.now()
};

// Use RS256 algorithm with the private key
const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '1h'
});

console.log('Generated RS256 token:');
console.log(token);

// Save the token to a file for easy access
fs.writeFileSync('rs256-token.txt', token);
console.log('Token saved to rs256-token.txt');
