/**
 * Simple test script to create a mission in Stage7
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    postOfficeUrl: 'http://localhost:5020',
    missionGoal: 'Invent a new business that can run fully automatically',
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

// Create a mission
async function createMission(token) {
    console.log('Creating mission with goal:', CONFIG.missionGoal);
    
    try {
        const response = await axios.post(`${CONFIG.postOfficeUrl}/createMission`, {
            goal: CONFIG.missionGoal,
            clientId: 'test-client-' + Date.now()
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Mission created successfully!');
        console.log('Response:', response.data);
        
        return response.data;
    } catch (error) {
        console.error('Failed to create mission:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
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
        
        // Create mission
        const missionData = await createMission(token);
        if (!missionData) {
            console.error('Failed to create mission');
            process.exit(1);
        }
        
        console.log('Test completed successfully!');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

// Run the test
runTest();
