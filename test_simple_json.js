const axios = require('axios');

async function testSimpleJson() {
    try {
        console.log('Testing simple JSON response...');
        
        const response = await axios.post('http://localhost:5070/chat', {
            exchanges: [
                {
                    role: 'user',
                    content: 'Return a simple JSON object with just {"status": "ok", "message": "hello"}. Return only valid JSON, nothing else.'
                }
            ],
            optimization: 'speed',
            conversationType: 'TextToText'
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log('Status:', response.status);
        console.log('Model used:', response.data.model);
        console.log('Response result:', response.data.result);
        
    } catch (error) {
        console.log('Status:', error.response?.status || 'No status');
        console.log('Error Response:', error.response?.data || error.message);
    }
}

testSimpleJson();
