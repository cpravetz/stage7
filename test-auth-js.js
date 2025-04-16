/**
 * Test script for the authentication service
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
        // Test 1: Get authentication token
        console.log('=== Test 1: Get authentication token ===');
        const token = await getAuthToken();
        if (!token) {
            console.error('Failed to get authentication token');
            return;
        }
        
        // Test 2: Verify token
        console.log('\n=== Test 2: Verify token ===');
        const tokenValid = await verifyToken(token);
        if (!tokenValid) {
            console.error('Token verification failed');
            return;
        }
        
        // Test 3: Get public key
        console.log('\n=== Test 3: Get public key ===');
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
