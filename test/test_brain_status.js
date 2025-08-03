const axios = require('axios');
const fs = require('fs');

async function testBrainStatus() {
    const timestamp = new Date().toISOString();
    let logMessage = `\n=== Brain Service Test at ${timestamp} ===\n`;
    
    try {
        // Test health endpoint first
        const healthResponse = await axios.get('http://localhost:5070/health', {
            timeout: 5000
        });
        
        logMessage += `✅ Health check: ${healthResponse.status} - ${JSON.stringify(healthResponse.data)}\n`;
        
        // Test simple TextToText request
        const textResponse = await axios.post('http://localhost:5070/chat', {
            messages: [
                {
                    role: 'user',
                    content: 'Say "Hello World"'
                }
            ],
            conversationType: 'TextToText',
            temperature: 0.1
        }, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        logMessage += `✅ TextToText test: ${textResponse.status} - Response length: ${JSON.stringify(textResponse.data).length}\n`;
        
        // Test TextToJSON request
        const jsonResponse = await axios.post('http://localhost:5070/chat', {
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
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        logMessage += `✅ TextToJSON test: ${jsonResponse.status} - Response length: ${JSON.stringify(jsonResponse.data).length}\n`;
        
    } catch (error) {
        logMessage += `❌ Brain service test failed:\n`;
        if (error.response) {
            logMessage += `Status: ${error.response.status}\n`;
            logMessage += `Data: ${JSON.stringify(error.response.data)}\n`;
        } else {
            logMessage += `Error: ${error.message}\n`;
        }
    }
    
    logMessage += `=== End Test ===\n`;
    
    // Write to file
    fs.appendFileSync('brain_test_results.txt', logMessage);
    console.log('Test completed. Results written to brain_test_results.txt');
}

testBrainStatus();
