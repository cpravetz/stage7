/**
 * End-to-end test script for RS256 authentication
 * This script tests the entire authentication flow from service authentication to accessing protected resources
 */

const axios = require('axios');
const readline = require('readline');

// Configuration
const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'http://localhost:5010';
const postOfficeUrl = process.env.POSTOFFICE_URL || 'http://localhost:5020';
const serviceId = 'TestService';
const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testAuthenticationE2E() {
  console.log('Testing RS256 authentication end-to-end...');
  console.log(`Security Manager URL: ${securityManagerUrl}`);
  console.log(`PostOffice URL: ${postOfficeUrl}`);
  
  try {
    // Step 1: Authenticate service and get token
    console.log('\n1. Authenticating service...');
    const authResponse = await axios.post(`${securityManagerUrl}/auth/service`, {
      componentType: serviceId,
      clientSecret: serviceSecret
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
    
    // Step 3: Access a protected resource in PostOffice
    console.log('\n3. Accessing protected resource in PostOffice...');
    try {
      const servicesResponse = await axios.get(`${postOfficeUrl}/getServices`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('✅ Successfully accessed protected resource in PostOffice');
      console.log('Services:', JSON.stringify(servicesResponse.data, null, 2));
    } catch (error) {
      console.error('❌ Failed to access protected resource in PostOffice:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
      } else {
        console.error(error.message);
      }
    }
    
    // Step 4: Test with invalid token
    console.log('\n4. Testing with invalid token...');
    const invalidToken = token.substring(0, token.length - 10) + 'invalid';
    
    try {
      await axios.get(`${postOfficeUrl}/getServices`, {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });
      console.error('❌ Invalid token was accepted!');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Invalid token was correctly rejected');
      } else {
        console.error('❌ Unexpected error with invalid token:', error.message);
      }
    }
    
    // Step 5: Test with no token
    console.log('\n5. Testing with no token...');
    try {
      await axios.get(`${postOfficeUrl}/getServices`);
      console.error('❌ Request with no token was accepted!');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Request with no token was correctly rejected');
      } else {
        console.error('❌ Unexpected error with no token:', error.message);
      }
    }
    
    console.log('\nAuthentication end-to-end test completed successfully!');
  } catch (error) {
    console.error('\n❌ Authentication end-to-end test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
  } finally {
    rl.close();
  }
}

testAuthenticationE2E();
