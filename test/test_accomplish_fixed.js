const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    missionControlUrl: 'http://localhost:5020',
    componentType: 'MissionControl',
    clientSecret: process.env.CLIENT_SECRET || 'stage7AuthSecret'
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
        return null;
    }
}

async function testAccomplishPlugin() {
    console.log('Testing ACCOMPLISH Plugin after fixes...');
    
    try {
        // Get authentication token first
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Failed to get authentication token');
            return;
        }
        
        // Create a simple test mission
        const mission = {
            goal: "Create a simple marketing plan for Stage7 with 3 key steps",
            description: "Test mission to verify ACCOMPLISH plugin is working after model fixes"
        };
        
        console.log('Creating test mission...');
        console.log('Mission:', JSON.stringify(mission, null, 2));
        
        const response = await axios.post(`${CONFIG.missionControlUrl}/mission`, mission, {
            timeout: 180000, // 3 minutes timeout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('✅ Mission Response Status:', response.status);
        console.log('✅ Mission Response Data:', JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.missionId) {
            console.log('🎯 ACCOMPLISH Plugin SUCCESS!');
            console.log('Mission ID:', response.data.missionId);
            
            // Check if we got a plan
            if (response.data.plan && Array.isArray(response.data.plan)) {
                console.log(`📋 Generated plan with ${response.data.plan.length} steps:`);
                response.data.plan.forEach((step, index) => {
                    console.log(`  Step ${index + 1}: ${step.actionVerb} - ${step.description}`);
                });
            }
        } else {
            console.log('❌ No mission ID in response');
        }
        
    } catch (error) {
        console.log('❌ ACCOMPLISH Plugin test failed:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

testAccomplishPlugin();
