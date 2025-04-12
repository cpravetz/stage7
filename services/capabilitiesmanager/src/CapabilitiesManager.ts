import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import { Step, MapSerializer, BaseEntity  } from '@cktmcs/shared/index.js';
import { PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType } from '@cktmcs/shared/index.js';
import { executePluginInSandbox } from '@cktmcs/shared/dist/security/isolatedPluginSandbox';
import { verifyPluginSignature, verifyTrustCertificate } from '@cktmcs/shared/dist/security/pluginSigning';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared/dist/security/pluginPermissions';
import { checkPluginCompatibility } from '@cktmcs/shared/dist/versioning/compatibilityChecker';
import { compareVersions } from '@cktmcs/shared/dist/versioning/semver';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { analyzeError } from '@cktmcs/errorhandler';
import { ConfigManager } from './utils/configManager.js';
import { PluginRegistry } from './utils/pluginRegistry.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { validateAndStandardizeInputs } from './utils/validator.js';
import { requestPluginFromEngineer } from './utils/engineer.js';

const configPath = path.join(os.homedir(), '.cktmcs', 'capabilitiesmanager.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
});

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
            this.configManager = await ConfigManager.initialize(this.librarianUrl);
            await this.start();
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
                app.use((req, res, next) => {
                    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
                    next();
                });

                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));
                app.post('/message', (req, res) => this.handleMessage(req, res));
                app.get('/availablePlugins', async (req, res) => {res.json(await this.pluginRegistry.list())});
                app.post('/storeNewPlugin', (req, res) => this.storeNewPlugin(req, res));

                // Error handling middleware
                app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
            console.log('CapabilitiesManager initialization complete');
        } catch (error) {
            //analyzeError(error as Error);
            console.error('Failed to start CapabilitiesManager:', error instanceof Error ? error.message : error);
        }
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
                    return res.status(400).json({
                        error: `New plugin version ${newPlugin.version} is not newer than existing version ${existingPlugin.version}`
                    });
                }

                // Perform compatibility check
                const compatibilityResult = checkPluginCompatibility(existingPlugin, newPlugin);

                if (!compatibilityResult.compatible) {
                    return res.status(400).json({
                        error: 'Plugin is not compatible with the existing version',
                        issues: compatibilityResult.issues
                    });
                }

                console.log(`CapabilitiesManager: Updating plugin ${newPlugin.id} from version ${existingPlugin.version} to ${newPlugin.version}`);
            }

            // Verify plugin signature
            if (!verifyPluginSignature(newPlugin)) {
                return res.status(400).json({
                    error: 'Plugin signature verification failed'
                });
            }

            // Validate plugin permissions
            const permissionErrors = validatePluginPermissions(newPlugin);
            if (permissionErrors.length > 0) {
                return res.status(400).json({
                    error: `Plugin permission validation failed: ${permissionErrors.join(', ')}`
                });
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

            // Execute plugin with validated inputs
            const result = await this.executePlugin(plugin, validatedInputs.inputs || new Map<string, PluginInput>());
            console.log('CM: Plugin executed successfully');//:, result);
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

    protected async executePlugin(plugin: PluginDefinition, inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        try {
            // Verify plugin signature
            if (!verifyPluginSignature(plugin)) {
                return [{
                    success: false,
                    name: 'security_error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Plugin signature verification failed',
                    result: null
                }];
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
                console.warn(`Plugin ${plugin.id} has dangerous permissions`);
                // In a production environment, we might want to prompt the user for confirmation
                // or restrict execution based on user permissions
            }

            // Load plugin-specific configuration
            const configSet = await this.configManager.getPluginConfig(plugin.id);

            // Check for missing required configuration
            if (configSet.length === 0) {
                for (const configItem of configSet) {
                    if (configItem.required && !configItem.value) {
                        const answer = await this.ask(`Please provide a value for ${configItem.key} - ${configItem.description}`);
                        configItem.value = answer;
                    }
                }
            }

            // Record usage
            await this.configManager.recordPluginUsage(plugin.id);
            await this.configManager.updatePluginConfig(plugin.id, configSet);

            // Inject configuration into plugin environment
            const environment: environmentType = {
                env: process.env,
                credentials: configSet ?? []
            };

            // Execute with environment based on language
            if (plugin.language === 'javascript') {
                // Use sandbox for JavaScript plugins
                try {
                    return await executePluginInSandbox(plugin, inputs, environment);
                } catch (sandboxError) {
                    console.error(`Sandbox execution failed, falling back to direct execution: ${sandboxError instanceof Error ? sandboxError.message : String(sandboxError)}`);
                    return this.executeJavaScriptPlugin(plugin, inputs, environment);
                }
            } else if (plugin.language === 'python') {
                return this.executePythonPlugin(plugin, inputs, environment);
            }

            throw new Error(`Unsupported plugin language: ${plugin.language}`);
        } catch (error) {
            return [{
                success: false,
                name: 'error in CM:executePlugin',
                resultType: PluginParameterType.ERROR,
                resultDescription: error instanceof Error ? error.message : JSON.stringify(error),
                result: null
            }];
        }
    }


    private async executeJavaScriptPlugin(plugin: PluginDefinition, inputs: Map<string, PluginInput>, environment: environmentType): Promise<PluginOutput[]> {
        const pluginDir = path.join(__dirname, 'plugins', plugin.verb);
        const mainFilePath = path.join(pluginDir, plugin.entryPoint!.main);

        try {
            // Dynamically import the main file
            const pluginModule = await import(mainFilePath);

            if (typeof pluginModule.execute !== 'function') {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: `Plugin ${plugin.verb} does not export an execute function`,
                    result: null
                }];
            }

            // Execute the plugin
            return await pluginModule.execute(inputs, environment);
        } catch (error) {
            console.error(`Error executing plugin ${plugin.verb}:`, error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: `Error in executeJavaScriptPlugin for ${plugin.verb}: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
                result: null
            }];
        }
    }
    private async executePythonPlugin(plugin: PluginDefinition, inputs: Map<string, PluginInput>, environment: environmentType): Promise<PluginOutput[]> {
        const pluginDir = path.join(this.pluginRegistry.currentDir, 'plugins', plugin.verb);
        const mainFilePath = path.join(pluginDir, plugin.entryPoint!.main);

        try {
            // Create a temporary file for the input
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-input-'));
            const inputFilePath = path.join(tmpDir, 'input.json');
            const pluginExecuteParams = {
                inputs,
                environment
            };
            await fs.writeFile(inputFilePath, JSON.stringify(pluginExecuteParams));

            // Execute Python script
            const { stdout, stderr } = await execAsync(`python3 ${mainFilePath} ${inputFilePath}`, {
                cwd: pluginDir,
                env: { ...process.env, PYTHONPATH: pluginDir }
            });

            // Clean up the temporary file
            await fs.rm(tmpDir, { recursive: true, force: true });

            if (stderr) {
                console.error(`Python plugin ${plugin.verb} stderr:`, stderr);
            }

            // Parse the output
            const result: PluginOutput = JSON.parse(stdout);

            return [result];
        } catch (error) { //analyzeError(error as Error);
            console.error(`Error executing Python plugin ${plugin.verb}:`, error instanceof Error ? error.message : error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                resultDescription: `Error executing plugin ${plugin.verb}`,
                result: null
            }];
        }
    }

    private async handleUnknownVerb(step: Step): Promise<PluginOutput> {
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `How should I handle the action verb "${step.actionVerb}" in our plan with the following context: ${context}
            Can we accomplish it with a subplan using one or more steps or should we create a plugin that can run code to accomplish it?
            Avoid using this action verb, ${step.actionVerb}, in the plan.
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
                    const engineerResult = await requestPluginFromEngineer(step, JSON.stringify(accomplishResult.result));
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
                            resultDescription: 'Failed to create plugin',
                            result: null
                        };
                    }
                    return {
                        success: true,
                        name: 'plugin_created',
                        resultType: PluginParameterType.PLUGIN,
                        result: plugin,
                        resultDescription: `Created new plugin for ${step.actionVerb}`
                    };

                case PluginParameterType.PLAN:
                    // Return the plan for execution
                    console.log('CM: Returning plan for execution:', accomplishResult.result);
                    return {
                        success: true,
                        name: 'plan_created',
                        resultType: PluginParameterType.PLAN,
                        result: accomplishResult.result,
                        resultDescription: `Created plan to handle ${step.actionVerb}`
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
                        resultDescription: `Direct result for ${step.actionVerb}`
                    };

                default:
                    return {
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        error: `Unexpected result type: ${accomplishResult.resultType}`,
                        resultDescription: 'Unexpected response from ACCOMPLISH plugin',
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

            const plugin = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH');
            if (!plugin) {
                console.error('ACCOMPLISH plugin not found for new verb assessment');
                return {
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    error: 'ACCOMPLISH plugin not found',
                    resultDescription: 'ACCOMPLISH plugin not found',
                    result: null
                };
            }

            const results = await this.executePlugin(plugin, accomplishInputs);
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
            const cachedPlan = await axios.get(`http://${this.librarianUrl}/loadData`, {
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
            await axios.post(`http://${this.librarianUrl}/storeData`, {
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

// Create and start the CapabilitiesManager
const manager = new CapabilitiesManager();

export default CapabilitiesManager;