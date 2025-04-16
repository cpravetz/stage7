const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { token, authenticate, verifyToken: oauthVerifyToken } = require('./oauth/server');

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

// OAuth 2.0 endpoints
app.post('/oauth/token', token());

// Legacy service authentication endpoint
const authServiceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many authentication requests, please try again later.'
});

// Legacy service authentication endpoint that redirects to OAuth 2.0 token endpoint
app.post('/auth/service', authServiceLimiter, (req, res, next) => {
    console.log('Received authentication request from component');
    console.log('Request body:', JSON.stringify(req.body));

    const { componentType, clientSecret } = req.body;
    console.log(`Component type: ${componentType}, Client secret provided: ${clientSecret ? 'Yes' : 'No'}`);

    // Convert legacy request to OAuth 2.0 request
    req.body = {
        grant_type: 'client_credentials',
        client_id: componentType,
        client_secret: clientSecret
    };

    // Forward to OAuth 2.0 token endpoint
    next();
}, token());

// Add the /verify endpoint for token verification
app.post('/verify', oauthVerifyToken());

// Add endpoint to get public key
app.get('/public-key', (req, res) => {
  try {
    console.log('Serving public key');
    res.set('Content-Type', 'text/plain');
    return res.send(publicKey);
  } catch (error) {
    console.error('Error serving public key:', error);
    return res.status(500).json({ error: 'Failed to serve public key' });
  }
});

// Start the server
const port = process.env.PORT || '5010';
app.listen(port, () => {
  console.log(`SecurityManager listening on port ${port}`);
});

module.exports = app;
