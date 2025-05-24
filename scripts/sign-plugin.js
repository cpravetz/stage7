// scripts/sign-plugin.js
const fs = require('fs').promises;
const path = require('path');

// Adjust the path to the built output of @cktmcs/shared if necessary.
// This assumes 'shared' is a directory at the repo root and 'dist' is its build output.
// If @cktmcs/shared is symlinked in node_modules or resolved differently, this path needs to be robust.
// A common pattern is that the 'main' field in 'shared/package.json' points to the entry JS file.
// For now, let's try to require from a hypothetical 'dist' directory or directly if it's TS that Node can run.
let signPlugin, loadPrivateKey;
try {
    // Attempt to load from a potential 'dist' folder of the shared package
    const sharedDistPath = path.resolve(__dirname, '../shared/dist/security'); // Adjust if structure is different
    signPlugin = require(path.join(sharedDistPath, 'pluginSigning')).signPlugin;
    loadPrivateKey = require(path.join(sharedDistPath, 'keyUtils')).loadPrivateKey;
} catch (e) {
    console.warn("Could not load from shared/dist, trying src (may only work if run with ts-node or similar):", e.message);
    // Fallback for environments where .ts can be required or if keyUtils was placed in src
     try {
        const sharedSrcPath = path.resolve(__dirname, '../shared/src/security');
        signPlugin = require(path.join(sharedSrcPath, 'pluginSigning')).signPlugin; // Assumes pluginSigning.ts can be required
        loadPrivateKey = require(path.join(sharedSrcPath, 'keyUtils')).loadPrivateKey; // Assumes keyUtils.js is in src or also .ts
     } catch (e2) {
         console.error("Failed to load 'signPlugin' or 'loadPrivateKey'. Ensure @cktmcs/shared is built and paths are correct.", e2);
         process.exit(1);
     }
}

async function main() {
    const manifestPathArg = process.argv[2];
    if (!manifestPathArg) {
        console.error('Usage: node scripts/sign-plugin.js <path_to_manifest.json>');
        process.exit(1);
    }

    const manifestPath = path.resolve(manifestPathArg);
    // Default private key path, relative to the script's location's parent (project root)
    const privateKeyPath = path.resolve(__dirname, '../services/security/keys/private.pem'); 

    try {
        console.log(`Attempting to sign manifest: ${manifestPath}`);
        console.log(`Using private key: ${privateKeyPath}`);

        const manifestString = await fs.readFile(manifestPath, 'utf-8');
        let manifest = JSON.parse(manifestString);

        manifest.security = manifest.security || {};
        manifest.security.trust = manifest.security.trust || {};
        
        // Remove old signature before signing
        delete manifest.security.trust.signature;

        const privateKey = await loadPrivateKey(privateKeyPath);
        
        // The signPlugin function from pluginSigning.ts likely expects the manifest object
        // and the private key string.
        const signature = await signPlugin(manifest, privateKey); 

        manifest.security.trust.signature = signature;

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`Plugin manifest signed successfully!`);
        console.log(`Updated manifest saved to: ${manifestPath}`);

    } catch (error) {
        console.error('Error signing plugin manifest:', error);
        process.exit(1);
    }
}

main();