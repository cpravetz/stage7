const axios = require('axios');

async function testAccomplishFix() {
    try {
        console.log('Testing ACCOMPLISH plugin with dependency validation...');
        
        const response = await axios.post('http://localhost:5070/chat', {
            exchanges: [
                {
                    role: 'user',
                    content: 'Create a plan to search for information about cats and then summarize the results. Make sure the second step depends on the first step output.'
                }
            ],
            optimization: 'accuracy',
            conversationType: 'TextToCode'  // This should trigger ACCOMPLISH plugin
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('Status:', response.status);
        console.log('Model used:', response.data.model);
        console.log('Response result:', response.data.result);
        
        // Try to parse the result as JSON to verify it's valid
        if (response.data.result) {
            try {
                const parsed = JSON.parse(response.data.result);
                console.log('✅ JSON parsing successful!');
                if (parsed.type === 'PLAN' && parsed.plan) {
                    console.log(`✅ Plan created with ${parsed.plan.length} steps`);
                    // Check if dependencies are properly formatted
                    parsed.plan.forEach((step, index) => {
                        if (step.dependencies && Object.keys(step.dependencies).length > 0) {
                            console.log(`✅ Step ${index + 1} has dependencies:`, step.dependencies);
                        }
                    });
                }
            } catch (parseError) {
                console.log('❌ JSON parsing failed:', parseError.message);
                console.log('Raw response:', response.data.result);
            }
        }
        
    } catch (error) {
        console.log('Status:', error.response?.status || 'No status');
        console.log('Error Response:', error.response?.data || error.message);
    }
}

testAccomplishFix();
