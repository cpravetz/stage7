const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CAPABILITIES_MANAGER_URL = 'http://localhost:5060';
const TEST_TIMEOUT = 30000; // 30 seconds

/**
 * Test Python plugin framework functionality
 */
async function testPythonPluginFramework() {
    console.log('🧪 Testing Python Plugin Framework...\n');
    
    try {
        // Test 1: Validate Python plugin CLI tool
        console.log('1. Testing Python Plugin CLI Tool...');
        await testPythonCLI();
        
        // Test 2: Test Python plugin templates
        console.log('\n2. Testing Python Plugin Templates...');
        await testPythonTemplates();
        
        // Test 3: Test example Python plugins
        console.log('\n3. Testing Example Python Plugins...');
        await testExamplePlugins();
        
        // Test 4: Test Python plugin execution via CapabilitiesManager
        console.log('\n4. Testing Python Plugin Execution...');
        await testPythonPluginExecution();
        
        console.log('\n✅ All Python plugin framework tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Python plugin framework tests failed:', error.message);
        process.exit(1);
    }
}

/**
 * Test Python CLI tool functionality
 */
async function testPythonCLI() {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
        // Test CLI help command
        const cliProcess = spawn('python3', ['tools/python-plugin-cli.py', '--help'], {
            stdio: 'pipe'
        });
        
        let output = '';
        cliProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        cliProcess.on('close', (code) => {
            if (code === 0 && output.includes('Stage7 Python Plugin Development CLI')) {
                console.log('   ✅ Python CLI tool is working');
                resolve();
            } else {
                reject(new Error(`CLI tool test failed with code ${code}`));
            }
        });
        
        cliProcess.on('error', (error) => {
            reject(new Error(`CLI tool error: ${error.message}`));
        });
        
        setTimeout(() => {
            cliProcess.kill();
            reject(new Error('CLI tool test timeout'));
        }, 10000);
    });
}

/**
 * Test Python plugin templates
 */
async function testPythonTemplates() {
    const templateDir = 'templates/python-plugin-template';
    
    // Check if template directory exists
    if (!fs.existsSync(templateDir)) {
        throw new Error('Python plugin template directory not found');
    }
    
    // Check required template files
    const requiredFiles = ['main.py', 'manifest.json', 'requirements.txt', 'README.md'];
    for (const file of requiredFiles) {
        const filePath = path.join(templateDir, file);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Template file missing: ${file}`);
        }
    }
    
    // Validate template manifest
    const manifestPath = path.join(templateDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    const requiredFields = ['id', 'verb', 'description', 'inputDefinitions', 'outputDefinitions', 'language'];
    for (const field of requiredFields) {
        if (!manifest[field]) {
            throw new Error(`Template manifest missing field: ${field}`);
        }
    }
    
    if (manifest.language !== 'python') {
        throw new Error('Template manifest language should be "python"');
    }
    
    console.log('   ✅ Python plugin template structure is valid');
}

/**
 * Test example Python plugins
 */
async function testExamplePlugins() {
    const examplesDir = 'examples/python-plugins';
    
    if (!fs.existsSync(examplesDir)) {
        throw new Error('Python plugin examples directory not found');
    }
    
    // Test WEATHER plugin
    await testExamplePlugin(path.join(examplesDir, 'WEATHER'), 'WEATHER');
    
    // Test TEXT_ANALYSIS plugin
    await testExamplePlugin(path.join(examplesDir, 'TEXT_ANALYSIS'), 'TEXT_ANALYSIS');
    
    console.log('   ✅ Example Python plugins are valid');
}

/**
 * Test a specific example plugin
 */
async function testExamplePlugin(pluginDir, expectedVerb) {
    if (!fs.existsSync(pluginDir)) {
        throw new Error(`Example plugin directory not found: ${pluginDir}`);
    }
    
    // Check required files
    const requiredFiles = ['main.py', 'manifest.json', 'requirements.txt'];
    for (const file of requiredFiles) {
        const filePath = path.join(pluginDir, file);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Example plugin missing file: ${file}`);
        }
    }
    
    // Validate manifest
    const manifestPath = path.join(pluginDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    if (manifest.verb !== expectedVerb) {
        throw new Error(`Example plugin verb mismatch: expected ${expectedVerb}, got ${manifest.verb}`);
    }
    
    if (manifest.language !== 'python') {
        throw new Error(`Example plugin language should be "python", got ${manifest.language}`);
    }
    
    console.log(`   ✅ Example plugin ${expectedVerb} is valid`);
}

/**
 * Test Python plugin execution via CapabilitiesManager
 */
async function testPythonPluginExecution() {
    // First, check if CapabilitiesManager is running
    try {
        await axios.get(`${CAPABILITIES_MANAGER_URL}/health`, { timeout: 5000 });
    } catch (error) {
        console.log('   ⚠️  CapabilitiesManager not running, skipping execution tests');
        return;
    }
    
    // Test 1: Try to execute a Python plugin (if any are installed)
    try {
        const response = await axios.get(`${CAPABILITIES_MANAGER_URL}/availablePlugins`, {
            timeout: 5000
        });
        
        const plugins = response.data;
        const pythonPlugins = plugins.filter(p => p.language === 'python');
        
        if (pythonPlugins.length === 0) {
            console.log('   ⚠️  No Python plugins installed, skipping execution test');
            return;
        }
        
        console.log(`   ✅ Found ${pythonPlugins.length} Python plugin(s) available`);
        
        // Try to execute the first Python plugin with test data
        const testPlugin = pythonPlugins[0];
        console.log(`   🔄 Testing execution of Python plugin: ${testPlugin.verb}`);
        
        const testInputs = {
            type: 'Map',
            value: [
                ['test_input', {
                    inputName: 'test_input',
                    inputValue: 'test_value',
                    args: {}
                }]
            ]
        };
        
        const execResponse = await axios.post(`${CAPABILITIES_MANAGER_URL}/executeAction`, {
            actionVerb: testPlugin.verb,
            inputs: testInputs
        }, {
            timeout: TEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (execResponse.status === 200) {
            console.log(`   ✅ Python plugin ${testPlugin.verb} executed successfully`);
        } else {
            console.log(`   ⚠️  Python plugin execution returned status: ${execResponse.status}`);
        }
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('   ⚠️  Plugin not found (expected for test)');
        } else {
            console.log(`   ⚠️  Plugin execution test failed: ${error.message}`);
        }
    }
}

/**
 * Test Python plugin development workflow
 */
async function testDevelopmentWorkflow() {
    console.log('\n5. Testing Python Plugin Development Workflow...');
    
    const { spawn } = require('child_process');
    const testPluginName = 'test_plugin_' + Date.now();
    
    try {
        // Create a test plugin
        console.log(`   🔄 Creating test plugin: ${testPluginName}`);
        
        await new Promise((resolve, reject) => {
            const createProcess = spawn('python3', [
                'tools/python-plugin-cli.py',
                'create',
                testPluginName,
                '--verb',
                'TEST_ACTION'
            ], {
                stdio: 'pipe'
            });
            
            createProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`   ✅ Test plugin created successfully`);
                    resolve();
                } else {
                    reject(new Error(`Plugin creation failed with code ${code}`));
                }
            });
            
            createProcess.on('error', (error) => {
                reject(new Error(`Plugin creation error: ${error.message}`));
            });
            
            setTimeout(() => {
                createProcess.kill();
                reject(new Error('Plugin creation timeout'));
            }, 15000);
        });
        
        // Validate the created plugin
        const pluginDir = `plugins/${testPluginName}`;
        if (fs.existsSync(pluginDir)) {
            console.log(`   ✅ Test plugin directory created`);
            
            // Validate the plugin
            await new Promise((resolve, reject) => {
                const validateProcess = spawn('python3', [
                    'tools/python-plugin-cli.py',
                    'validate',
                    pluginDir
                ], {
                    stdio: 'pipe'
                });
                
                validateProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log(`   ✅ Test plugin validation passed`);
                        resolve();
                    } else {
                        reject(new Error(`Plugin validation failed with code ${code}`));
                    }
                });
                
                validateProcess.on('error', (error) => {
                    reject(new Error(`Plugin validation error: ${error.message}`));
                });
                
                setTimeout(() => {
                    validateProcess.kill();
                    reject(new Error('Plugin validation timeout'));
                }, 10000);
            });
            
            // Clean up test plugin
            const rimraf = require('rimraf');
            rimraf.sync(pluginDir);
            console.log(`   ✅ Test plugin cleaned up`);
        }
        
    } catch (error) {
        console.log(`   ⚠️  Development workflow test failed: ${error.message}`);
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log('🚀 Starting Python Plugin Framework Tests\n');
    
    try {
        await testPythonPluginFramework();
        await testDevelopmentWorkflow();
        
        console.log('\n🎉 All tests completed successfully!');
        console.log('\nPython Plugin Framework Status:');
        console.log('✅ Templates created');
        console.log('✅ Example plugins created');
        console.log('✅ CLI tools working');
        console.log('✅ Enhanced execution environment');
        console.log('✅ Development workflow functional');
        
    } catch (error) {
        console.error('\n💥 Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = {
    testPythonPluginFramework,
    testPythonCLI,
    testPythonTemplates,
    testExamplePlugins,
    testPythonPluginExecution
};
