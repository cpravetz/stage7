const axios = require('axios');

async function testSecurityManagerHealth() {
    console.log('Testing SecurityManager health...');
    
    try {
        // Test health endpoint
        const healthResponse = await axios.get('http://localhost:5010/health', {
            timeout: 5000
        });
        
        console.log('✅ SecurityManager health check:', healthResponse.status, healthResponse.data);
        
        // Test service authentication with different component types
        const testConfigs = [
            { componentType: 'TestClient', clientSecret: 'stage7AuthSecret' },
            { componentType: 'MissionControl', clientSecret: 'stage7AuthSecret' },
            { componentType: 'CapabilitiesManager', clientSecret: 'stage7AuthSecret' }
        ];
        
        for (const config of testConfigs) {
            try {
                console.log(`\nTesting auth with componentType: ${config.componentType}`);
                
                const authResponse = await axios.post('http://localhost:5010/auth/service', {
                    componentType: config.componentType,
                    clientSecret: config.clientSecret
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log(`✅ Auth successful for ${config.componentType}:`, authResponse.status);
                console.log('Response:', authResponse.data);
                
            } catch (authError) {
                console.log(`❌ Auth failed for ${config.componentType}:`);
                if (authError.response) {
                    console.log('Status:', authError.response.status);
                    console.log('Data:', authError.response.data);
                } else {
                    console.log('Error:', authError.message);
                }
            }
        }
        
    } catch (error) {
        console.log('❌ SecurityManager health test failed:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testSecurityManagerHealth();
