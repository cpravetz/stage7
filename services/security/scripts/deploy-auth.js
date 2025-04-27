/**
 * Script to deploy the authentication system
 * This script helps with setting up the authentication system in a new environment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Paths for the keys
const securityKeysDir = path.join(__dirname, '../keys');
const sharedKeysDir = path.join(__dirname, '../../../shared/keys');

// Main function
async function deployAuth() {
  console.log('Deploying authentication system...');
  
  // Step 1: Check if keys exist
  const keysExist = fs.existsSync(path.join(securityKeysDir, 'private.key')) &&
                   fs.existsSync(path.join(sharedKeysDir, 'public.key'));
  
  if (!keysExist) {
    console.log('Keys not found. Generating new keys...');
    execSync('node scripts/generate-keys.js', { stdio: 'inherit' });
  } else {
    console.log('Keys already exist.');
    const answer = await promptYesNo('Do you want to rotate keys? (y/n)');
    
    if (answer) {
      execSync('node scripts/rotate-keys.js', { stdio: 'inherit' });
    }
  }
  
  // Step 2: Check if environment variables are set
  console.log('\nChecking environment variables...');
  const envVars = [
    'SECURITYMANAGER_URL',
    'CLIENT_SECRET',
    'JWT_ALGORITHM',
    'JWT_EXPIRATION'
  ];
  
  const missingVars = [];
  
  for (const envVar of envVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }
  
  if (missingVars.length > 0) {
    console.log(`Missing environment variables: ${missingVars.join(', ')}`);
    console.log('Please set these environment variables in your .env file or docker-compose.yaml file.');
  } else {
    console.log('All required environment variables are set.');
  }
  
  // Step 3: Test the authentication system
  console.log('\nTesting the authentication system...');
  const answer = await promptYesNo('Do you want to run the authentication tests? (y/n)');
  
  if (answer) {
    try {
      execSync('node scripts/test-auth.js', { stdio: 'inherit' });
    } catch (error) {
      console.error('Authentication test failed. Please check the logs for details.');
    }
  }
  
  console.log('\nAuthentication system deployment completed!');
  console.log('Next steps:');
  console.log('1. Make sure all services have access to the public key.');
  console.log('2. Restart all services to use the new keys.');
  console.log('3. Test the authentication system end-to-end.');
  
  rl.close();
}

// Helper function to prompt for yes/no questions
function promptYesNo(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

deployAuth();
