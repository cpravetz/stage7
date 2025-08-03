const axios = require('axios');

async function testOpenWebUIModels() {
    console.log('Testing OpenWebUI models...');
    
    try {
        // Test the OpenWebUI models endpoint to see what's available
        const modelsResponse = await axios.get('https://knllm.dusdusdusd.com/api/models', {
            headers: {
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NzI5ZjE5LTNhNzItNGJhNy1hNzJhLTNhNzJhNzJhNzJhNyJ9.Ky_ZQJGfXZ8QJGfXZ8QJGfXZ8QJGfXZ8QJGfXZ8QJGf'
            },
            timeout: 10000
        });
        
        console.log('Available models:');
        console.log(JSON.stringify(modelsResponse.data, null, 2));
        
        // Test specific models that are failing
        const testModels = ['codewriter:latest', 'gemma3n:latest', 'knownow', 'codewriter', 'gemma3n'];
        
        for (const modelName of testModels) {
            try {
                console.log(`\nTesting model: ${modelName}`);
                
                const testResponse = await axios.post('https://knllm.dusdusdusd.com/api/chat/completions', {
                    model: modelName,
                    messages: [
                        { role: 'user', content: 'Hello, can you respond with just "OK"?' }
                    ],
                    max_tokens: 10
                }, {
                    headers: {
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NzI5ZjE5LTNhNzItNGJhNy1hNzJhLTNhNzJhNzJhNzJhNyJ9.Ky_ZQJGfXZ8QJGfXZ8QJGfXZ8QJGfXZ8QJGfXZ8QJGf',
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });
                
                console.log(`✅ Model ${modelName} works!`);
                console.log(`Response: ${JSON.stringify(testResponse.data, null, 2)}`);
                
            } catch (error) {
                console.log(`❌ Model ${modelName} failed:`);
                if (error.response) {
                    console.log(`Status: ${error.response.status}`);
                    console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
                } else {
                    console.log(`Error: ${error.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Failed to get models list:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testOpenWebUIModels();
