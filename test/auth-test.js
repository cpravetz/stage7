/**
 * Authentication System Test Script
 * 
 * This script tests the authentication system by:
 * 1. Authenticating with the SecurityManager
 * 2. Verifying the token with the SecurityManager
 * 3. Testing WebSocket connection to PostOffice
 * 4. Testing service-to-service communication
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Configuration
const CONFIG = {
  securityManagerUrl: 'http://localhost:5010',
  postOfficeUrl: 'http://localhost:5020',
  missionControlUrl: 'http://localhost:5030',
  clientSecret: 'stage7AuthSecret',
  componentType: 'TestClient',
  testTimeout: 30000 // 30 seconds
};

// Global variables
let authToken = '';

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test authentication with SecurityManager
 */
async function testAuthentication() {
  console.log('\n--- Testing Authentication ---');
  
  try {
    const response = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
      componentType: CONFIG.componentType,
      clientSecret: CONFIG.clientSecret
    });
    
    console.log('Authentication response:', response.data);
    
    if (response.data.authenticated && response.data.token) {
      authToken = response.data.token;
      console.log('Authentication successful!');
      console.log(`Token: ${authToken.substring(0, 20)}...`);
      return true;
    } else {
      console.error('Authentication failed:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test token verification with SecurityManager
 */
async function testTokenVerification() {
  console.log('\n--- Testing Token Verification ---');
  
  if (!authToken) {
    console.error('No auth token available. Run authentication test first.');
    return false;
  }
  
  try {
    const response = await axios.post(`${CONFIG.securityManagerUrl}/verify`, {}, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('Verification response:', response.data);
    
    if (response.data.valid) {
      console.log('Token verification successful!');
      return true;
    } else {
      console.error('Token verification failed:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Token verification error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test local token verification using public key
 */
async function testLocalTokenVerification() {
  console.log('\n--- Testing Local Token Verification ---');
  
  if (!authToken) {
    console.error('No auth token available. Run authentication test first.');
    return false;
  }
  
  try {
    // Try to get public key from SecurityManager
    const keyResponse = await axios.get(`${CONFIG.securityManagerUrl}/public-key`);
    const publicKey = keyResponse.data;
    
    console.log('Fetched public key from SecurityManager');
    
    // Verify token locally
    const decoded = jwt.verify(authToken, publicKey, { algorithms: ['RS256'] });
    console.log('Local verification successful!');
    console.log('Decoded token:', decoded);
    return true;
  } catch (error) {
    console.error('Local verification error:', error.message);
    return false;
  }
}

/**
 * Test WebSocket connection to PostOffice
 */
async function testWebSocketConnection() {
  console.log('\n--- Testing WebSocket Connection ---');
  
  if (!authToken) {
    console.error('No auth token available. Run authentication test first.');
    return false;
  }
  
  return new Promise((resolve) => {
    const clientId = 'test-client-' + Date.now();
    const wsUrl = `ws://localhost:5020?clientId=${clientId}&token=${authToken}`;
    
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      console.error('WebSocket connection timed out');
      ws.close();
      resolve(false);
    }, 10000);
    
    ws.on('open', () => {
      console.log('WebSocket connection established!');
      clearTimeout(timeout);
      
      // Send a test message
      const testMessage = {
        type: 'TEST',
        content: 'Hello from test client',
        sender: clientId,
        recipient: 'PostOffice',
        timestamp: new Date().toISOString()
      };
      
      ws.send(JSON.stringify(testMessage));
      console.log('Test message sent');
      
      // Wait for a response or close after 5 seconds
      setTimeout(() => {
        ws.close();
        console.log('WebSocket test completed');
        resolve(true);
      }, 5000);
    });
    
    ws.on('message', (data) => {
      console.log('Received message:', data.toString());
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      clearTimeout(timeout);
      resolve(false);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
    });
  });
}

/**
 * Test service-to-service communication
 */
async function testServiceCommunication() {
  console.log('\n--- Testing Service-to-Service Communication ---');
  
  if (!authToken) {
    console.error('No auth token available. Run authentication test first.');
    return false;
  }
  
  try {
    // Test communication with MissionControl
    const response = await axios.get(`${CONFIG.missionControlUrl}/health`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('MissionControl health response:', response.data);
    console.log('Service-to-service communication successful!');
    return true;
  } catch (error) {
    console.error('Service communication error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting authentication system tests...');
  console.log('Configuration:', CONFIG);
  
  let allTestsPassed = true;
  
  // Test authentication
  const authSuccess = await testAuthentication();
  allTestsPassed = allTestsPassed && authSuccess;
  
  // Wait a bit before next test
  await sleep(1000);
  
  // Test token verification
  const verifySuccess = await testTokenVerification();
  allTestsPassed = allTestsPassed && verifySuccess;
  
  // Wait a bit before next test
  await sleep(1000);
  
  // Test local token verification
  const localVerifySuccess = await testLocalTokenVerification();
  allTestsPassed = allTestsPassed && localVerifySuccess;
  
  // Wait a bit before next test
  await sleep(1000);
  
  // Test WebSocket connection
  const wsSuccess = await testWebSocketConnection();
  allTestsPassed = allTestsPassed && wsSuccess;
  
  // Wait a bit before next test
  await sleep(1000);
  
  // Test service-to-service communication
  const serviceSuccess = await testServiceCommunication();
  allTestsPassed = allTestsPassed && serviceSuccess;
  
  // Print summary
  console.log('\n--- Test Summary ---');
  console.log(`Authentication: ${authSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Token Verification: ${verifySuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Local Token Verification: ${localVerifySuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`WebSocket Connection: ${wsSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Service Communication: ${serviceSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Overall Result: ${allTestsPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  return allTestsPassed;
}

// Set a timeout for the entire test suite
const testTimeout = setTimeout(() => {
  console.error('Test suite timed out after', CONFIG.testTimeout, 'ms');
  process.exit(1);
}, CONFIG.testTimeout);

// Run all tests
runAllTests()
  .then(success => {
    clearTimeout(testTimeout);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test suite error:', error);
    clearTimeout(testTimeout);
    process.exit(1);
  });
