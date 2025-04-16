/**
 * Script to regenerate all RSA keys for the Stage7 system
 * This script should be run after removing any compromised keys
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('SECURITY ALERT: Regenerating all RSA keys for the Stage7 system');
console.log('This script will regenerate all keys used for authentication and plugin signing');
console.log('Any existing keys will be overwritten');

// Ensure the security service is running
try {
    console.log('\nChecking if the SecurityManager service is running...');
    const ps = execSync('docker compose ps securitymanager').toString();
    if (!ps.includes('Up')) {
        console.log('SecurityManager service is not running. Starting it...');
        execSync('docker compose up -d securitymanager', { stdio: 'inherit' });
        console.log('Waiting for SecurityManager service to start...');
        // Wait for the service to start
        execSync('sleep 5');
    } else {
        console.log('SecurityManager service is running');
    }
} catch (error) {
    console.error('Error checking SecurityManager service status:', error.message);
    console.log('Please ensure the SecurityManager service is running before continuing');
    process.exit(1);
}

// Remove existing keys
try {
    console.log('\nRemoving existing keys...');
    // Create the keys directory if it doesn't exist
    const keysDir = path.join(__dirname, 'services', 'security', 'keys');
    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }
    
    // Remove all files in the keys directory
    const files = fs.readdirSync(keysDir);
    for (const file of files) {
        const filePath = path.join(keysDir, file);
        if (fs.lstatSync(filePath).isDirectory()) {
            // Remove all files in subdirectories
            const subFiles = fs.readdirSync(filePath);
            for (const subFile of subFiles) {
                fs.unlinkSync(path.join(filePath, subFile));
            }
            // Remove the subdirectory
            fs.rmdirSync(filePath);
        } else {
            // Remove the file
            fs.unlinkSync(filePath);
        }
    }
    console.log('Existing keys removed');
} catch (error) {
    console.error('Error removing existing keys:', error.message);
    console.log('Please remove the keys manually before continuing');
    process.exit(1);
}

// Generate new keys
try {
    console.log('\nGenerating new keys...');
    execSync('docker compose exec securitymanager node src/scripts/generate-keys.js', { stdio: 'inherit' });
    console.log('New keys generated successfully');
} catch (error) {
    console.error('Error generating new keys:', error.message);
    process.exit(1);
}

// Restart services to use the new keys
try {
    console.log('\nRestarting services to use the new keys...');
    execSync('docker compose restart', { stdio: 'inherit' });
    console.log('Services restarted successfully');
} catch (error) {
    console.error('Error restarting services:', error.message);
    process.exit(1);
}

console.log('\nKey regeneration completed successfully');
console.log('IMPORTANT: The previous keys should be considered compromised');
console.log('If these keys were used in production, please rotate all affected credentials immediately');
