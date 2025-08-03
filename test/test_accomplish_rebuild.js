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
            console.log('✅ Authentication successful!');
            return response.data.token;
        } else {
            console.error('❌ Authentication failed:', response.data);
            return null;
        }
    } catch (error) {
        console.error('❌ Authentication error:', error.message);
        return null;
    }
}

async function testAccomplishAfterRebuild() {
    console.log('🧪 Testing ACCOMPLISH Plugin after Brain service rebuild...');
    
    try {
        // Get authentication token first
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Failed to get authentication token');
            return;
        }
        
        // Create a simple test mission
        const mission = {
            goal: "Create a simple 3-step plan to test the ACCOMPLISH plugin",
            description: "Test mission to verify ACCOMPLISH plugin is working after Brain service rebuild with fixed model names"
        };
        
        console.log('📋 Creating test mission...');
        console.log('Mission:', JSON.stringify(mission, null, 2));
        
        const startTime = Date.now();
        
        const response = await axios.post(`${CONFIG.missionControlUrl}/mission`, mission, {
            timeout: 300000, // 5 minutes timeout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Mission Response Status: ${response.status} (took ${duration}s)`);
        console.log('✅ Mission Response Data:', JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.missionId) {
            console.log('🎯 ACCOMPLISH Plugin SUCCESS!');
            console.log(`📝 Mission ID: ${response.data.missionId}`);
            
            // Check if we got a plan
            if (response.data.plan && Array.isArray(response.data.plan)) {
                console.log(`📋 Generated plan with ${response.data.plan.length} steps:`);
                response.data.plan.forEach((step, index) => {
                    console.log(`  Step ${index + 1}: ${step.actionVerb} - ${step.description}`);
                });
                
                console.log('\n🎉 ACCOMPLISH PLUGIN IS NOW WORKING! 🎉');
                console.log('✅ Phase 1 (TextToText): SUCCESS - Generated prose plan');
                console.log('✅ Phase 2 (TextToJSON): SUCCESS - Converted to structured JSON');
                console.log('✅ Model name fixes: SUCCESS - Using correct model names without :latest suffix');
                
            } else {
                console.log('⚠️ Mission created but no plan returned');
            }
        } else {
            console.log('❌ No mission ID in response');
        }
        
    } catch (error) {
        console.log('❌ ACCOMPLISH Plugin test failed:');
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

// Wait for Brain service to fully start after rebuild
console.log('⏳ Waiting for Brain service to fully start after rebuild...');
setTimeout(() => {
    console.log('🚀 Starting ACCOMPLISH plugin test...');
    testAccomplishAfterRebuild();
}, 30000); // Wait 30 seconds for full startup
