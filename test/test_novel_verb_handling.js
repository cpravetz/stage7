const axios = require('axios');

async function testNovelVerbHandling() {
    console.log('🧪 Testing Novel Verb Handling Fix...');
    
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
        
        // Create a mission that will generate novel verbs
        const mission = {
            goal: "Research the top 3 AI frameworks and analyze their market potential",
            clientId: 'test-novel-verb-' + Date.now()
        };
        
        console.log('📋 Creating mission with novel verbs...');
        console.log('Mission goal:', mission.goal);
        
        const startTime = Date.now();
        
        const response = await axios.post('http://localhost:5020/createMission', mission, {
            timeout: 180000, // 3 minutes timeout
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
        console.log('⏳ Waiting for novel verb handling to execute...');
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        
        console.log('🎯 Novel verb handling test completed!');
        console.log('📝 Check CapabilitiesManager logs for:');
        console.log('   - Novel verb detection');
        console.log('   - Brain response parsing');
        console.log('   - Plugin recommendation or direct answer');
        
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
testNovelVerbHandling().then(success => {
    if (success) {
        console.log('\n🎉 Novel verb handling test completed!');
        console.log('Check the logs to see if Brain response parsing is now working.');
    } else {
        console.log('\n❌ Test failed');
    }
    process.exit(success ? 0 : 1);
});
