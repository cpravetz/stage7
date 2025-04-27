/**
 * Script to reset blacklists for Huggingface and Groq models
 * 
 * This script:
 * 1. Clears the global Huggingface blacklist
 * 2. Resets blacklists for all Huggingface and Groq models in the performance tracker
 */

// Import the performance tracker
const { ModelPerformanceTracker } = require('../utils/performanceTracker');

// Create a new instance of the performance tracker
const performanceTracker = new ModelPerformanceTracker();

// Clear the global Huggingface blacklist
if (global.huggingfaceBlacklistedUntil) {
    console.log(`Clearing global Huggingface blacklist (was set until ${new Date(global.huggingfaceBlacklistedUntil).toLocaleString()})`);
    global.huggingfaceBlacklistedUntil = null;
} else {
    console.log('No global Huggingface blacklist found');
}

// Reset blacklists for all models
console.log('Resetting blacklists for Huggingface and Groq models...');
let resetCount = 0;

// Get all performance data
const performanceData = performanceTracker.getAllPerformanceData();

// Loop through all models
for (const modelData of performanceData) {
    const modelName = modelData.modelName.toLowerCase();
    
    // Check if this is a Huggingface or Groq model
    const isHuggingfaceModel = modelName.includes('huggingface') || modelName.includes('hf/');
    const isGroqModel = modelName.includes('groq/');
    
    if (isHuggingfaceModel || isGroqModel) {
        // Loop through all conversation types
        for (const conversationType of Object.keys(modelData.metrics)) {
            const metrics = modelData.metrics[conversationType];
            
            if (metrics && metrics.blacklistedUntil) {
                // Clear the blacklist
                const wasBlacklistedUntil = new Date(metrics.blacklistedUntil).toLocaleString();
                metrics.blacklistedUntil = null;
                
                // Reset consecutive failures
                metrics.consecutiveFailures = 0;
                
                console.log(`Reset blacklist for model ${modelData.modelName} (${conversationType}) - was blacklisted until ${wasBlacklistedUntil}`);
                resetCount++;
            }
        }
    }
}

if (resetCount > 0) {
    console.log(`Reset ${resetCount} blacklisted models`);
    
    // Save the updated performance data
    performanceTracker.savePerformanceData()
        .then(() => {
            console.log('Successfully saved updated performance data');
        })
        .catch(error => {
            console.error('Error saving performance data:', error);
        });
} else {
    console.log('No blacklisted Huggingface or Groq models found');
}

console.log('Blacklist reset complete');
