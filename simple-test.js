/**
 * Simple test script for Stage7 authentication
 */

const axios = require('axios');

// Configuration
const CONFIG = {
  securityManagerUrl: 'http://localhost:5010',
  componentType: 'MissionControl',
  clientSecret: 'stage7AuthSecret'
};

// Get authentication token
async function getAuthToken() {
  console.log('Getting authentication token...');
  
  try {
    const response = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
      componentType: CONFIG.componentType,
      clientSecret: CONFIG.clientSecret
    });
    
    console.log('Authentication response:', response.data);
    
    if (response.data.authenticated && response.data.token) {
      console.log('Authentication successful!');
      return response.data.token;
    } else {
      console.error('Authentication failed:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Verify token
async function verifyToken(token) {
  console.log('Verifying token...');
  
  try {
    const response = await axios.post(`${CONFIG.securityManagerUrl}/verify`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
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
    console.error('Verification error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

// Run the test
async function runTest() {
  try {
    // Get authentication token
    const token = await getAuthToken();
    if (!token) {
      console.error('Failed to get authentication token');
      process.exit(1);
    }
    
    // Verify token
    const verified = await verifyToken(token);
    if (!verified) {
      console.error('Failed to verify token');
      process.exit(1);
    }
    
    console.log('Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
