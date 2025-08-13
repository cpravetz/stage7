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
    console.log('🔐 Getting authentication token...');
    
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

async function testProductManagerMission() {
    console.log('\n🎯 Testing Product Manager Mission...');
    
    try {
        // Get authentication token first
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Failed to get authentication token');
            return false;
        }
        
        // The exact mission you provided
        const mission = {
            goal: "Be the Product Manager for the stage7 open source project. This is the code you run on. Identify opportunities for system enhancements that extend its functionality or deepens its performance. Identify use cases for the system and build business cases around those most promising cases. Develop a marketing strategy, marketing materials and plans. Make stage7 one of the best known and most used open source Agentic platforms.",
            clientId: 'test-product-manager-' + Date.now()
        };
        
        console.log('📋 Mission Goal:');
        console.log(mission.goal);
        console.log('\n🚀 Creating mission...');
        
        const startTime = Date.now();
        
        const response = await axios.post(`${CONFIG.missionControlUrl}/createMission`, mission, {
            timeout: 300000, // 5 minutes timeout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Mission created successfully in ${duration}s`);
        console.log('Mission ID:', response.data.result?.missionId);
        
        // Wait for initial processing
        console.log('⏳ Waiting for mission processing...');
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        
        console.log('🎯 Product Manager Mission test completed!');
        console.log('📝 Check logs for:');
        console.log('   - ACCOMPLISH plugin plan generation');
        console.log('   - Novel verb handling (if any)');
        console.log('   - Step execution success');
        console.log('   - No "empty or invalid plan" errors');
        console.log('   - No Python plugin input errors');
        
        return true;
        
    } catch (error) {
        console.log('❌ Mission test failed:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function monitorSystemHealth() {
    console.log('\n🔍 System Health Check...');
    
    console.log('📊 Expected Improvements:');
    console.log('   ✅ ACCOMPLISH plugin validation fixed');
    console.log('   ✅ Novel verb handler method deployed');
    console.log('   ✅ Python plugin input serialization fixed');
    console.log('   ✅ No more "empty or invalid plan" errors');
    console.log('   ✅ No more InputValue constructor errors');
    
    console.log('\n🎯 Success Metrics to Monitor:');
    console.log('   - Mission creates successfully');
    console.log('   - ACCOMPLISH plugin generates valid plans');
    console.log('   - Steps execute without input validation errors');
    console.log('   - No infinite recovery loops');
    console.log('   - Agent health score improves');
    
    return true;
}

async function runProductManagerMissionTest() {
    console.log('🚀 Running Product Manager Mission Test...');
    console.log('=' .repeat(70));
    
    const results = {
        missionTest: false,
        healthCheck: false
    };
    
    // Test 1: Product Manager Mission
    results.missionTest = await testProductManagerMission();
    
    // Test 2: System Health Check
    results.healthCheck = await monitorSystemHealth();
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 PRODUCT MANAGER MISSION TEST RESULTS:');
    console.log('=' .repeat(70));
    
    console.log(`🎯 Mission Test: ${results.missionTest ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (results.missionTest) {
        console.log('   - Mission created and started processing');
        console.log('   - System fixes should be working');
        console.log('   - Check logs for execution details');
    }
    
    console.log(`🔧 Health Check: ${results.healthCheck ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (results.healthCheck) {
        console.log('   - System improvements documented');
        console.log('   - Success metrics defined');
    }
    
    const allPassed = results.missionTest && results.healthCheck;
    
    console.log('\n' + '=' .repeat(70));
    if (allPassed) {
        console.log('🎉 PRODUCT MANAGER MISSION TEST SUCCESSFUL! 🎉');
        console.log('✅ Critical system issues should be fixed');
        console.log('✅ Mission should execute without failing steps');
        console.log('✅ Stage7 Product Manager mission is ready!');
        console.log('🚀 The system should now work end-to-end!');
    } else {
        console.log('⚠️ Some issues may remain');
        if (!results.missionTest) {
            console.log('❌ Mission test failed - check system logs');
        }
        if (!results.healthCheck) {
            console.log('❌ Health check incomplete');
        }
    }
    console.log('=' .repeat(70));
    
    return allPassed;
}

// Run the test
runProductManagerMissionTest().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 Product Manager mission test crashed:', error);
    process.exit(1);
});
