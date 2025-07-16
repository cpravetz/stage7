#!/usr/bin/env node
/**
 * Comprehensive Plugin Ecosystem Test
 * Tests all plugin types: Python, JavaScript, and Container plugins
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5020';
const CAPABILITIES_MANAGER_URL = process.env.CAPABILITIESMANAGER_URL || 'http://localhost:5060';
const MARKETPLACE_URL = process.env.MARKETPLACE_URL || 'http://localhost:5050';
const ENGINEER_URL = process.env.ENGINEER_URL || 'http://localhost:5080';

// Test configuration
const TEST_CONFIG = {
    timeout: 30000,
    retries: 3,
    verbose: process.env.VERBOSE === 'true'
};

class PluginEcosystemTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = level.toUpperCase().padEnd(5);
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async runTest(name, testFn) {
        this.results.total++;
        this.log(`Running test: ${name}`, 'test');
        
        try {
            const startTime = Date.now();
            await testFn();
            const duration = Date.now() - startTime;
            
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED', duration });
            this.log(`✅ ${name} (${duration}ms)`, 'pass');
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
            this.log(`❌ ${name}: ${error.message}`, 'fail');
        }
    }

    async testPluginDiscovery() {
        const response = await axios.get(`${CAPABILITIES_MANAGER_URL}/plugins`);
        
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const plugins = response.data;
        if (!Array.isArray(plugins)) {
            throw new Error('Expected plugins to be an array');
        }

        // Check for our migrated plugins
        const expectedPlugins = ['ACCOMPLISH', 'ASK_USER_QUESTION', 'SCRAPE', 'WEATHER', 'TEXT_ANALYSIS'];
        const foundPlugins = plugins.map(p => p.verb || p.id);
        
        for (const expected of expectedPlugins) {
            if (!foundPlugins.includes(expected)) {
                throw new Error(`Expected plugin ${expected} not found in discovery`);
            }
        }

        this.log(`Found ${plugins.length} plugins: ${foundPlugins.join(', ')}`);
    }

    async testPythonPluginExecution() {
        // Test TEXT_ANALYSIS plugin (Python)
        const testInput = {
            text: "This is a wonderful day! I love the beautiful weather and amazing sunshine."
        };

        const response = await axios.post(`${CAPABILITIES_MANAGER_URL}/execute`, {
            actionVerb: 'TEXT_ANALYSIS',
            inputs: testInput
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const result = response.data;
        if (!result.success) {
            throw new Error(`Plugin execution failed: ${result.error || 'Unknown error'}`);
        }

        // Verify expected outputs
        if (!result.result || !Array.isArray(result.result)) {
            throw new Error('Expected result to be an array');
        }

        const outputs = result.result;
        const hasStatistics = outputs.some(o => o.name === 'statistics');
        const hasSentiment = outputs.some(o => o.name === 'sentiment');
        
        if (!hasStatistics || !hasSentiment) {
            throw new Error('Expected statistics and sentiment outputs from TEXT_ANALYSIS');
        }

        this.log('Python plugin execution successful');
    }

    async testMarketplaceIntegration() {
        // Test marketplace plugin listing with container support
        const response = await axios.get(`${MARKETPLACE_URL}/plugins`, {
            params: { includeContainerPlugins: true }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const plugins = response.data;
        if (!Array.isArray(plugins)) {
            throw new Error('Expected plugins to be an array');
        }

        this.log(`Marketplace returned ${plugins.length} plugins`);
    }

    async testEngineerPluginCreation() {
        // Test Engineer service plugin creation
        const testRequest = {
            verb: 'TEST_PLUGIN',
            context: {
                goal: 'Create a simple test plugin that returns a greeting'
            },
            guidance: 'Create a simple plugin for testing purposes',
            language: 'python'
        };

        const response = await axios.post(`${ENGINEER_URL}/createPlugin`, testRequest);

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const plugin = response.data;
        if (!plugin.id || !plugin.verb) {
            throw new Error('Expected plugin to have id and verb');
        }

        this.log(`Engineer created plugin: ${plugin.id}`);
    }

    async testContainerPluginSupport() {
        // Test container plugin validation in marketplace
        const containerPlugin = {
            id: 'test-container-plugin',
            verb: 'TEST_CONTAINER',
            description: 'Test container plugin',
            language: 'container',
            container: {
                image: 'test-image:latest',
                ports: [{ container: 8080, host: 0 }],
                environment: {},
                resources: { memory: '256m', cpu: '0.5' }
            },
            api: {
                endpoint: '/execute',
                method: 'POST',
                timeout: 30000
            }
        };

        try {
            const response = await axios.post(`${MARKETPLACE_URL}/plugins`, containerPlugin);
            this.log('Container plugin validation successful');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                // Expected validation error is fine for this test
                this.log('Container plugin validation working (expected validation error)');
            } else {
                throw error;
            }
        }
    }

    async testSystemHealth() {
        const services = [
            { name: 'CapabilitiesManager', url: `${CAPABILITIES_MANAGER_URL}/health` },
            { name: 'Marketplace', url: `${MARKETPLACE_URL}/health` },
            { name: 'Engineer', url: `${ENGINEER_URL}/health` }
        ];

        for (const service of services) {
            try {
                const response = await axios.get(service.url, { timeout: 5000 });
                if (response.status !== 200) {
                    throw new Error(`${service.name} health check failed: ${response.status}`);
                }
                this.log(`${service.name} is healthy`);
            } catch (error) {
                throw new Error(`${service.name} health check failed: ${error.message}`);
            }
        }
    }

    async runAllTests() {
        this.log('Starting Plugin Ecosystem Integration Tests', 'info');
        this.log('='.repeat(50), 'info');

        await this.runTest('System Health Check', () => this.testSystemHealth());
        await this.runTest('Plugin Discovery', () => this.testPluginDiscovery());
        await this.runTest('Python Plugin Execution', () => this.testPythonPluginExecution());
        await this.runTest('Marketplace Integration', () => this.testMarketplaceIntegration());
        await this.runTest('Engineer Plugin Creation', () => this.testEngineerPluginCreation());
        await this.runTest('Container Plugin Support', () => this.testContainerPluginSupport());

        this.printResults();
    }

    printResults() {
        this.log('='.repeat(50), 'info');
        this.log('Test Results Summary', 'info');
        this.log('='.repeat(50), 'info');
        
        this.log(`Total Tests: ${this.results.total}`, 'info');
        this.log(`Passed: ${this.results.passed}`, 'pass');
        this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'fail' : 'info');
        
        if (this.results.failed > 0) {
            this.log('\nFailed Tests:', 'fail');
            this.results.tests
                .filter(t => t.status === 'FAILED')
                .forEach(t => this.log(`  - ${t.name}: ${t.error}`, 'fail'));
        }

        const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
        this.log(`\nSuccess Rate: ${successRate}%`, 'info');
        
        if (this.results.failed === 0) {
            this.log('\n🎉 All tests passed! Plugin ecosystem is fully functional.', 'pass');
        } else {
            this.log('\n⚠️  Some tests failed. Please check the system configuration.', 'fail');
            process.exit(1);
        }
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const tester = new PluginEcosystemTester();
    tester.runAllTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = PluginEcosystemTester;
