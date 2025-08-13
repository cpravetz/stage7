const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    brainUrl: 'http://localhost:5070',
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

async function testBrainTextToJSON() {
    console.log('🧪 Testing Brain TextToJSON directly...');
    
    try {
        // Get authentication token first
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Failed to get authentication token');
            return;
        }
        
        // Test TextToJSON request
        const textToJSONRequest = {
            messages: [
                {
                    role: 'system',
                    content: 'You are a planning assistant. Generate actionable plans as JSON arrays. Return ONLY valid JSON, no other text.'
                },
                {
                    role: 'user',
                    content: 'Convert this simple plan into a JSON array with 2 steps: "1. Research Stage7 features, 2. Write a summary report". Each step should have: number, actionVerb, description, inputs, outputs, dependencies. Return ONLY the JSON array.'
                }
            ],
            conversationType: 'TextToJSON',
            temperature: 0.1
        };
        
        console.log('📋 Sending TextToJSON request to Brain...');
        
        const startTime = Date.now();
        
        const response = await axios.post(`${CONFIG.brainUrl}/chat`, textToJSONRequest, {
            timeout: 120000, // 2 minutes timeout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Brain TextToJSON Response Status: ${response.status} (took ${duration}s)`);
        console.log('✅ Brain TextToJSON Response Data:', JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.content) {
            console.log('🎯 Brain TextToJSON SUCCESS!');
            console.log('📝 Response content length:', response.data.content.length);
            
            // Try to parse the JSON response
            try {
                const jsonResponse = JSON.parse(response.data.content);
                console.log('✅ JSON parsing successful!');
                console.log('📋 Parsed JSON:', JSON.stringify(jsonResponse, null, 2));
                
                if (Array.isArray(jsonResponse)) {
                    console.log(`🎉 SUCCESS! Brain returned valid JSON array with ${jsonResponse.length} steps`);
                    console.log('✅ TextToJSON is working correctly!');
                } else {
                    console.log('⚠️ JSON is valid but not an array');
                }
                
            } catch (parseError) {
                console.log('❌ JSON parsing failed:', parseError.message);
                console.log('Raw content:', response.data.content);
            }
            
        } else {
            console.log('❌ No content in response');
        }
        
    } catch (error) {
        console.log('❌ Brain TextToJSON test failed:');
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

testBrainTextToJSON();
