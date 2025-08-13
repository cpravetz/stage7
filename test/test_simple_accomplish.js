console.log('🧪 Testing ACCOMPLISH Plugin...');

const axios = require('axios');

async function testAccomplish() {
    try {
        console.log('🔐 Getting auth token...');
        
        const authResponse = await axios.post('http://localhost:5010/auth/service', {
            componentType: 'MissionControl',
            clientSecret: 'stage7AuthSecret'
        });
        
        if (!authResponse.data.authenticated) {
            console.log('❌ Auth failed');
            return;
        }
        
        console.log('✅ Auth successful');
        
        const mission = {
            goal: "Create a 3-step plan to make coffee",
            clientId: 'test-' + Date.now()
        };
        
        console.log('📋 Creating mission...');
        
        const response = await axios.post('http://localhost:5020/createMission', mission, {
            headers: {
                'Authorization': `Bearer ${authResponse.data.token}`
            },
            timeout: 120000
        });
        
        console.log('✅ Mission created:', response.data.result?.missionId);
        console.log('🎯 ACCOMPLISH Plugin test completed!');
        
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

testAccomplish();
