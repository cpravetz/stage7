/**
 * Script to generate a token for testing
 */

const jwt = require('jsonwebtoken');

// Generate a token with RS256 algorithm
const payload = {
  componentType: 'browser',
  roles: ['user'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour from now
};

// Use RS256 algorithm
const token = jwt.sign(payload, 'test-secret-key', {
  algorithm: 'RS256'
});

console.log('Generated token:');
console.log(token);
