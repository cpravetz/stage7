/**
 * Script to rebuild the SecurityManager service using JavaScript
 */

const { execSync } = require('child_process');

console.log('Rebuilding SecurityManager service with JavaScript...');

try {
    // Stop the container
    console.log('Stopping the container...');
    execSync('docker compose stop securitymanager', { stdio: 'inherit' });
    
    // Rebuild the container
    console.log('Rebuilding the container...');
    execSync('docker compose build securitymanager', { stdio: 'inherit' });
    
    // Start the container
    console.log('Starting the container...');
    execSync('docker compose up -d securitymanager', { stdio: 'inherit' });
    
    console.log('SecurityManager service has been rebuilt and restarted successfully!');
} catch (error) {
    console.error('Error rebuilding SecurityManager service:', error.message);
    process.exit(1);
}
