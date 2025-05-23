import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import { Step, MapSerializer, BaseEntity, ServiceTokenManager } from '@cktmcs/shared';
import { PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType } from '@cktmcs/shared';
import { executePluginInSandbox } from '@cktmcs/shared';
import { verifyPluginSignature, verifyTrustCertificate } from '@cktmcs/shared';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { checkPluginCompatibility } from '@cktmcs/shared';
import { compareVersions } from '@cktmcs/shared';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { analyzeError } from '@cktmcs/errorhandler';
import { ConfigManager } from './utils/configManager.js';
import { PluginRegistry } from './utils/pluginRegistry.js';
import { validateAndStandardizeInputs } from './utils/validator.js';
import { requestPluginFromEngineer } from './utils/engineer.js';
import githubRoutes from './routes/githubRoutes';

const configPath = path.join(os.homedir(), '.cktmcs', 'capabilitiesmanager.json');

const execAsync = promisify(exec);


export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager: ConfigManager;
    private pluginRegistry: PluginRegistry;


    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        console.log('Starting CapabilitiesManager initialization...');
        // Initialize with placeholder objects
        this.configManager = {} as ConfigManager;
        this.pluginRegistry = new PluginRegistry();

        // Start async initialization
        this.initialize().catch(error => {
            console.error('Failed to initialize CapabilitiesManager:', error);
            process.exit(1);
        });
    }

    private async initialize() {
        try {
            console.log('Initializing CapabilitiesManager...');
            this.configManager = await ConfigManager.initialize(this.librarianUrl);

            // Set up the server
            await this.start();

            // Explicitly register with PostOffice
            if (!this.registeredWithPostOffice) {
                console.log('CapabilitiesManager not registered with PostOffice yet, registering now...');
                await this.registerWithPostOffice(15, 2000); // Increase retries and initial delay

                if (this.registeredWithPostOffice) {
                    console.log('CapabilitiesManager successfully registered with PostOffice');
                } else {
                    console.error('Failed to register CapabilitiesManager with PostOffice after multiple attempts');
                    // Continue running even if registration fails - PostOffice might come online later
                }
            } else {
                console.log('CapabilitiesManager already registered with PostOffice');
            }

            console.log('CapabilitiesManager initialization complete');
        } catch (error) {
            console.error('Failed to initialize CapabilitiesManager:', error);
            process.exit(1);
        }
    }

    private setupServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const app = express();
                app.use(bodyParser.json());

                // Add basic request logging
                app.use((req, _res, next) => {
                    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
                    next();
                });

                // Use the BaseEntity verifyToken method for authentication
                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    // Skip authentication for health endpoints
                    if (req.path === '/health' || req.path === '/ready') {
                        return next();
                    }

                    // Use the BaseEntity verifyToken method
                    this.verifyToken(req, res, next);
                });

                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));
                app.post('/message', (req, res) => this.handleMessage(req, res));
                app.get('/availablePlugins', async (_req, res) => {res.json(await this.pluginRegistry.list())});
                app.post('/storeNewPlugin', (req, res) => {this.storeNewPlugin(req, res)});

                // GitHub integration routes
                app.use('/github', githubRoutes);

                // Generic plugin API routes with better GitHub integration
                app.get('/plugins', async (req, res) => {
                    try {
                        const repositoryType = req.query.repository as string || 'mongo';

                        // Special handling for GitHub repository
                        if (repositoryType === 'github' && process.env.ENABLE_GITHUB !== 'true') {
                            res.status(403).json({
                                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
                            });
                            return;
                        }

                        const repositories = this.pluginRegistry.getPluginMarketplace().getRepositories();
                        const repository = repositories.get(repositoryType);

                        if (!repository) {
                            res.status(404).json({
                                error: `Repository type ${repositoryType} not found`,
                                availableRepositories: Array.from(repositories.keys())
                            });
                        } else {
                            const plugins = await repository.list();
                            res.json({ plugins, repository: repositoryType });
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({
                            error: 'Failed to list plugins',
                            message: error instanceof Error ? error.message : String(error)
                        });
                    }
                });

                app.get('/plugins/:id', async (req, res) => {
                    try {
                        const { id } = req.params;
                        const repositoryType = req.query.repository as string || 'mongo';

                        // Special handling for GitHub repository
                        if (repositoryType === 'github' && process.env.ENABLE_GITHUB !== 'true') {
                            res.status(403).json({
                                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
                            });
                            return;
                        }

                        const repositories = this.pluginRegistry.getPluginMarketplace().getRepositories();
                        const repository = repositories.get(repositoryType);

                        if (!repository) {
                            res.status(404).json({
                                error: `Repository type ${repositoryType} not found`,
                                availableRepositories: Array.from(repositories.keys())
                            });
                        } else {
                            const plugin = await repository.fetch(id);
                            if (!plugin) {
                                res.status(404).json({ error: `Plugin with ID ${id} not found in ${repositoryType} repository` });
                            } else {
                                res.json({ plugin, repository: repositoryType });
                            }
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({
                            error: 'Failed to get plugin',
                            message: error instanceof Error ? error.message : String(error)
                        });
                    }
                });

                app.delete('/plugins/:id', async (req, res) => {
                    try {
                        const { id } = req.params;
                        const repositoryType = req.query.repository as string || 'mongo';
                        const repositories = this.pluginRegistry.getPluginMarketplace().getRepositories();
                        const repository = repositories.get(repositoryType);

                        if (!repository) {
                            res.status(404).json({ error: `Repository type ${repositoryType} not found` });
                        } else {
                            await repository.delete(id);
                            res.json({ success: true, message: 'Plugin deleted successfully' });
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({ error: 'Failed to delete plugin' });
                    }
                });

                // Error handling middleware
                app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
                    console.error('Express error:', err);
                    res.status(500).send({
                        success: false,
                        resultType: 'error',
                        error: err.message || 'Internal server error'
                    });
                });

                this.server = app.listen(this.port, () => {
                    console.log(`CapabilitiesManager server listening on port ${this.port}`);
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                    console.error('Server startup error:', error instanceof Error ? error.message : error);
                    reject(error);
                });

            } catch (error) { //analyzeError(error as Error);
                console.error('Error in server setup:', error instanceof Error ? error.message : error);
                reject(error);
            }
        });
    }

    public async start(): Promise<void> {
        try {
            console.log('Setting up express server...');
            await this.setupServer();

            // Set up periodic re-registration with PostOffice
            this.setupPeriodicReregistration();

            console.log('CapabilitiesManager server setup complete');
        } catch (error) {
            //analyzeError(error as Error);
            console.error('Failed to start CapabilitiesManager:', error instanceof Error ? error.message : error);
        }
    }

    /**
     * Set up periodic re-registration with PostOffice to ensure we stay registered
     * even if PostOffice restarts
     */
    private setupPeriodicReregistration(): void {
        // Re-register every 5 minutes
        setInterval(async () => {
            if (!this.registeredWithPostOffice) {
                console.log('CapabilitiesManager not registered with PostOffice, attempting to register...');
                await this.registerWithPostOffice(5, 1000);

                if (this.registeredWithPostOffice) {
                    console.log('CapabilitiesManager successfully re-registered with PostOffice');
                } else {
                    console.error('Failed to re-register CapabilitiesManager with PostOffice');
                }
            } else {
                // Verify registration is still valid by checking with PostOffice
                try {
                    const response = await this.authenticatedApi.get(`http://${this.postOfficeUrl}/getServices`);
                    const services = response.data;

                    // Check if CapabilitiesManager is in the services list
                    if (!services || !services.capabilitiesManagerUrl) {
                        console.log('CapabilitiesManager not found in PostOffice services, re-registering...');
                        this.registeredWithPostOffice = false; // Reset flag
                        await this.registerWithPostOffice(5, 1000);
                    } else {
                        console.log('CapabilitiesManager registration with PostOffice verified');
                    }
                } catch (error) {
                    console.error('Error verifying registration with PostOffice:', error instanceof Error ? error.message : error);
                    // Don't reset the flag here, as the error might be temporary
                }
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            const message = req.body;
            //console.log('Received message:', message);
            await super.handleBaseMessage(message);
            res.status(200).send({ status: 'Message received and processed' });
        } catch (error) { //analyzeError(error as Error);
            console.error('Error handling message:', error instanceof Error ? error.message : error);
            res.status(500).send({
                status: 'Error processing message',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async storeNewPlugin(req: express.Request, res: express.Response) {
        try {
            const newPlugin = req.body;

            // Check if this is an update to an existing plugin
            const existingPlugin = await this.pluginRegistry.fetchOneByVerb(newPlugin.verb);

            if (existingPlugin) {
                // Check version compatibility
                if (compareVersions(newPlugin.version, existingPlugin.version) <= 0) {
                    res.status(400).json({
                        error: `New plugin version ${newPlugin.version} is not newer than existing version ${existingPlugin.version}`
                    });
                    return;
                }

                // Perform compatibility check
                const compatibilityResult = checkPluginCompatibility(existingPlugin, newPlugin);

                if (!compatibilityResult.compatible) {
                    res.status(400).json({
                        error: 'Plugin is not compatible with the existing version',
                        issues: compatibilityResult.issues
                    });
                    return;
                }

                console.log(`CapabilitiesManager: Updating plugin ${newPlugin.id} from version ${existingPlugin.version} to ${newPlugin.version}`);
            }

            // Signature Verification for storeNewPlugin
            if (!newPlugin.security?.trust?.signature) {
                console.warn(`Plugin ${newPlugin.id || newPlugin.verb} submitted to storeNewPlugin without a signature.`);
                return res.status(400).json({ error: 'Plugin submission requires a signature.' });
            }

            let isSignatureValid = false;
            try {
                // Assuming newPlugin (PluginManifest from req.body) is structurally compatible with PluginDefinition for verification
                isSignatureValid = await verifyPluginSignature(newPlugin as PluginDefinition);
            } catch (verificationError: any) {
                console.error('Error during signature verification in storeNewPlugin:', verificationError.message);
                // Fall through, isSignatureValid remains false
            }

            if (!isSignatureValid) {
                console.warn(`Plugin ${newPlugin.id || newPlugin.verb} submitted to storeNewPlugin has an invalid signature.`);
                return res.status(400).json({ error: 'Plugin signature is invalid.' });
            }
            console.log(`CM: Plugin ${newPlugin.id || newPlugin.verb} signature verified for storeNewPlugin endpoint.`);

            // Validate plugin permissions
            const permissionErrors = validatePluginPermissions(newPlugin);
            if (permissionErrors.length > 0) {
                res.status(400).json({
                    error: `Plugin permission validation failed: ${permissionErrors.join(', ')}`
                });
                return;
            }

            // Store the plugin
            await this.pluginRegistry.store(newPlugin);

            console.log('CapabilitiesManager: New plugin registered:', newPlugin.id);
            res.status(200).json({
                message: 'Plugin registered successfully',
                pluginId: newPlugin.id,
                version: newPlugin.version,
                isUpdate: !!existingPlugin
            });

        } catch (error) {
            analyzeError(error as Error);
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Unknown error registering plugin'
            });
        }
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const step = {
            ...req.body,
            inputs: MapSerializer.transformFromSerialization(req.body.inputs)
        };
        console.log('CM: Executing action verb:', step.actionVerb);

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            console.log('CM: Invalid or missing verb', step.actionVerb);
            res.status(200).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: 'Invalid or missing verb',
                error: 'Invalid or missing verb'
            }]);
            return;
        }

        try {
            // First check registry cache
            let plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
            console.log('CM: The plugin returned from cache is:', plugin?.id);

            if (!plugin) {
                // Check for cached plan before handling unknown verb
                const cachedPlan = await this.checkCachedPlan(step.actionVerb);
                if (cachedPlan) {
                    console.log('CM: Using cached plan for verb:', step.actionVerb);
                    res.status(200).send(cachedPlan);
                    return;
                }

                // If not in cache, handle unknown verb
                console.log('CM: Plugin not found in Registry cache, handling unknown verb');
                const result = await this.handleUnknownVerb(step);
                if (!result.success) {
                    console.error('CM: Error handling unknown verb:', result.error);
                    res.status(200).send(MapSerializer.transformForSerialization([result]));
                    return;
                }

                // If we got a plan back from ACCOMPLISH, cache it
                if (result.resultType === PluginParameterType.PLAN) {
                    await this.cachePlan(step.actionVerb, result);
                }

                // Handle different response types
                switch (result.resultType) {
                    case PluginParameterType.PLAN:
                        console.log('CM: Returning plan for execution');
                        res.status(200).send(MapSerializer.transformForSerialization([result]));
                        return;
                    case PluginParameterType.STRING:
                    case PluginParameterType.NUMBER:
                    case PluginParameterType.BOOLEAN:
                        console.log('CM: Returning direct answer');
                        res.status(200).send(MapSerializer.transformForSerialization([result]));
                        return;

                    case PluginParameterType.PLUGIN:
                        console.log('CM: Plugin created:', result.result);
                        // Try to get the plugin again after handling unknown verb
                        plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
                        if (!plugin) {
                            console.log('CM: Newly created plugin not found in Registry cache');
                            res.status(200).send(MapSerializer.transformForSerialization([{
                                success: false,
                                name: 'error',
                                resultType: PluginParameterType.ERROR,
                                error: `Plugin not found for verb: ${step.actionVerb}`,
                                resultDescription: 'Plugin creation failed'
                            }]));
                            return;
                        }
                        break; // Continue with plugin execution

                    default:
                        res.status(200).send(MapSerializer.transformForSerialization([{
                            success: false,
                            name: 'error',
                            resultType: PluginParameterType.ERROR,
                            error: `Unexpected result type: ${result.resultType}`,
                            resultDescription: 'Unknown response type from handleUnknownVerb'
                        }]));
                        return;
                }
            }
            //console.log('CM: capabilitiesManager validating inputs', step.inputs);
            // Validate and standardize inputs
            const validatedInputs = await validateAndStandardizeInputs(plugin, step.inputs);
            if (!validatedInputs.success) {
                console.log('CM: Error validating inputs:', validatedInputs.error);
                res.status(200).send([{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    error: validatedInputs.error
                }]);
                return;
            }
            //console.log('CM: Inputs validated successfully:', validatedInputs.inputs);

            // Prepare plugin for execution (clones git-based plugins, etc.)
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(plugin);

            // Execute plugin with validated inputs and the effective manifest and root path
            const result = await this.executePlugin(effectiveManifest, validatedInputs.inputs || new Map<string, PluginInput>(), pluginRootPath);

            console.log('executePlugin result: ',result);
            // Log the result in a more readable format
            console.log('CM: Plugin executed successfully:', JSON.stringify(MapSerializer.transformForSerialization(result), null, 2));

            // For PLAN results, log more details about the plan
            if (result.length > 0 && result[0].resultType === PluginParameterType.PLAN) {
                console.log('CM: Plan details:', JSON.stringify(result[0].result, null, 2));
            }

            // Log the console output from the plugin if available
            if (result.length > 0 && result[0].console) {
                console.log('CM: Plugin console output:');
                result[0].console.forEach((logEntry, index) => {
                    console.log(`[Plugin Log ${index}]:`, logEntry);
                });
            }

            // Send the serialized result
            res.status(200).send(MapSerializer.transformForSerialization(result));

        } catch (error) {
            console.error('Error executing action verb %s:', step.actionVerb, error instanceof Error ? error.message : error);
            res.status(500).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: error,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }]);
        }
    }

// Define a type for ExecutionContext for clarity, though it's not a formal interface here
type ExecutionContext = {
    inputs: Map<string, PluginInput>;
    environment: environmentType;
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
};

    protected async executePlugin(
        plugin: PluginDefinition, // Changed from effectiveManifest back to plugin for clarity
        inputs: Map<string, PluginInput>,
        pluginRootPath: string // Renamed from pluginRootPathFromPreparation
    ): Promise<PluginOutput[]> {
        console.log(`CM: Attempting to execute plugin ID: ${plugin.id}, Verb: ${plugin.verb}, RootPath: ${pluginRootPath}`);
        try {
            // Mandatory Signature Verification
            if (!plugin.security?.trust?.signature) {
                console.error(`Plugin ${plugin.id} (${plugin.verb}) has no signature. Execution denied.`);
                return [{ success: false, name: 'security_error', resultType: PluginParameterType.ERROR, resultDescription: `Plugin ${plugin.id} (${plugin.verb}) is not signed.`, result: null }];
            }
            try {
                const isSignatureValid = await verifyPluginSignature(plugin);
                if (!isSignatureValid) {
                    console.error(`Plugin ${plugin.id} (${plugin.verb}) signature verification failed. Execution denied.`);
                    return [{ success: false, name: 'security_error', resultType: PluginParameterType.ERROR, resultDescription: `Plugin ${plugin.id} (${plugin.verb}) signature invalid.`, result: null }];
                }
                console.log(`CM: Plugin ${plugin.id} (${plugin.verb}) signature verified successfully for execution.`);
            } catch (verificationError: any) {
                console.error(`Error during signature verification for plugin ${plugin.id} (${plugin.verb}):`, verificationError.message);
                return [{ success: false, name: 'security_error', resultType: PluginParameterType.ERROR, resultDescription: `Error verifying plugin ${plugin.id} (${plugin.verb}) signature: ${verificationError.message}`, result: null }];
            }

            // Validate plugin permissions
            const permissionErrors = validatePluginPermissions(plugin);
            if (permissionErrors.length > 0) {
                return [{
                    success: false,
                    name: 'security_error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    result: null
                }];
            }

            // Check for dangerous permissions
            if (hasDangerousPermissions(plugin)) {
                console.warn(`CM: Plugin ${plugin.id} has dangerous permissions. Proceeding with execution.`);
            }

            // Load plugin-specific configuration
            const configSet = await this.configManager.getPluginConfig(plugin.id);

            // Check for missing required configuration
            if (configSet.length === 0) { // This condition seems incorrect, should check if items in configSet are missing
                for (const configItem of configSet) {
                    if (configItem.required && !configItem.value) {
                        console.error(`CM: Missing required configuration for plugin ${plugin.id}: ${configItem.key}`);
                    }
                }
            }

            // Record usage
            await this.configManager.recordPluginUsage(plugin.id);
            await this.configManager.updatePluginConfig(plugin.id, configSet);

            let token = null;
            let brainToken = null;

            try {
                const tokenManager = this.getTokenManager();
                token = await tokenManager.getToken();
                if (token) {
                    console.log('CM: Got authentication token for plugin execution');
                } else {
                    console.warn('CM: Failed to get authentication token for plugin');
                }

                if (plugin.verb === 'ACCOMPLISH') {
                    const brainTokenManager = new ServiceTokenManager(
                        `http://${this.securityManagerUrl}`,
                        'Brain',
                        process.env.CLIENT_SECRET || 'stage7AuthSecret'
                    );
                    brainToken = await brainTokenManager.getToken();
                    if (brainToken) {
                        console.log('CM: Got Brain-specific authentication token for ACCOMPLISH plugin');
                    } else {
                        console.warn('CM: Failed to get Brain-specific authentication token');
                    }
                }
            } catch (tokenError) {
                console.error('CM: Error getting authentication token(s):', tokenError instanceof Error ? tokenError.message : String(tokenError));
            }

            const customEnv = { ...process.env };
            if (token) customEnv.CM_AUTH_TOKEN = token;
            if (brainToken) customEnv.BRAIN_AUTH_TOKEN = brainToken;

            const environment: environmentType = {
                env: customEnv,
                credentials: configSet ?? []
            };

            const workingInputs = new Map(inputs);

            if (token) {
                workingInputs.set('__auth_token', { inputName: '__auth_token', inputValue: token, args: { token } });
            }
            if (brainToken) {
                workingInputs.set('__brain_auth_token', { inputName: '__brain_auth_token', inputValue: brainToken, args: { token: brainToken } });
                workingInputs.set('token', { inputName: 'token', inputValue: brainToken, args: { token: brainToken } });
            }

            // Use the pluginRootPath obtained from preparePluginForExecution
            const executionContext: ExecutionContext = {
                inputs: workingInputs,
                environment,
                pluginDefinition: effectiveManifest,
                pluginRootPath: pluginRootPathFromPreparation 
            };
            console.log(`CM: ExecutionContext prepared for ${effectiveManifest.id} with root path ${pluginRootPathFromPreparation}`);

            // Execute with environment based on language
            if (effectiveManifest.language === 'javascript') {
                try {
                    console.log(`CM: Attempting to execute JavaScript plugin ${plugin.id} in sandbox.`);
                    return await executePluginInSandbox(
                        executionContext.pluginDefinition, // This is effectiveManifest
                        Array.from(executionContext.inputs.values()),
                        executionContext.environment
                    );
                } catch (sandboxError) {
                    console.error(`CM: Sandbox execution failed for ${effectiveManifest.id}, falling back to direct execution: ${sandboxError instanceof Error ? sandboxError.message : String(sandboxError)}`);
                    return this.executeJavaScriptPlugin(executionContext); // Pass the whole context
                }
            } else if (effectiveManifest.language === 'python') {
                console.log(`CM: Attempting to execute Python plugin ${effectiveManifest.id}.`);
                return this.executePythonPlugin(executionContext); // Pass the whole context
            }

            throw new Error(`Unsupported plugin language: ${effectiveManifest.language}`);
        } catch (error) {
            console.error(`CM: Error in executePlugin for plugin ${effectiveManifest.id} (${effectiveManifest.verb}):`, error);
            return [{
                success: false,
                name: 'error_in_CM_executePlugin', // Consider making this more specific if possible
                resultType: PluginParameterType.ERROR,
                resultDescription: error instanceof Error ? error.message : JSON.stringify(error),
                result: null
            }];
        }
    }

    /**
     * @deprecated This method is deprecated in favor of sandboxed execution. It will be removed in a future version.
     * Fallback for JavaScript plugin execution if sandboxing fails.
     */
    private async executeJavaScriptPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        console.warn(`CM: WARNING - Executing JavaScript plugin ${executionContext.pluginDefinition.id} (${executionContext.pluginDefinition.verb}) via deprecated direct method.`);
        const { pluginDefinition, inputs, environment, pluginRootPath } = executionContext;
        // Use pluginRootPath for constructing mainFilePath
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);
        console.log(`CM: Fallback JS execution - Main file path: ${mainFilePath}`);

        try {
            const pluginModule = await import(mainFilePath);

            if (typeof pluginModule.execute !== 'function') {
                const errorMsg = `Plugin ${pluginDefinition.verb} does not export an execute function`;
                console.error(`CM: ${errorMsg}`);
                return [{
                    success: false,
                    name: 'js_execution_error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: errorMsg,
                    result: null,
                    error: errorMsg
                }];
            }

            const pluginResult = await pluginModule.execute(inputs, environment); // Pass original inputs Map and environment
            console.log(`CM: Fallback JS Plugin ${pluginDefinition.verb} result:`, pluginResult);
            return pluginResult;
        } catch (error) {
            const errorMsg = `Error in executeJavaScriptPlugin (fallback) for ${pluginDefinition.verb}: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
            console.error(`CM: ${errorMsg}`);
            return [{
                success: false,
                name: 'js_execution_error',
                resultType: PluginParameterType.ERROR,
                resultDescription: errorMsg,
                result: null,
                error: errorMsg
            }];
        }
    }

    private async executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputs, environment, pluginRootPath } = executionContext;
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);
        console.log(`CM: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);

        try {
            // Serialize the inputs Map to a JSON string
            // Convert Map to an object for JSON serialization
            const inputsObject: { [key: string]: PluginInput } = {};
            inputs.forEach((value, key) => {
                inputsObject[key] = value;
            });
            const inputsJsonString = JSON.stringify(inputsObject);

            // Command: echo '{json_inputs}' | python3 mainFilePath pluginRootPath
            // Note: Python script needs to be adapted to read JSON from stdin
            // and accept pluginRootPath as a command-line argument if needed for internal path resolution.
            // For now, PYTHONPATH is set, which helps with imports within the plugin's directory.
            const command = `echo '${inputsJsonString.replace(/'/g, "'\\''")}' | python3 ${mainFilePath} ${pluginRootPath}`;
            console.log(`CM: Python execution command (first ~50 chars of input): echo '${inputsJsonString.substring(0,50)}...' | python3 ${mainFilePath} ${pluginRootPath}`);


            const { stdout, stderr } = await execAsync(command, {
                cwd: pluginRootPath, // Set current working directory
                env: {
                    ...environment.env, // Pass merged environment variables from executionContext
                    PYTHONPATH: pluginRootPath // Ensure plugin's root is in PYTHONPATH
                }
            });

            if (stderr) {
                console.error(`CM: Python plugin ${pluginDefinition.verb} stderr:\n${stderr}`);
                // Depending on Python script, stderr might not always mean failure
                // but it's important to log it.
            }

            // Parse the output
            const results: PluginOutput[] = JSON.parse(stdout);
            // Ensure it's always an array, even if Python script returns a single object
            return Array.isArray(results) ? results : [results];

        } catch (error) {
            const execError = error as (Error & { stdout?: string; stderr?: string });
            const errorMsg = `Error executing Python plugin ${pluginDefinition.verb}`;
            console.error(`CM: ${errorMsg}:`, execError.message);
            if (execError.stderr) {
                console.error(`CM: Python plugin ${pluginDefinition.verb} stderr (on error):\n${execError.stderr}`);
            }
            if (execError.stdout) {
                console.warn(`CM: Python plugin ${pluginDefinition.verb} stdout (on error):\n${execError.stdout}`);
            }
            return [{
                success: false,
                name: 'python_execution_error',
                resultType: PluginParameterType.ERROR,
                error: `${errorMsg}: ${execError.message}. Stderr: ${execError.stderr || 'N/A'}`,
                resultDescription: `Error executing plugin ${pluginDefinition.verb}. Check logs for details.`,
                result: null
            }];
        }
    }

    private async handleUnknownVerb(step: Step): Promise<PluginOutput> {
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `Handle the action verb "${step.actionVerb}" in our plan with the following context: ${context} by defining a plan, generating an answer from the inputs, or recommending a new plugin for handling the actionVerb.
            Respond with a plan, a plugin request, or a literal result.  Avoid using this action verb, ${step.actionVerb}, in the plan.
            `;
            const verbToAvoid = step.actionVerb;

            console.log('CM: handleUnknownVerb goal:', step.actionVerb);

            const accomplishResult = await this.executeAccomplishPlugin(goal, verbToAvoid);

            if (!accomplishResult.success) {
                console.error('CM: Error executing ACCOMPLISH for verb %s:', step.actionVerb, accomplishResult.error);
                return accomplishResult;
            }

            console.log('CM: accomplishResult:', accomplishResult);

            // Handle different response types from ACCOMPLISH
            switch (accomplishResult.resultType) {
                case PluginParameterType.PLUGIN:
                    // Need to create a new plugin
                    console.log('CM: Creating new plugin for unknown verb:', step.actionVerb);
                    const engineerResult = await requestPluginFromEngineer(this, step, JSON.stringify(accomplishResult.result));
                    if (!engineerResult.success) {
                        return engineerResult;
                    }

                    const plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
                    if (!plugin) {
                        return {
                            success: false,
                            name: 'error',
                            resultType: PluginParameterType.ERROR,
                            error: 'Failed to create plugin',
                            resultDescription: 'CM: Failed to create plugin',
                            result: null
                        };
                    }
                    return {
                        success: true,
                        name: 'plugin_created',
                        resultType: PluginParameterType.PLUGIN,
                        result: plugin,
                        resultDescription: `CM: Created new plugin for ${step.actionVerb}`
                    };

                case PluginParameterType.PLAN:
                    // Return the plan for execution
                    console.log('CM: Returning plan for execution:', JSON.stringify(accomplishResult.result, null, 2));
                    return {
                        success: true,
                        name: 'plan_created',
                        resultType: PluginParameterType.PLAN,
                        result: accomplishResult.result,
                        resultDescription: `CM: Created plan to handle ${step.actionVerb}`
                    };

                case PluginParameterType.STRING:
                case PluginParameterType.NUMBER:
                case PluginParameterType.BOOLEAN:
                    // Direct answer or simple result
                    console.log('CM: Returning direct result for:', step.actionVerb);
                    return {
                        success: true,
                        name: 'direct_result',
                        resultType: accomplishResult.resultType,
                        result: accomplishResult.result,
                        resultDescription: `CM: Direct result for ${step.actionVerb}`
                    };

                default:
                    return {
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        error: `Unexpected result type: ${accomplishResult.resultType}`,
                        resultDescription: 'CM: Unexpected response from ACCOMPLISH plugin',
                        result: null
                    };
            }
        } catch (error) {
            console.error('Error handling unknown verb:', error instanceof Error ? error.message : error);
            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                resultDescription: 'Error handling unknown verb',
                result: null
            };
        }
    }

    private async executeAccomplishPlugin(goal: string, verbToAvoid: string): Promise<PluginOutput> {
        try {
            const accomplishInputs = new Map<string, PluginInput>([
                ['goal', { inputName: 'goal', inputValue: goal, args: {} }],
                ['verbToAvoid', { inputName: 'verbToAvoid', inputValue: verbToAvoid, args: {} }]
            ]);

            const accomplishManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH');
            if (!accomplishManifest) {
                console.error('ACCOMPLISH plugin manifest not found for new verb assessment');
                return {
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    error: 'ACCOMPLISH plugin manifest not found',
                    resultDescription: 'ACCOMPLISH plugin manifest not found',
                    result: null
                };
            }
            // For ACCOMPLISH, it's an inline plugin, so its root path can be determined by PluginRegistry
            const { pluginRootPath: accomplishRootPath, effectiveManifest: effectiveAccomplishManifest } = await this.pluginRegistry.preparePluginForExecution(accomplishManifest);

            const results = await this.executePlugin(effectiveAccomplishManifest, accomplishInputs, accomplishRootPath);
            return results[0];
        } catch (error) {
            console.error('Error executing ACCOMPLISH for Verb analysis:', error instanceof Error ? error.message : error);
            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                resultDescription: 'Error executing ACCOMPLISH plugin',
                result: null
            };
        }
    }

    private async checkCachedPlan(actionVerb: string): Promise<PluginOutput | null> {
        try {
            const cachedPlan = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData`, {
                params: {
                    collection: 'actionPlans',
                    id: actionVerb
                }
            });

            if (cachedPlan.data?.data) {
                console.log('CM: Found cached plan for verb:', actionVerb);
                return cachedPlan.data.data;
            }
            return null;
        } catch (error) {
            console.log('CM: No cached plan found for verb:', actionVerb);
            return null;
        }
    }

    private async cachePlan(actionVerb: string, plan: PluginOutput): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'actionPlans',
                id: actionVerb,
                data: plan
            });
            console.log('CM: Cached plan for verb:', actionVerb);
        } catch (error) {
            console.error('CM: Error caching plan:', error);
        }
    }

}

// Create and export a singleton instance
export const capabilitiesManager = new CapabilitiesManager();

// Also export the class for type usage
export default CapabilitiesManager;
