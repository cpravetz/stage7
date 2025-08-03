const axios = require('axios');
const fs = require('fs');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    capabilitiesManagerUrl: 'http://localhost:5060',
    componentType: 'MissionControl',
    clientSecret: process.env.CLIENT_SECRET || 'stage7AuthSecret'
};

async function testNovelVerbHandling() {
    const timestamp = new Date().toISOString();
    let logMessage = `\n=== Novel Verb Test at ${timestamp} ===\n`;
    
    try {
        console.log('Testing Novel ActionVerb Handling...');
        logMessage += 'Testing Novel ActionVerb Handling...\n';
        
        // Get authentication token first
        console.log('Getting authentication token...');
        logMessage += 'Getting authentication token...\n';
        
        const authResponse = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
            componentType: CONFIG.componentType,
            clientSecret: CONFIG.clientSecret
        });
        
        if (!authResponse.data.authenticated || !authResponse.data.token) {
            throw new Error('Authentication failed');
        }
        
        const token = authResponse.data.token;
        console.log('Authentication successful!');
        logMessage += 'Authentication successful!\n';
        
        // Test a novel actionVerb that doesn't exist in the plugin registry
        const requestData = {
            actionVerb: 'ANALYZE_SENTIMENT',
            inputValues: {
                text: {
                    value: 'I love this new feature! It works amazingly well.',
                    valueType: 'string'
                }
            },
            outputs: {
                sentiment: 'The detected sentiment (positive, negative, or neutral)',
                confidence: 'Confidence score between 0 and 1'
            },
            stepNo: 1,
            id: 'test-novel-verb-step',
            description: 'Analyze the sentiment of the given text and return positive, negative, or neutral'
        };
        
        console.log('Sending novel actionVerb request...');
        logMessage += 'Sending novel actionVerb request...\n';
        logMessage += `Request data: ${JSON.stringify(requestData, null, 2)}\n`;
        
        const response = await axios.post(`${CONFIG.capabilitiesManagerUrl}/executeAction`, requestData, {
            timeout: 120000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('✅ Novel ActionVerb Response Status:', response.status);
        console.log('✅ Novel ActionVerb Response Data:', JSON.stringify(response.data, null, 2));
        
        logMessage += `✅ Novel ActionVerb Response Status: ${response.status}\n`;
        logMessage += `✅ Novel ActionVerb Response Data: ${JSON.stringify(response.data, null, 2)}\n`;
        
        // Check if the response indicates successful novel verb handling
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            const result = response.data[0];
            if (result.success) {
                console.log('🎯 Novel ActionVerb handling SUCCESS!');
                logMessage += '🎯 Novel ActionVerb handling SUCCESS!\n';
                logMessage += `Result Type: ${result.resultType}\n`;
                logMessage += `Result Description: ${result.resultDescription}\n`;
            } else {
                console.log('❌ Novel ActionVerb handling failed:', result.resultDescription);
                logMessage += `❌ Novel ActionVerb handling failed: ${result.resultDescription}\n`;
            }
        } else {
            console.log('❌ No response data received or unexpected format');
            logMessage += '❌ No response data received or unexpected format\n';
        }
        
    } catch (error) {
        const errorMsg = `❌ Novel ActionVerb test failed: ${error.message}`;
        console.log(errorMsg);
        logMessage += errorMsg + '\n';
        
        if (error.response) {
            const statusMsg = `Status: ${error.response.status}`;
            const dataMsg = `Data: ${JSON.stringify(error.response.data, null, 2)}`;
            console.log(statusMsg);
            console.log(dataMsg);
            logMessage += statusMsg + '\n';
            logMessage += dataMsg + '\n';
        }
    }
    
    logMessage += `=== End Test ===\n`;
    
    // Write to file
    fs.appendFileSync('novel_verb_test_results_simple.txt', logMessage);
    console.log('Test completed. Results written to novel_verb_test_results_simple.txt');
}

testNovelVerbHandling();
