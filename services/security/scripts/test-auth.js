/**
 * Test script for RS256 authentication
 * This script tests the token generation and verification process
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Import the authenticated axios creator
const { createAuthenticatedAxios } = require('@cktmcs/shared');

// Configuration
const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'http://localhost:5010';
const serviceId = 'TestService';
const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';

// Create an authenticated axios instance
// Note: For authentication endpoints, we still need to use direct axios
// But for subsequent authenticated calls, use the authenticated instance
const authenticatedApi = createAuthenticatedAxios(
  serviceId,
  securityManagerUrl,
  serviceSecret
);

// Load public key for local verification
const publicKeyPath = path.join(__dirname, '../keys/public.key');
const publicKey = fs.existsSync(publicKeyPath) 
  ? fs.readFileSync(publicKeyPath, 'utf8')
  : null;

async function testAuthentication() {
  console.log('Testing RS256 authentication...');
  console.log(`Security Manager URL: ${securityManagerUrl}`);
  
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
    const verifyResponse = await authenticatedApi.post(`${securityManagerUrl}/verify`, {});
    
    if (!verifyResponse.data.valid) {
      throw new Error('Token verification failed with SecurityManager');
    }
    
    console.log('✅ Token verification successful with SecurityManager');
    console.log('Decoded token:', JSON.stringify(verifyResponse.data.user, null, 2));
    
    // Step 3: Verify token locally if public key is available
    if (publicKey) {
      console.log('\n3. Verifying token locally with public key...');
      try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        console.log('✅ Local token verification successful');
        console.log('Locally decoded token:', JSON.stringify(decoded, null, 2));
      } catch (error) {
        console.error('❌ Local token verification failed:', error.message);
      }
    } else {
      console.log('\n3. Skipping local verification (public key not found)');
    }
    
    // Step 4: Test token with invalid signature
    console.log('\n4. Testing token with invalid signature...');
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      // Modify the signature part to make it invalid
      const invalidToken = `${tokenParts[0]}.${tokenParts[1]}.invalidSignature`;
      
      try {
        await axios.post(`${securityManagerUrl}/verify`, {}, {
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
    }
    
    console.log('\nAuthentication test completed successfully!');
  } catch (error) {
    console.error('\n❌ Authentication test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testAuthentication();

