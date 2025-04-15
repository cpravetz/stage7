const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { loadRsaKeyPair } = require('./utils/generateKeys');

// Create a minimal express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Load RSA keys for JWT signing and verification
const keysDir = process.env.KEYS_DIR || path.join(__dirname, 'keys');
const { publicKey, privateKey } = loadRsaKeyPair(keysDir);

// Copy public key to shared keys directory
try {
  require('./scripts/copyPublicKey');
  console.log('Public key copied to shared keys directory');
} catch (error) {
  console.error('Failed to copy public key:', error);
}

// Service Registry
const serviceRegistry = {
  'ConfigService': {
    id: 'ConfigService',
    secret: process.env.CONFIG_SERVICE_SECRET || 'stage7AuthSecret',
    roles: ['config:read', 'config:write']
  },
  'PostOffice': {
    id: 'PostOffice',
    secret: process.env.POSTOFFICE_SECRET || 'stage7AuthSecret',
    roles: ['message:send', 'message:receive', 'service:discover']
  },
  'MissionControl': {
    id: 'MissionControl',
    secret: process.env.MISSIONCONTROL_SECRET || 'stage7AuthSecret',
    roles: ['mission:manage', 'agent:control']
  },
  'Brain': {
    id: 'Brain',
    secret: process.env.BRAIN_SECRET || 'stage7AuthSecret',
    roles: ['llm:invoke']
  },
  'Librarian': {
    id: 'Librarian',
    secret: process.env.LIBRARIAN_SECRET || 'stage7AuthSecret',
    roles: ['data:read', 'data:write']
  },
  'Engineer': {
    id: 'Engineer',
    secret: process.env.ENGINEER_SECRET || 'stage7AuthSecret',
    roles: ['plugin:execute']
  },
  'TrafficManager': {
    id: 'TrafficManager',
    secret: process.env.TRAFFICMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['traffic:manage']
  },
  'CapabilitiesManager': {
    id: 'CapabilitiesManager',
    secret: process.env.CAPABILITIESMANAGER_SECRET || 'stage7AuthSecret',
    roles: ['capability:manage']
  },
  'AgentSet': {
    id: 'AgentSet',
    secret: process.env.AGENTSET_SECRET || 'stage7AuthSecret',
    roles: ['agent:manage', 'agent:execute']
  },
};

// Use RSA keys for JWT signing and verification
console.log('Using RS256 asymmetric keys for JWT signing and verification');

// Basic routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Security service is running' });
});

// Endpoint to get the public key
app.get('/public-key', (req, res) => {
  res.send(publicKey);
});

// Add the /auth/service endpoint for component authentication
app.post('/auth/service', (req, res) => {
  const { componentType, clientSecret } = req.body;
  console.log(`Authenticating component: ${componentType}`);

  const service = serviceRegistry[componentType];
  if (!service) {
    console.error(`Unknown service type: ${componentType}`);
    return res.status(401).json({ authenticated: false, error: 'Unknown service type' });
  }

  // In development mode or if the secret matches, authenticate the service
  if (process.env.NODE_ENV === 'development' || service.secret === clientSecret) {
    console.log(`Client verified for componentType: ${componentType}`);

    // Generate token
    const payload = {
      componentType,
      roles: service.roles,
      issuedAt: Date.now()
    };

    // Use RS256 algorithm with the private key
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h'
    });

    console.log(`Generated token for ${componentType}`);
    return res.json({ authenticated: true, token });
  }

  console.error(`Authentication failed for ${componentType}`);
  return res.status(401).json({ authenticated: false, error: 'Invalid credentials' });
});

// Add the /verify endpoint for token verification
app.post('/verify', (req, res) => {
  console.log('Received token verification request');
  const authHeader = req.headers.authorization;
  console.log('Authorization header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the token using RS256 with the public key
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    console.log('Token verified successfully:', decoded);

    return res.status(200).json({
      valid: true,
      user: decoded
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// Start the server
const port = process.env.PORT || '5010';
app.listen(port, () => {
  console.log(`SecurityManager listening on port ${port}`);
});

module.exports = app;
