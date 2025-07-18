const axios = require('axios');

async function testMaxTokensError() {
    try {
        console.log('Testing max_tokens configuration error handling...');
        
        const response = await axios.post('http://localhost:5030/chat', {
            exchanges: [
                {
                    role: 'user',
                    content: 'Write a very long detailed essay about artificial intelligence, machine learning, deep learning, neural networks, and their applications in modern technology. Please make it extremely comprehensive and detailed with many examples and explanations.' + ' This is a very long prompt.'.repeat(100)
                }
            ],
            optimization: 'accuracy',
            conversationType: 'TextToText',
            max_tokens: 50000  // This should trigger a max_tokens error for most models
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('Status:', response.status);
        console.log('Response:', response.data);
        
    } catch (error) {
        console.log('Status:', error.response?.status || 'No status');
        console.log('Error Response:', error.response?.data || error.message);
    }
}

testMaxTokensError();
