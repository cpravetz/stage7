/**
 * Stage7 Test Runner
 * 
 * This script runs all tests for the Stage7 system.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  testDir: path.join(__dirname, 'test'),
  testTimeout: 60000 // 60 seconds
};

/**
 * Execute a shell command and return the output
 * @param {string} command Command to execute
 * @param {Object} options Options for execSync
 * @returns {string} Command output
 */
function execCommand(command, options = {}) {
  console.log(`Executing: ${command}`);
  try {
    const defaultOptions = { encoding: 'utf8', stdio: 'inherit' };
    const mergedOptions = { ...defaultOptions, ...options };
    return execSync(command, mergedOptions);
  } catch (error) {
    console.error(`Command failed with exit code ${error.status}: ${error.message}`);
    throw error;
  }
}

/**
 * Install test dependencies
 */
function installTestDependencies() {
  console.log('\nInstalling test dependencies...');
  
  try {
    // Check if node_modules exists
    const nodeModulesPath = path.join(CONFIG.testDir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      console.log('Test dependencies already installed');
      return true;
    }
    
    // Install dependencies
    execCommand(`cd ${CONFIG.testDir} && npm install`);
    console.log('Test dependencies installed successfully');
    return true;
  } catch (error) {
    console.error('Failed to install test dependencies:', error);
    return false;
  }
}

/**
 * Run authentication tests
 */
function runAuthTests() {
  console.log('\nRunning authentication tests...');
  
  try {
    execCommand(`cd ${CONFIG.testDir} && npm test`);
    console.log('Authentication tests completed successfully');
    return true;
  } catch (error) {
    console.error('Authentication tests failed:', error);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('Starting Stage7 test runner...');
  
  try {
    // Install test dependencies
    const depsSuccess = installTestDependencies();
    if (!depsSuccess) {
      console.error('Failed to install test dependencies! Aborting tests.');
      process.exit(1);
    }
    
    // Run authentication tests
    const authSuccess = runAuthTests();
    if (!authSuccess) {
      console.error('Authentication tests failed! The system may not be functioning correctly.');
      process.exit(1);
    }
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

// Set a timeout for the entire test suite
const testTimeout = setTimeout(() => {
  console.error('Test suite timed out after', CONFIG.testTimeout, 'ms');
  process.exit(1);
}, CONFIG.testTimeout);

// Run the main function
main();
clearTimeout(testTimeout);
