/**
 * Script to build and restart the SecurityManager service
 */

const { execSync } = require('child_process');

console.log('Building and restarting SecurityManager service...');

try {
    // Install dependencies
    console.log('Installing dependencies...');
    execSync('docker compose exec securitymanager npm install oauth2-server express-oauth-server', { stdio: 'inherit' });
    execSync('docker compose exec securitymanager npm install -g typescript', { stdio: 'inherit' });
    execSync('docker compose exec securitymanager npm install --save-dev @types/express @types/oauth2-server', { stdio: 'inherit' });

    // Copy files to the container
    console.log('Copying files to the container...');
    execSync('docker compose cp services/security/src/oauth securitymanager:/usr/src/app/services/security/src/', { stdio: 'inherit' });

    // Copy JavaScript files to dist directory
    console.log('Copying JavaScript files to dist directory...');
    execSync('docker compose exec securitymanager mkdir -p /usr/src/app/services/security/dist/oauth', { stdio: 'inherit' });
    execSync('docker compose cp services/security/src/oauth/model.js securitymanager:/usr/src/app/services/security/dist/oauth/', { stdio: 'inherit' });
    execSync('docker compose cp services/security/src/oauth/server.js securitymanager:/usr/src/app/services/security/dist/oauth/', { stdio: 'inherit' });
    execSync('docker compose cp services/security/src/oauth/compatibility.js securitymanager:/usr/src/app/services/security/dist/oauth/', { stdio: 'inherit' });
    execSync('docker compose cp services/security/src/SecurityManager.js securitymanager:/usr/src/app/services/security/dist/', { stdio: 'inherit' });

    // Restart the service
    console.log('Restarting the service...');
    execSync('docker compose restart securitymanager', { stdio: 'inherit' });

    console.log('SecurityManager service has been built and restarted successfully!');
} catch (error) {
    console.error('Error building and restarting SecurityManager service:', error.message);
    process.exit(1);
}
