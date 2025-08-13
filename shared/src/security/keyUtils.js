// shared/src/security/keyUtils.js
const fs = require('fs').promises;

/**
 * Loads a private key from the specified file path.
 * @param {string} keyPath - The path to the private key file (e.g., PEM format).
 * @returns {Promise<string>} The private key content as a string.
 */
async function loadPrivateKey(keyPath) {
    try {
        return await fs.readFile(keyPath, 'utf-8');
    } catch (error) {
        console.error(`Error reading private key from ${keyPath}:`, error);
        throw error;
    }
}

module.exports = { loadPrivateKey };