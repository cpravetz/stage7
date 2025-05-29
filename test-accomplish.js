/**
 * Test script to trigger the ACCOMPLISH plugin and debug the goal parameter issue
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    capabilitiesManagerUrl: 'http://localhost:5060',
    clientSecret: 'stage7AuthSecret',
    componentType: 'TestClient'
};

async function getAuthToken() {
    try {
        const response = await axios.post(`${CONFIG.securityManagerUrl}/generateToken`, {
            clientId: CONFIG.componentType,
            clientSecret: CONFIG.clientSecret
        });
        return response.data.token;
    } catch (error) {
        console.error('Failed to get auth token:', error.message);
        throw error;
    }
}

async function testAccomplishPlugin() {
    try {
        console.log('Getting auth token...');
        const token = await getAuthToken();
        
        console.log('Testing ACCOMPLISH plugin...');
        
        // Create a simple step to trigger the ACCOMPLISH plugin
        const step = {
            actionVerb: 'ACCOMPLISH',
            inputs: {
                goal: {
                    inputName: 'goal',
                    inputValue: 'Create a simple test plan',
                    args: {}
                }
            },
            description: 'Test the ACCOMPLISH plugin'
        };

        console.log('Sending request to CapabilitiesManager...');
        console.log('Step:', JSON.stringify(step, null, 2));

        const response = await axios.post(`${CONFIG.capabilitiesManagerUrl}/executeAction`, step, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the test
testAccomplishPlugin();
