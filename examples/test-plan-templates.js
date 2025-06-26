/**
 * Test script for Plan Template functionality
 * This script demonstrates how to create, list, and execute plan templates
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CAPABILITIES_MANAGER_URL = process.env.CAPABILITIES_MANAGER_URL || 'http://localhost:5060';
const AUTH_TOKEN = process.env.CM_AUTH_TOKEN || 'your-auth-token-here';

// Create authenticated axios instance
const api = axios.create({
    baseURL: CAPABILITIES_MANAGER_URL,
    headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

async function testPlanTemplates() {
    console.log('🚀 Testing Plan Template functionality...\n');

    try {
        // 1. Create a plan template
        console.log('1. Creating plan template...');
        const templateData = JSON.parse(fs.readFileSync(
            path.join(__dirname, 'plan-templates', 'web-research-template.json'), 
            'utf8'
        ));

        const createResponse = await api.post('/plans', templateData);
        console.log('✅ Plan template created:', createResponse.data);
        const templateId = createResponse.data.templateId;

        // 2. List plan templates
        console.log('\n2. Listing plan templates...');
        const listResponse = await api.get('/plans');
        console.log('✅ Plan templates found:', listResponse.data.count);
        console.log('Templates:', listResponse.data.templates.map(t => ({ id: t.id, name: t.name })));

        // 3. Get specific plan template
        console.log('\n3. Getting specific plan template...');
        const getResponse = await api.get(`/plans/${templateId}`);
        console.log('✅ Retrieved template:', getResponse.data.name);

        // 4. Execute plan template
        console.log('\n4. Executing plan template...');
        const executionRequest = {
            templateId: templateId,
            inputs: {
                topic: "artificial intelligence trends 2024",
                max_sources: 3
            },
            userId: "test-user",
            executionMode: "automatic"
        };

        const executeResponse = await api.post(`/plans/${templateId}/execute`, executionRequest);
        console.log('✅ Plan execution started:', executeResponse.data);
        const executionId = executeResponse.data.executionId;

        // 5. Monitor execution
        console.log('\n5. Monitoring execution...');
        let completed = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;

            try {
                const statusResponse = await api.get(`/executions/${executionId}`);
                const status = statusResponse.data.status;
                console.log(`   Status: ${status} (attempt ${attempts}/${maxAttempts})`);

                if (status === 'completed' || status === 'failed') {
                    completed = true;
                    console.log('✅ Execution completed!');
                    console.log('Final result:', JSON.stringify(statusResponse.data, null, 2));
                }
            } catch (error) {
                console.log(`   Error checking status: ${error.message}`);
            }
        }

        if (!completed) {
            console.log('⚠️  Execution timeout - check execution status manually');
        }

        // 6. List executions
        console.log('\n6. Listing executions...');
        const executionsResponse = await api.get('/executions');
        console.log('✅ Executions found:', executionsResponse.data.count);

        // 7. Search plan templates
        console.log('\n7. Searching plan templates...');
        const searchResponse = await api.get('/plans?search=research');
        console.log('✅ Search results:', searchResponse.data.count);

        console.log('\n🎉 Plan template testing completed successfully!');

    } catch (error) {
        console.error('❌ Error during testing:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.log('💡 Tip: Make sure you have a valid AUTH_TOKEN set');
        }
    }
}

// Helper function to check if services are running
async function checkServices() {
    try {
        const response = await api.get('/health');
        console.log('✅ CapabilitiesManager is running');
        return true;
    } catch (error) {
        console.error('❌ CapabilitiesManager is not accessible:', error.message);
        console.log('💡 Make sure the CapabilitiesManager service is running on', CAPABILITIES_MANAGER_URL);
        return false;
    }
}

// Main execution
async function main() {
    console.log('Plan Template Test Script');
    console.log('========================\n');

    // Check if services are running
    const servicesOk = await checkServices();
    if (!servicesOk) {
        process.exit(1);
    }

    // Run tests
    await testPlanTemplates();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testPlanTemplates, checkServices };
