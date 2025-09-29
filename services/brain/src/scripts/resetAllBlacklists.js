/**
 * Script to reset ALL model blacklists in the Brain service
 * This script runs inside the Brain container and directly accesses the ModelManager
 */

const path = require('path');

// Set up the module path to find the compiled TypeScript files
const srcPath = path.join(__dirname, '..');

async function resetAllBlacklists() {
    try {
        console.log('=== Resetting All Model Blacklists ===');
        
        // Import the compiled ModelManager from dist directory
        const { modelManagerInstance } = require(path.join(__dirname, '..', 'dist', 'utils', 'modelManager.js'));
        const { LLMConversationType } = require('@cktmcs/shared');
        
        console.log('✅ ModelManager loaded successfully');
        
        // Get all models
        const allModels = modelManagerInstance.getAllModels();
        console.log(`📊 Found ${allModels.length} total models`);
        
        // Reset all blacklists
        let resetCount = 0;
        const conversationTypes = Object.values(LLMConversationType);
        
        for (const model of allModels) {
            for (const conversationType of conversationTypes) {
                const metrics = modelManagerInstance.performanceTracker.getPerformanceMetrics(model.name, conversationType);
                if (metrics && metrics.blacklistedUntil) {
                    const wasBlacklistedUntil = metrics.blacklistedUntil;
                    metrics.blacklistedUntil = null;
                    metrics.consecutiveFailures = 0;
                    resetCount++;
                    console.log(`✅ Reset blacklist for ${model.name}/${conversationType} (was blacklisted until ${wasBlacklistedUntil})`);
                }
            }
        }
        
        // Clear model selection cache
        modelManagerInstance.clearModelSelectionCache();
        console.log('✅ Cleared model selection cache');
        
        // Save performance data
        await modelManagerInstance.performanceTracker.savePerformanceData();
        console.log('✅ Saved performance data to disk');
        
        console.log(`🎉 Successfully reset ${resetCount} blacklisted models`);
        
        // Get current status
        const blacklistedModels = modelManagerInstance.getBlacklistedModels();
        console.log(`📊 Current blacklisted models: ${blacklistedModels.length}`);
        
        if (blacklistedModels.length > 0) {
            console.log('⚠️ Still blacklisted models:');
            blacklistedModels.forEach(bm => {
                console.log(`  - ${bm.modelName}/${bm.conversationType} until ${bm.blacklistedUntil}`);
            });
        }
        
        console.log('=== Blacklist Reset Complete ===');
        
    } catch (error) {
        console.error('❌ Error during blacklist reset:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the reset
resetAllBlacklists();
