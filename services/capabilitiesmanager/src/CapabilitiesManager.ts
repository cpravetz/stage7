import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import { Step, MapSerializer, BaseEntity  } from '@cktmcs/shared';
import { PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType } from '@cktmcs/shared';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { analyzeError } from '@cktmcs/errorhandler';
import { ConfigManager } from './utils/configManager.js';
import { PluginRegistry } from './utils/pluginRegistry.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PluginMarketplace } from '@cktmcs/marketplace';

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
    private pluginMarketplace: PluginMarketplace;


    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        console.log('Starting CapabilitiesManager initialization...');
        // Initialize with placeholder objects
        this.pluginMarketplace = new PluginMarketplace(this.librarianUrl);
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
                app.get('/availablePlugins', (req, res) => this.pluginRegistry.getAvailablePlugins(req, res));
                app.post('/notify', (req, res) => this.pluginRegistry.handlePluginChange(req.body));
                app.post('/registerPlugin', async (req, res) => this.registerPlugin(req, res));
                app.get('/plugins/:pluginId', async (req, res) => this.getPluginById(req, res));
                app.get('/plugins/:pluginId/metadata', async (req, res) => this.getPluginMetadata(req, res));
                app.get('/plugins/category/:category', async (req, res) => {res.json(await this.pluginRegistry.getPluginsByCategory(req.params.category))});
                app.get('/plugins/capabilities', async (req, res) => {res.json(await this.pluginRegistry.getSummarizedCapabilities())});
                app.get('/plugins/tags', async (req, res) => {res.json(await this.pluginRegistry.getPluginsByTags(req.query.tags as string[]))});

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

    private async registerPlugin(req: express.Request, res: express.Response) {
        try {
            const plugin = req.body;
            // Publish plugin to marketplace
            await this.pluginMarketplace.publishPlugin(plugin, {
                type: 'mongo',
                url: this.librarianUrl
            });
            console.log('CapabilitiesManager: Plugin registered:', plugin.id);
            res.status(200).json({ 
                message: 'Plugin registered successfully',
                pluginId: plugin.id 
            });

        } catch (error) {
            analyzeError(error as Error);
            res.status(500).json({ 
                error: `Failed to register plugin: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }

    private validatePluginStructure(plugin: any): plugin is PluginDefinition {
        return (
            typeof plugin.id === 'string' &&
            typeof plugin.verb === 'string' &&
            typeof plugin.description === 'string' &&
            Array.isArray(plugin.inputDefinitions) &&
            Array.isArray(plugin.outputDefinitions) &&
            plugin.entryPoint &&
            typeof plugin.entryPoint.main === 'string' &&
            (plugin.language === 'javascript' || plugin.language === 'python')
        );
    }

    private async getPluginById(req: express.Request, res: express.Response) {
        try {
            const plugin = await this.pluginMarketplace.getPlugin(req.params.pluginId);
            if (plugin) {
                res.status(200).json(plugin);
            } else {
                res.status(404).json({ error: 'Plugin not found' });
            }
        } catch (error) {
            res.status(500).json({ error: `Failed to get plugin: ${error instanceof Error ? error.message : String(error)}` });
        }
    }

    private async getPluginMetadata(req: express.Request, res: express.Response) {
        const { pluginId } = req.params;
        try {
            const plugin = await this.pluginMarketplace.getPlugin(pluginId);
            if (!plugin) {
                res.status(404).json({ error: 'Plugin not found' });
                return;
            }
            res.status(200).json({
                id: plugin.id,
                verb: plugin.verb,
                description: plugin.description,
                metadata: plugin.metadata,
                inputDefinitions: plugin.inputDefinitions,
                outputDefinitions: plugin.outputDefinitions
            });
        } catch (error) {
            res.status(500).json({ 
                error: `Failed to get plugin metadata: ${error instanceof Error ? error.message : String(error)}` 
            });
        }
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        console.log('Executing action verb with req.body:', JSON.stringify(req.body, null, 2));
        const step = {
            ...req.body,
            inputs: MapSerializer.transformFromSerialization(req.body.inputs)
        };
        console.log('Executing action verb:', step.actionVerb);
        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            console.log('Invalid or missing verb', step.actionVerb);
            res.status(400).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: 'Invalid or missing verb',
                error: 'Invalid or missing verb'
            }]);
            return;
        }

        if (!step.inputs || !(step.inputs instanceof Map)) {
            console.log('Invalid or missing inputs', step.inputs);
            res.status(400).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: 'Invalid or missing inputs',
                error: 'Invalid or missing inputs'
            }]);
            return;
        }

        try {
            // First check registry cache
            let plugin = await this.pluginRegistry.getPluginByVerb(step.actionVerb);
            console.log('Plugin found in cache:', plugin?.id);
            if (!plugin) {
                // If not in cache, handle unknown verb
                const result = await this.handleUnknownVerb(step);
                if (!result.success) {
                    console.error('Error handling unknown verb:', result.error);
                    res.status(400).send(MapSerializer.transformForSerialization(result));
                    return;
                }
                console.log('Plugin created:', result.result);
                // Try to get the plugin again after handling unknown verb
                plugin = await this.pluginRegistry.getPluginByVerb(step.actionVerb);
                if (!plugin) {
                    console.log('Newly created plugin not found in Registry cache');
                    res.status(404).send({
                        success: false,
                        resultType: PluginParameterType.ERROR,
                        error: `Plugin not found for verb: ${step.actionVerb}`
                    });
                    return;
                }
            }

            console.log('capabilitiesManager validating inputs', step.inputs);
            // Validate and standardize inputs
            const validatedInputs = await this.validateAndStandardizeInputs(plugin, step.inputs);
            if (!validatedInputs.success) {
                console.log('Error validating inputs:', validatedInputs.error);
                res.status(400).send([{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    error: validatedInputs.error
                }]);
                return;
            }
            console.log('Inputs validated successfully:', validatedInputs.inputs);

            // Execute plugin with validated inputs
            const result = await this.executePlugin(plugin, validatedInputs.inputs || new Map<string, PluginInput>());
            console.log('Plugin executed successfully:', result);
            res.status(200).send(MapSerializer.transformForSerialization(result));

        } catch (error) {
            console.error(`Error executing action verb ${step.actionVerb}:`, error instanceof Error ? error.message : error);
            res.status(500).send([{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: error,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }]);
        }
    }

    private async validateAndStandardizeInputs(plugin: PluginDefinition, inputs: Map<string, PluginInput>): 
    Promise<{ success: boolean; inputs?: Map<string, PluginInput>; error?: string }> {
        const validInputs = new Map<string, PluginInput>();
        console.log('Validating inputs:', inputs);  
        try {
            for (const inputDef of plugin.inputDefinitions) {
                const inputName = inputDef.name;
                let input = inputs.get(inputName);

                if (!input) {
                    // Look for case-insensitive match
                    for (const [key, value] of inputs) {
                        if (key.toLowerCase() === inputName.toLowerCase()) {
                            input = value;
                            break;
                        }
                    }
                }

                // Handle required inputs
                if (!input && inputDef.required) {
                    return {
                        success: false,
                        error: `Missing required input "${inputName}" for ${plugin.verb}`
                    };
                }

                // Validate input type if present
                if (input && inputDef.type) {
                    const isValid = await this.validateInputType(input.inputValue, inputDef.type);
                    if (!isValid) {
                        return {
                            success: false,
                            error: `Invalid type for input "${inputName}". Expected ${inputDef.type}`
                        };
                    }
                }

                if (input) {
                    validInputs.set(inputName, input);
                }
            }

            return { success: true, inputs: validInputs };
        } catch (error) {
            return {
                success: false,
                error: `Input validation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    protected async executePlugin(plugin: PluginDefinition, inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        try {
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
        
            // Execute with environment
            if (plugin.language === 'javascript') {
                return this.executeJavaScriptPlugin(plugin, inputs, environment);
            } else if (plugin.language === 'python') {
                return this.executePythonPlugin(plugin, inputs, environment);
            }
            
            throw new Error(`Unsupported plugin language: ${plugin.language}`);
        } catch (error) {
            throw error;
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
                resultDescription: `Error executing plugin ${plugin.verb}: ${error instanceof Error ? error.message : String(error)}`,
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
            const goal = `How should I handle the action verb "${step.actionVerb}" with the following context: ${context}
            Can we accomplish it with one or more steps using existing verbs?
            Should we create a plugin for this action verb, or should we break down the task into smaller steps?`;

            // Use ACCOMPLISH plugin to determine course of action
            const accomplishResult = await this.executeAccomplishPlugin(goal);
            
            if (!accomplishResult.success) {
                console.error('Error executing ACCOMPLISH plugin:', accomplishResult.error);
                return accomplishResult;
            }

            if (accomplishResult.resultType === PluginParameterType.PLUGIN) {
                // Request new plugin creation from Engineer
                const engineerResult = await this.requestPluginFromEngineer(step);
                if (!engineerResult.success) {
                    return engineerResult;
                }
                
                // Plugin should now be available in marketplace
                const plugin = await this.pluginMarketplace.getPluginByVerb(step.actionVerb);
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
                    resultDescription: 'Created new plugin for ' + step.actionVerb
                };
            }

            return accomplishResult;

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

    private async executeAccomplishPlugin(goal: string): Promise<PluginOutput> {
        const accomplishInputs = new Map<string, PluginInput>([
            ['goal', { inputName: 'goal', inputValue: goal, args: {} }]
        ]);

        const plugin = await this.pluginRegistry.getPluginByVerb('ACCOMPLISH');
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
    }

    private async requestPluginFromEngineer(step: Step): Promise<PluginOutput> {
        try {
            const engineerUrl = process.env.ENGINEER_URL || 'engineer:5070';
            const response = await axios.post(`http://${engineerUrl}/createPlugin`, {
                verb: step.actionVerb,
                context: step.inputs
            });

            if (response.data.success) {
                return {
                    success: true,
                    name: 'plugin_created',
                    resultType: PluginParameterType.PLUGIN,
                    result: response.data.plugin,
                    resultDescription: 'Created new plugin for ' + step.actionVerb
                };
            }

            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                error: response.data.error || 'Failed to create plugin',
                resultDescription: 'Failed to create plugin',
                result: null
            };
        } catch (error) {
            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                error: error instanceof Error ? error.message : 'Failed to create plugin',
                resultDescription: 'Failed to create plugin',
                result: null
            };
        }
    }

    private async validateInputType(value: any, expectedType: string): Promise<boolean> {
        switch (expectedType.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true; // Allow unknown types to pass validation
        }
    }

    async getCapabilitiesSummary(): Promise<string> {
        return this.pluginRegistry.getSummarizedCapabilities();
    }
}

// Create and start the CapabilitiesManager
const manager = new CapabilitiesManager();

export default CapabilitiesManager;