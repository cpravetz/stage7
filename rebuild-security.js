/**
 * Script to rebuild the SecurityManager service
 */

const { execSync } = require('child_process');

console.log('Rebuilding SecurityManager service...');

try {
    // Stop the container
    console.log('Stopping the container...');
    execSync('docker compose stop securitymanager', { stdio: 'inherit' });

    // Copy the JavaScript version of the SecurityManager
    console.log('Copying the JavaScript version of the SecurityManager...');
    execSync('docker compose cp services/security/src/SecurityManager.js securitymanager:/usr/src/app/services/security/dist/', { stdio: 'inherit' });

    // Start the container
    console.log('Starting the container...');
    execSync('docker compose up -d securitymanager', { stdio: 'inherit' });

    console.log('SecurityManager service has been rebuilt and restarted successfully!');
} catch (error) {
    console.error('Error rebuilding SecurityManager service:', error.message);
    process.exit(1);
}
