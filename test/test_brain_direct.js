const axios = require('axios');

async function testBrainService() {
    console.log('Testing Brain service directly...');
    
    try {
        // Test TextToJSON request
        const response = await axios.post('http://localhost:5070/chat', {
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant. Return only valid JSON.'
                },
                {
                    role: 'user',
                    content: 'Create a simple JSON object with a "message" field containing "Hello World"'
                }
            ],
            conversationType: 'TextToJSON',
            temperature: 0.1
        }, {
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Brain service responded successfully!');
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);
        
    } catch (error) {
        console.log('❌ Brain service test failed:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testBrainService();
