const axios = require('axios');

async function testAccomplishFinal() {
    console.log('🧪 Testing ACCOMPLISH Plugin Final Fix...');
    
    try {
        // Get authentication token
        console.log('🔐 Getting authentication token...');
        const authResponse = await axios.post('http://localhost:5010/auth/service', {
            componentType: 'MissionControl',
            clientSecret: 'stage7AuthSecret'
        });
        
        if (!authResponse.data.authenticated) {
            console.log('❌ Authentication failed');
            return false;
        }
        
        console.log('✅ Authentication successful');
        
        // Create a simple test mission
        const mission = {
            goal: "Create a simple 3-step plan to organize a desk",
            clientId: 'test-final-' + Date.now()
        };
        
        console.log('📋 Creating test mission...');
        console.log('Mission goal:', mission.goal);
        
        const startTime = Date.now();
        
        const response = await axios.post('http://localhost:5020/createMission', mission, {
            timeout: 120000, // 2 minutes timeout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authResponse.data.token}`
            }
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Mission created successfully in ${duration}s`);
        console.log('Mission ID:', response.data.result?.missionId);
        console.log('Mission Status:', response.data.result?.status);
        
        // Wait for the mission to process
        console.log('⏳ Waiting for ACCOMPLISH plugin to execute...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
        
        console.log('🎯 ACCOMPLISH Plugin test completed!');
        console.log('📝 Check CapabilitiesManager logs for validation results');
        
        return true;
        
    } catch (error) {
        console.log('❌ Test failed:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

// Run the test
testAccomplishFinal().then(success => {
    if (success) {
        console.log('\n🎉 Test completed successfully!');
        console.log('Check the CapabilitiesManager logs to verify the ACCOMPLISH plugin is working.');
    } else {
        console.log('\n❌ Test failed');
    }
    process.exit(success ? 0 : 1);
});
