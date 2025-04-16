/**
 * Test script for the OAuth 2.0 server
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    componentType: 'MissionControl',
    clientSecret: 'stage7AuthSecret'
};

// Get OAuth 2.0 token
async function getOAuthToken() {
    console.log('Getting OAuth 2.0 token...');
    
    try {
        const response = await axios.post(`${CONFIG.securityManagerUrl}/oauth/token`, {
            grant_type: 'client_credentials',
            client_id: CONFIG.componentType,
            client_secret: CONFIG.clientSecret
        });
        
        console.log('OAuth 2.0 token response:', response.data);
        return response.data.access_token;
    } catch (error) {
        console.error('OAuth 2.0 token error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Get legacy token
async function getLegacyToken() {
    console.log('Getting legacy token...');
    
    try {
        const response = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
            componentType: CONFIG.componentType,
            clientSecret: CONFIG.clientSecret
        });
        
        console.log('Legacy token response:', response.data);
        return response.data.token || response.data.access_token;
    } catch (error) {
        console.error('Legacy token error:', error.message);
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
        
        console.log('Token verification response:', response.data);
        return response.data.valid;
    } catch (error) {
        console.error('Token verification error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return false;
    }
}

// Get public key
async function getPublicKey() {
    console.log('Getting public key...');
    
    try {
        const response = await axios.get(`${CONFIG.securityManagerUrl}/public-key`);
        
        console.log('Public key response:', response.data.substring(0, 100) + '...');
        return response.data;
    } catch (error) {
        console.error('Public key error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Run tests
async function runTests() {
    try {
        // Test 1: Get OAuth 2.0 token
        console.log('=== Test 1: Get OAuth 2.0 token ===');
        const oauthToken = await getOAuthToken();
        if (!oauthToken) {
            console.error('Failed to get OAuth 2.0 token');
            return;
        }
        
        // Test 2: Get legacy token
        console.log('\n=== Test 2: Get legacy token ===');
        const legacyToken = await getLegacyToken();
        if (!legacyToken) {
            console.error('Failed to get legacy token');
            return;
        }
        
        // Test 3: Verify OAuth 2.0 token
        console.log('\n=== Test 3: Verify OAuth 2.0 token ===');
        const oauthTokenValid = await verifyToken(oauthToken);
        if (!oauthTokenValid) {
            console.error('OAuth 2.0 token verification failed');
            return;
        }
        
        // Test 4: Verify legacy token
        console.log('\n=== Test 4: Verify legacy token ===');
        const legacyTokenValid = await verifyToken(legacyToken);
        if (!legacyTokenValid) {
            console.error('Legacy token verification failed');
            return;
        }
        
        // Test 5: Get public key
        console.log('\n=== Test 5: Get public key ===');
        const publicKey = await getPublicKey();
        if (!publicKey) {
            console.error('Failed to get public key');
            return;
        }
        
        console.log('\n=== All tests passed! ===');
    } catch (error) {
        console.error('Test error:', error);
    }
}

// Run tests
runTests();
