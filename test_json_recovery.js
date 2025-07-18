const axios = require('axios');

async function testJsonRecovery() {
    try {
        console.log('Testing JSON error recovery mechanism...');
        
        const response = await axios.post('http://localhost:5030/chat', {
            exchanges: [
                {
                    role: 'user',
                    content: 'Please respond with a JSON object containing a plan with steps. Make sure to return valid JSON format with proper syntax.'
                }
            ],
            optimization: 'accuracy',
            conversationType: 'TextToCode'  // This should trigger JSON requirement
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('Status:', response.status);
        console.log('Response:', response.data);
        
        // Try to parse the result as JSON to verify it's valid
        if (response.data.result) {
            try {
                const parsed = JSON.parse(response.data.result);
                console.log('✅ JSON parsing successful!');
                console.log('Parsed JSON:', JSON.stringify(parsed, null, 2));
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

testJsonRecovery();
