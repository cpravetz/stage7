const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure the dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Run TypeScript compiler with --noEmitOnError=false
try {
  console.log('Building missioncontrol service...');
  execSync('tsc --noEmitOnError=false', { stdio: 'inherit' });
  console.log('Build completed successfully');
} catch (error) {
  console.error('Build failed with errors:', error);
  process.exit(1);
}
