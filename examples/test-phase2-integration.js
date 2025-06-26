/**
 * Phase 2 Integration Test Script
 * This script demonstrates the complete Phase 2 functionality:
 * - Plan Templates
 * - OpenAPI Tool Integration
 * - Combined workflows using both
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const ENGINEER_URL = process.env.ENGINEER_URL || 'http://localhost:5050';
const CAPABILITIES_MANAGER_URL = process.env.CAPABILITIES_MANAGER_URL || 'http://localhost:5060';
const AUTH_TOKEN = process.env.CM_AUTH_TOKEN || 'your-auth-token-here';

// Create authenticated axios instances
const engineerApi = axios.create({
    baseURL: ENGINEER_URL,
    headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

const capabilitiesApi = axios.create({
    baseURL: CAPABILITIES_MANAGER_URL,
    headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

async function testPhase2Integration() {
    console.log('🚀 Testing Phase 2 Integration: Plan Templates + OpenAPI Tools...\n');

    try {
        // Step 1: Register OpenAPI tool
        console.log('1. Registering OpenAPI Weather Tool...');
        const weatherToolData = JSON.parse(fs.readFileSync(
            path.join(__dirname, 'openapi-tools', 'weather-api-tool.json'), 
            'utf8'
        ));

        const registerResponse = await engineerApi.post('/tools/openapi', weatherToolData);
        console.log('✅ Weather API tool registered:', registerResponse.data.success ? 'Success' : 'Failed');

        if (!registerResponse.data.success) {
            console.log('❌ Registration failed:', registerResponse.data.errors);
            console.log('⚠️  Continuing with existing tools...');
        }

        // Step 2: Create plan template that uses the OpenAPI tool
        console.log('\n2. Creating Weather Research Plan Template...');
        const templateData = JSON.parse(fs.readFileSync(
            path.join(__dirname, 'plan-templates', 'weather-research-template.json'), 
            'utf8'
        ));

        const createTemplateResponse = await capabilitiesApi.post('/plans', templateData);
        console.log('✅ Plan template created:', createTemplateResponse.data);
        const templateId = createTemplateResponse.data.templateId;

        // Step 3: List all capabilities to show integration
        console.log('\n3. Listing all system capabilities...');
        const capabilitiesResponse = await capabilitiesApi.get('/capabilities');
        console.log('✅ Total capabilities:', capabilitiesResponse.data.count);
        console.log('Breakdown:', capabilitiesResponse.data.breakdown);

        // Show examples of each type
        const capabilities = capabilitiesResponse.data.capabilities;
        const plugins = capabilities.filter(c => c.type === 'plugin').slice(0, 3);
        const openApiTools = capabilities.filter(c => c.type === 'openapi').slice(0, 3);
        const templates = capabilities.filter(c => c.type === 'template').slice(0, 3);

        console.log('\nSample Plugins:', plugins.map(p => p.actionVerb));
        console.log('Sample OpenAPI Tools:', openApiTools.map(t => t.actionVerb));
        console.log('Sample Templates:', templates.map(t => t.name));

        // Step 4: Execute the integrated plan template
        console.log('\n4. Executing Weather Research Plan Template...');
        const executionRequest = {
            templateId: templateId,
            inputs: {
                location: "Tokyo,JP",
                analysis_focus: "travel planning"
            },
            userId: "test-user",
            executionMode: "automatic"
        };

        const executeResponse = await capabilitiesApi.post(`/plans/${templateId}/execute`, executionRequest);
        console.log('✅ Plan execution started:', executeResponse.data);
        const executionId = executeResponse.data.executionId;

        // Step 5: Monitor execution progress
        console.log('\n5. Monitoring execution progress...');
        let completed = false;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;

            try {
                const statusResponse = await capabilitiesApi.get(`/executions/${executionId}`);
                const status = statusResponse.data.status;
                const completedSteps = statusResponse.data.steps?.filter(s => s.status === 'completed').length || 0;
                const totalSteps = statusResponse.data.steps?.length || 0;

                console.log(`   Status: ${status} (${completedSteps}/${totalSteps} steps completed) - attempt ${attempts}/${maxAttempts}`);

                if (status === 'completed') {
                    completed = true;
                    console.log('\n✅ Execution completed successfully!');
                    console.log('\n📊 Final Results:');
                    console.log('Weather Data:', JSON.stringify(statusResponse.data.outputs.weather_data, null, 2));
                    console.log('\nAnalysis:', statusResponse.data.outputs.analysis);
                    console.log('\nRecommendations:', statusResponse.data.outputs.recommendations);
                    
                    // Show step details
                    console.log('\n📋 Step Execution Details:');
                    for (const step of statusResponse.data.steps) {
                        console.log(`- ${step.taskId}: ${step.status} (${step.endTime ? 'completed' : 'in progress'})`);
                        if (step.error) {
                            console.log(`  Error: ${step.error}`);
                        }
                    }
                } else if (status === 'failed') {
                    completed = true;
                    console.log('\n❌ Execution failed!');
                    console.log('Error details:', JSON.stringify(statusResponse.data, null, 2));
                }
            } catch (error) {
                console.log(`   Error checking status: ${error.message}`);
            }
        }

        if (!completed) {
            console.log('\n⚠️  Execution timeout - final status check...');
            try {
                const finalStatusResponse = await capabilitiesApi.get(`/executions/${executionId}`);
                console.log('Final status:', finalStatusResponse.data.status);
                console.log('Steps completed:', finalStatusResponse.data.steps?.filter(s => s.status === 'completed').length || 0);
            } catch (error) {
                console.log('Could not get final status:', error.message);
            }
        }

        // Step 6: Test direct action verb execution
        console.log('\n6. Testing direct action verb execution...');
        try {
            const directActionResponse = await capabilitiesApi.post('/executeAction', {
                actionVerb: 'GET_CURRENT_WEATHER',
                inputs: {
                    q: 'New York,US',
                    units: 'metric'
                }
            });
            console.log('✅ Direct OpenAPI action executed successfully!');
            console.log('Weather for New York:', directActionResponse.data);
        } catch (actionError) {
            console.log('⚠️  Direct action execution failed:', actionError.response?.data?.error || actionError.message);
            if (actionError.response?.status === 404) {
                console.log('💡 This is expected if the OpenAPI tool registration failed or action verb is not found');
            }
        }

        console.log('\n🎉 Phase 2 Integration testing completed!');
        console.log('\n📈 Summary of Phase 2 Capabilities:');
        console.log('✅ Plan Templates - Create reusable workflow definitions');
        console.log('✅ OpenAPI Integration - Automatically integrate external APIs');
        console.log('✅ Combined Workflows - Chain OpenAPI calls with AI analysis');
        console.log('✅ Unified Capability Discovery - Single endpoint for all capabilities');
        console.log('✅ Dynamic Action Resolution - Automatic routing to appropriate handlers');

    } catch (error) {
        console.error('❌ Error during integration testing:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.log('💡 Tip: Make sure you have a valid AUTH_TOKEN set');
        }
    }
}

// Helper function to check if services are running
async function checkServices() {
    const services = [
        { name: 'Engineer', api: engineerApi, url: ENGINEER_URL },
        { name: 'CapabilitiesManager', api: capabilitiesApi, url: CAPABILITIES_MANAGER_URL }
    ];

    for (const service of services) {
        try {
            await service.api.get('/health');
            console.log(`✅ ${service.name} service is running`);
        } catch (error) {
            console.error(`❌ ${service.name} service is not accessible:`, error.message);
            console.log(`💡 Make sure the ${service.name} service is running on ${service.url}`);
            return false;
        }
    }

    return true;
}

// Main execution
async function main() {
    console.log('Phase 2 Integration Test Script');
    console.log('===============================\n');

    // Check if services are running
    const servicesOk = await checkServices();
    if (!servicesOk) {
        process.exit(1);
    }

    // Run integration tests
    await testPhase2Integration();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testPhase2Integration, checkServices };
