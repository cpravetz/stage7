/**
 * Test script for OpenAPI Tool functionality
 * This script demonstrates how to register and execute OpenAPI tools
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

async function testOpenAPITools() {
    console.log('🚀 Testing OpenAPI Tool functionality...\n');

    try {
        // 1. Register an OpenAPI tool
        console.log('1. Registering OpenAPI tool...');
        const toolData = JSON.parse(fs.readFileSync(
            path.join(__dirname, 'openapi-tools', 'weather-api-tool.json'), 
            'utf8'
        ));

        const registerResponse = await engineerApi.post('/tools/openapi', toolData);
        console.log('✅ OpenAPI tool registered:', registerResponse.data);

        if (!registerResponse.data.success) {
            console.log('❌ Registration failed:', registerResponse.data.errors);
            return;
        }

        const toolId = registerResponse.data.tool?.id;
        if (!toolId) {
            console.log('❌ No tool ID returned from registration');
            return;
        }

        // 2. List OpenAPI tools
        console.log('\n2. Listing OpenAPI tools...');
        const listResponse = await capabilitiesApi.get('/tools/openapi');
        console.log('✅ OpenAPI tools found:', listResponse.data.count);
        console.log('Tools:', listResponse.data.tools.map(t => ({ id: t.id, name: t.name })));

        // 3. Get specific OpenAPI tool
        console.log('\n3. Getting specific OpenAPI tool...');
        const getResponse = await capabilitiesApi.get(`/tools/openapi/${toolId}`);
        console.log('✅ Retrieved tool:', getResponse.data.name);
        console.log('Action mappings:', getResponse.data.actionMappings.map(m => m.actionVerb));

        // 4. Test capabilities listing (should include OpenAPI tools)
        console.log('\n4. Testing capabilities listing...');
        const capabilitiesResponse = await capabilitiesApi.get('/capabilities');
        console.log('✅ Total capabilities found:', capabilitiesResponse.data.count);
        console.log('Breakdown:', capabilitiesResponse.data.breakdown);

        const openApiCapabilities = capabilitiesResponse.data.capabilities.filter(c => c.type === 'openapi');
        console.log('OpenAPI capabilities:', openApiCapabilities.map(c => ({ 
            actionVerb: c.actionVerb, 
            description: c.description 
        })));

        // 5. Execute OpenAPI tool (if we have a valid API key)
        console.log('\n5. Testing OpenAPI tool execution...');
        if (process.env.OPENWEATHER_API_KEY) {
            try {
                const executeResponse = await capabilitiesApi.post(`/tools/openapi/${toolId}/execute`, {
                    actionVerb: 'GET_CURRENT_WEATHER',
                    inputs: {
                        q: 'London,UK',
                        units: 'metric'
                    }
                });
                console.log('✅ OpenAPI tool executed successfully!');
                console.log('Weather data:', JSON.stringify(executeResponse.data.outputs, null, 2));
            } catch (executeError) {
                console.log('⚠️  OpenAPI tool execution failed (expected if no API key):', executeError.response?.data?.error || executeError.message);
            }
        } else {
            console.log('⚠️  Skipping execution test - no OPENWEATHER_API_KEY environment variable set');
            console.log('💡 Set OPENWEATHER_API_KEY to test actual API calls');
        }

        // 6. Test action verb resolution
        console.log('\n6. Testing action verb resolution...');
        try {
            const actionResponse = await capabilitiesApi.post('/executeAction', {
                actionVerb: 'GET_CURRENT_WEATHER',
                inputs: {
                    q: 'Paris,FR',
                    units: 'metric'
                }
            });
            console.log('✅ Action verb resolved and executed via OpenAPI tool!');
            console.log('Result:', actionResponse.data);
        } catch (actionError) {
            console.log('⚠️  Action execution failed (expected if no API key):', actionError.response?.data?.error || actionError.message);
        }

        console.log('\n🎉 OpenAPI tool testing completed successfully!');

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
        const engineerResponse = await engineerApi.get('/health');
        console.log('✅ Engineer service is running');
    } catch (error) {
        console.error('❌ Engineer service is not accessible:', error.message);
        console.log('💡 Make sure the Engineer service is running on', ENGINEER_URL);
        return false;
    }

    try {
        const capabilitiesResponse = await capabilitiesApi.get('/health');
        console.log('✅ CapabilitiesManager service is running');
    } catch (error) {
        console.error('❌ CapabilitiesManager service is not accessible:', error.message);
        console.log('💡 Make sure the CapabilitiesManager service is running on', CAPABILITIES_MANAGER_URL);
        return false;
    }

    return true;
}

// Main execution
async function main() {
    console.log('OpenAPI Tool Test Script');
    console.log('========================\n');

    // Check if services are running
    const servicesOk = await checkServices();
    if (!servicesOk) {
        process.exit(1);
    }

    // Run tests
    await testOpenAPITools();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testOpenAPITools, checkServices };
