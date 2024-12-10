import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import { Step, MapSerializer, BaseEntity  } from '@cktmcs/shared';
import { PluginInput, PluginOutput, Plugin, PluginParameterType, environmentType } from '@cktmcs/shared';
import { execute as AccomplishPlugin } from './plugins/ACCOMPLISH/ACCOMPLISH.js';
import os from 'os';
import { analyzeError } from '@cktmcs/errorhandler';
import { ConfigManager } from './utils/configManager.js';
import { initializeExistingPlugins, PluginRegistry } from './utils/pluginRegistry.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PluginSandbox } from './utils/PluginSandbox.js';

const configPath = path.join(os.homedir(), '.cktmcs', 'capabilitiesmanager.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
});

export class CapabilitiesManager extends BaseEntity {
    private engineerUrl: string = process.env.ENGINEER_URL || 'engineer:5050';
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager: ConfigManager;
    private pluginRegistry: PluginRegistry;


    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        console.log('Starting CapabilitiesManager initialization...');
        // Initialize with placeholder objects
        this.configManager = {} as ConfigManager;
        this.pluginRegistry = {} as PluginRegistry;
        
        // Start async initialization
        this.initialize().catch(error => {
            console.error('Failed to initialize CapabilitiesManager:', error);
            process.exit(1);
        });
    }

    private async initialize() {
        try {
            this.configManager = await ConfigManager.initialize(this.librarianUrl);
            this.pluginRegistry = await PluginRegistry.initialize(this.configManager);
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
                app.get('/availablePlugins', (req, res) => this.pluginRegistry.getAvailablePlugins(req, res));


                // New endpoints for plugin management
                app.post('/registerPlugin', async (req, res) => {
                    try {
                        const plugin = req.body.plugin;
                        await this.pluginRegistry.registerPlugin(plugin);
                        res.status(200).json({ message: 'Plugin registered successfully' });
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({ 
                            error: `Failed to register plugin: ${error instanceof Error ? error.message : String(error)}` 
                        });
                    }
                });
        
                app.get('/plugins/:pluginId', async (req, res) => {
                    try {
                        const plugin = await this.pluginRegistry.getPlugin(req.params.pluginId);
                        if (plugin) {
                            res.status(200).json(plugin);
                        } else {
                            res.status(404).json({ error: 'Plugin not found' });
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({ 
                            error: `Failed to get plugin: ${error instanceof Error ? error.message : String(error)}` 
                        });
                    }
                });
        
                app.get('/plugins/:pluginId/metadata', async (req, res) => {
                    try {
                        const metadata = await this.pluginRegistry.getPluginMetadata(req.params.pluginId);
                        if (metadata) {
                            res.status(200).json(metadata);
                        } else {
                            res.status(404).json({ error: 'Plugin metadata not found' });
                        }
                    } catch (error) {
                        analyzeError(error as Error);
                        res.status(500).json({ 
                            error: `Failed to get plugin metadata: ${error instanceof Error ? error.message : String(error)}` 
                        });
                    }
                });

                app.get('/plugins/category/:category', async (req, res) => {
                    const plugins = await this.pluginRegistry.getPluginsByCategory(req.params.category);
                    res.json(plugins);
                });

                app.get('/plugins/tags', async (req, res) => {
                    const tags = req.query.tags as string[];
                    const plugins = await this.pluginRegistry.getPluginsByTags(tags);
                    res.json(plugins);
                });

                app.get('/plugins/capabilities', async (req, res) => {
                    const capabilities = await this.pluginRegistry.getSummarizedCapabilities();
                    res.json(capabilities);
                });

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
            console.log('Received message:', message);
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

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const step = MapSerializer.transformFromSerialization(req.body);

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            res.status(400).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: 'Invalid or missing verb',
                error: 'Invalid or missing verb'
            }]);
        }
        if (!step.inputs || typeof step.inputs !== 'object') {
            res.status(400).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: 'Invalid or missing inputs',
                error: 'Invalid or missing inputs'
            }]);
        }
        if (step.inputs._type === 'Map') {
            step.inputs = new Map(step.inputs.entries);
        }

        // Validate and standardize inputs for known plugins
        this.validateAndStandardizeInputs(step);
        try {
            let pluginDef = this.pluginRegistry.actionVerbs.get(step.actionVerb);
            if (!pluginDef) {
                const pluginResult = await this.handleUnknownVerb(step);
                if (pluginResult.resultType === PluginParameterType.PLUGIN) {
                    pluginDef = this.pluginRegistry.actionVerbs.get(step.actionVerb);
                } else if (pluginResult.resultType === PluginParameterType.PLAN) {
                    // If a plan is returned, send it as a successful response
                    res.status(200).send(MapSerializer.transformForSerialization(pluginResult));
                    return;
                } else if (pluginResult.success) {
                    // For other successful outcomes (e.g., DIRECT_ANSWER)
                    res.status(200).send(MapSerializer.transformForSerialization(pluginResult));
                    return;
                } else {
                    // For error cases
                    res.status(400).send(MapSerializer.transformForSerialization(pluginResult));
                    return;
                }
            }

            if (!pluginDef) {
                console.log(`Couldn't create plugin for ${step.actionVerb}`);
                res.status(402).send({
                    success: false,
                    resultType: PluginParameterType.ERROR,
                    error: `Plugin not found for verb: ${step.actionVerb}`
                });
                return;
            }

            let result: PluginOutput[];
            result = await this.executePlugin(pluginDef, step.inputs);
            res.status(200).send(MapSerializer.transformForSerialization(result));
        } catch (error) { //analyzeError(error as Error);
            console.error(`Error executing action verb ${step.actionVerb}:`, error instanceof Error ? error.message : error);
            res.status(400).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: error,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }]);
        }
    }

    private validateAndStandardizeInputs(step: Step) {
        const pluginDef = this.pluginRegistry.actionVerbs.get(step.actionVerb);

        console.log(`Validating inputs for ${step.actionVerb}`);
        if (!pluginDef) {
            return;
        }

        console.log('Validating step inputs', step.inputs);
        const inputs = step.inputs as Map<string, PluginInput>;
        const validInputs = new Map<string, PluginInput>();

        for (const inputDef of pluginDef.inputDefinitions) {
            const inputName = inputDef.name;
            let input = inputs.get(inputName);

            if (!input) {
                // Look for alternative input names (case-insensitive)
                for (const [key, value] of inputs) {
                    if (key.toLowerCase() === inputName.toLowerCase()) {
                        input = value;
                        break;
                    }
                }
            }

            if (!input && inputDef.required) {
                console.log(`Missing required input "${inputName}" for ${step.actionVerb}`);
                validInputs.set(inputName, {
                    inputName,
                    inputValue: null,
                    args: {}
                });
            }

            if (input) {
                validInputs.set(inputName, input);
            }
        }
        console.log('Validated inputs', validInputs);

        // Replace the step's inputs with the validated inputs
        step.inputs = validInputs;
    }

    protected async executePlugin(plugin: Plugin, inputs: Map<string, PluginInput> | Record<string, any>): Promise<PluginOutput[]> {
        let sandbox: PluginSandbox | null = null;
        try {
            // Convert inputs to Map if it's a plain object
            const inputsMap = inputs instanceof Map ? inputs : new Map(Object.entries(inputs));
            
            // Verify plugin security before execution
            if (!plugin.security) {
                throw new Error('Plugin security configuration is required');
            }
    
            // Load plugin-specific configuration
            const configSet = await this.configManager.getPluginConfig(plugin.id);

            // Create sandbox with security settings
            sandbox = new PluginSandbox(plugin);
            console.log('sandbox defined');
            // Execute plugin in sandbox with converted inputs
            const execResult = await sandbox.executePlugin(inputsMap, {
                config: configSet,
                environment: process.env
            });
            console.log('execResult:', execResult);
            return execResult;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Plugin execution failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            if (sandbox) {
                await sandbox.dispose();
            }
        }
    }

    private async handleUnknownVerb(step: Step): Promise<PluginOutput> {
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `How should I handle the action verb "${step.actionVerb}" with the following context: ${context}
            Can we accomplish it with one or more steps using existing verbs?
            Should we create a plugin for this action verb, or should we break down the task into smaller steps?  
            `;

            const accomplishInput: PluginInput = {
                inputName: 'goal',
                inputValue: goal,
                args: {}
            };

            const accomplishInputs = new Map<string, PluginInput>();
            accomplishInputs.set('goal', accomplishInput);

            const result = await AccomplishPlugin(accomplishInputs);

            if (!result[0].success) {
                console.error('ACCOMPLISH plugin failed:', result[0].error);
                return result[0];
            }

            if (result[0].resultType === 'string' && result[0].result.toLowerCase().includes('new plugin')) {
                console.log(`Brain suggests creating new plugin for ${step.actionVerb}`);
                try {
                    const newPlugin = await this.pluginRegistry.createNewPlugin(step.actionVerb, step.inputs);
                } catch (engineerError) {
                    console.error('Engineer plugin creation failed:', engineerError);
                    return {
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        mimeType: 'text/plain',
                        resultDescription: `Unable to create plugin for ${step.actionVerb}`,
                        result: `Unable to create plugin for ${step.actionVerb}. Please try breaking down the task into smaller steps.`
                    };
                }
            }

            return result[0];
        } catch (error) { //analyzeError(error as Error);
            console.error('Error handling unknown verb:', error instanceof Error ? error.message : error);
            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error handling unknown verb',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async getCapabilitiesSummary(): Promise<string> {
        return this.pluginRegistry.getSummarizedCapabilities();
    }
}

// Create and start the CapabilitiesManager
const manager = new CapabilitiesManager();

export default CapabilitiesManager;