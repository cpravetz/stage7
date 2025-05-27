import { PluginOrchestrator } from './orchestration/pluginOrchestrator';
import { ApiRouterService } from './services/apiRouterService';
import { PluginRegistry } from './utils/pluginRegistry'; // PluginOrchestrator creates its own, but ApiRouterService might need it passed explicitly depending on final wiring.
import { v4 as uuidv4 } from 'uuid';

const main = async () => {
    const instanceId = uuidv4().substring(0,8); // For tracing this specific startup
    console.log(`[${instanceId}] Initializing Capabilities Manager Service...`);

    // 1. Instantiate PluginOrchestrator
    // It extends BaseEntity, which sets up service name, id, etc.
    const pluginOrchestrator = new PluginOrchestrator();

    // 2. Initialize PluginOrchestrator (handles ConfigManager, other services, PostOffice registration)
    // The initialize method is now responsible for async setup.
    try {
        await pluginOrchestrator.initialize(`main-${instanceId}`);
        console.log(`[${instanceId}] PluginOrchestrator initialized successfully.`);
    } catch (error) {
        console.error(`[${instanceId}] CRITICAL: PluginOrchestrator failed to initialize. Exiting.`, error);
        process.exit(1);
    }

    // 3. Instantiate ApiRouterService
    // PluginOrchestrator holds its own instance of PluginRegistry. ApiRouterService needs access to it for certain routes.
    const apiRouterService = new ApiRouterService(pluginOrchestrator, pluginOrchestrator.pluginRegistry);
    
    // 4. Start the HTTP Server via ApiRouterService
    // The port is typically managed by BaseEntity, accessed via pluginOrchestrator.port
    const port = pluginOrchestrator.port; // Assuming getPort() method exists on BaseEntity/PluginOrchestrator
    try {
        await apiRouterService.startServer(port, `main-${instanceId}`);
        console.log(`[${instanceId}] ApiRouterService started successfully on port ${port}.`);
    } catch (error) {
        console.error(`[${instanceId}] CRITICAL: ApiRouterService failed to start. Exiting.`, error);
        process.exit(1);
    }

    console.log(`[${instanceId}] Capabilities Manager Service (Refactored) started successfully.`);
};

main().catch(error => {
    const instanceId = uuidv4().substring(0,8);
    console.error(`[${instanceId}] CRITICAL_ERROR_MAIN: Unhandled error during service startup:`, error);
    process.exit(1);
});

// If there's a need to export the orchestrator for other potential system integrations (e.g., direct programmatic access if not a pure microservice)
// export { pluginOrchestrator }; 
// For now, the service primarily runs via its HTTP interface.
// No default export is needed if this is the main entry point just starting the service.
