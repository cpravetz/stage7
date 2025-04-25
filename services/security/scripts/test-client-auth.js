/**
 * Test script for client authentication
 * This script tests the client authentication process
 */

const axios = require('axios');
const readline = require('readline');

// Configuration
const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'http://localhost:5010';
const clientId = 'TestClient';
const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testClientAuthentication() {
  console.log('Testing client authentication...');
  console.log(`Security Manager URL: ${securityManagerUrl}`);
  console.log(`Client ID: ${clientId}`);
  
  try {
    // Step 1: Authenticate client and get token
    console.log('\n1. Authenticating client...');
    const authResponse = await axios.post(`${securityManagerUrl}/auth/client`, {
      clientId,
      clientSecret
    });
    
    if (!authResponse.data.token) {
      throw new Error('No token received from authentication endpoint');
    }
    
    const token = authResponse.data.token;
    console.log('✅ Authentication successful, token received');
    console.log(`Token: ${token.substring(0, 20)}...`);
    
    // Step 2: Verify token with SecurityManager
    console.log('\n2. Verifying token with SecurityManager...');
    const verifyResponse = await axios.post(`${securityManagerUrl}/verify`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!verifyResponse.data.valid) {
      throw new Error('Token verification failed with SecurityManager');
    }
    
    console.log('✅ Token verification successful with SecurityManager');
    console.log('Decoded token:', JSON.stringify(verifyResponse.data.user, null, 2));
    
    // Step 3: Test accessing a protected resource
    console.log('\n3. Would you like to test accessing a protected resource? (y/n)');
    rl.question('', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        const serviceUrl = await promptForServiceUrl();
        
        try {
          console.log(`\nAccessing protected resource at ${serviceUrl}...`);
          const response = await axios.get(serviceUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          console.log('✅ Successfully accessed protected resource');
          console.log('Response:', JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error('❌ Failed to access protected resource:');
          if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Response:', error.response.data);
          } else {
            console.error(error.message);
          }
        }
      }
      
      console.log('\nClient authentication test completed!');
      rl.close();
    });
  } catch (error) {
    console.error('\n❌ Client authentication test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    rl.close();
  }
}

function promptForServiceUrl() {
  return new Promise((resolve) => {
    rl.question('Enter the URL of a protected resource to test (e.g., http://localhost:5020/getServices): ', (url) => {
      resolve(url);
    });
  });
}

testClientAuthentication();
