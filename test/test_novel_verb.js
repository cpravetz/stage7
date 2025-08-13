const axios = require('axios');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    capabilitiesManagerUrl: 'http://localhost:5060',
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
            console.log('Authentication successful!');
            return response.data.token;
        } else {
            console.error('Authentication failed:', response.data);
            return null;
        }
    } catch (error) {
        console.error('Authentication error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

async function testNovelVerbHandling() {
    console.log('Testing Novel ActionVerb Handling...');

    try {
        // Get authentication token first
        const token = await getAuthToken();
        if (!token) {
            console.log('❌ Failed to get authentication token');
            return;
        }

        // Test a novel actionVerb that doesn't exist in the plugin registry
        const step = {
            actionVerb: 'ANALYZE_SENTIMENT',
            description: 'Analyze the sentiment of the given text and return positive, negative, or neutral',
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
            id: 'test-novel-verb-step'
        };

        console.log('Sending novel actionVerb request:', JSON.stringify(step, null, 2));

        const response = await axios.post(`${CONFIG.capabilitiesManagerUrl}/executeAction`, {
            actionVerb: step.actionVerb,
            inputValues: step.inputValues,
            outputs: step.outputs,
            description: step.description,
            stepNo: step.stepNo,
            id: step.id
        }, {
            timeout: 120000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const logMessage = `✅ Novel ActionVerb Response Status: ${response.status}\n✅ Novel ActionVerb Response Data: ${JSON.stringify(response.data, null, 2)}\n`;
        console.log(logMessage);

        // Write to file for debugging
        require('fs').appendFileSync('novel_verb_test_results.txt', `\n=== Novel Verb Test Success ===\n${logMessage}\n`);

        // Check if the response indicates successful novel verb handling
        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            if (result.success) {
                console.log('🎯 Novel ActionVerb handling SUCCESS!');
                console.log('Result Type:', result.resultType);
                console.log('Result Description:', result.resultDescription);

                if (result.resultType === 'direct_answer') {
                    console.log('📝 Brain provided direct answer for novel verb');
                } else if (result.resultType === 'plugin') {
                    console.log('🔧 Brain recommended creating a new plugin');
                } else {
                    console.log('📋 Other result type:', result.resultType);
                }
            } else {
                console.log('❌ Novel ActionVerb handling failed:', result.resultDescription);
            }
        } else {
            console.log('❌ No response data received');
        }

    } catch (error) {
        const errorMessage = `❌ Novel ActionVerb test failed:\nStatus: ${error.response ? error.response.status : 'N/A'}\nData: ${error.response ? JSON.stringify(error.response.data, null, 2) : error.message}\n`;
        console.log(errorMessage);

        // Write to file for debugging
        require('fs').appendFileSync('novel_verb_test_results.txt', `\n=== Novel Verb Test Error ===\n${errorMessage}\n`);
    }
}

testNovelVerbHandling();
