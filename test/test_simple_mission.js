const axios = require('axios');

async function testSimpleMission() {
    try {
        console.log('🔐 Getting auth token...');
        
        // Get auth token
        const authResponse = await axios.post('http://localhost:5010/auth/service', {
            componentType: 'MissionControl',
            clientSecret: 'stage7AuthSecret'
        });
        
        if (!authResponse.data.authenticated) {
            throw new Error('Authentication failed');
        }
        
        const token = authResponse.data.token;
        console.log('✅ Got auth token');
        
        // Create simple mission
        console.log('🚀 Creating mission...');
        const mission = {
            goal: "Search for information about open source agentic platforms",
            clientId: 'test-simple-' + Date.now()
        };
        
        const missionResponse = await axios.post('http://localhost:5020/createMission', mission, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });
        
        console.log('✅ Mission created:', missionResponse.data.result?.missionId);
        console.log('🎯 Test completed successfully!');
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        return false;
    }
}

testSimpleMission().then(success => {
    process.exit(success ? 0 : 1);
});
