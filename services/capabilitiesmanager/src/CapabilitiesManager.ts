import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import { Step, MapSerializer, BaseEntity, PluginInput, PluginOutput, Plugin, ActionVerbTask, PluginParameterType } from '@cktmcs/shared';
import { execute as AccomplishPlugin } from './plugins/ACCOMPLISH/ACCOMPLISH.js';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { analyzeError } from '@cktmcs/errorhandler';

const execAsync = promisify(exec);

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
});

export class CapabilitiesManager extends BaseEntity {
    private actionVerbs: Map<string, Plugin> = new Map();
    private engineerUrl: string = process.env.ENGINEER_URL || 'engineer:5050';
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private pluginsLoaded: boolean = false;
    private currentDir = dirname(fileURLToPath(import.meta.url));

    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        console.log('Starting CapabilitiesManager initialization...');
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
                app.get('/availablePlugins', (req, res) => this.getAvailablePlugins(req, res));

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

            } catch (error) { analyzeError(error as Error);
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
        } catch (error) { analyzeError(error as Error);
            console.error('Failed to start CapabilitiesManager:', error instanceof Error ? error.message : error);
            // Rethrow to let the process manager handle restart if needed
            throw error;
        }
    }

    
    private async loadActionVerbs() {
        if (!this.pluginsLoaded) {
            try {
                // Phase 1: Load plugins from local filesystem
                await this.loadLocalPlugins();
                // Phase 2: Load plugins from Librarian
                await this.loadLibrarianPlugins();
                console.log('Action verbs loaded:', Array.from(this.actionVerbs.keys()));
            } catch (error) { analyzeError(error as Error);
                console.error('Error loading action verbs:', error instanceof Error ? error.message : error);
                this.actionVerbs = new Map();
                console.log('Initialized with empty action verbs map');
            }
            this.pluginsLoaded = true;
        }
    }
    
    private async loadLocalPlugins() {
        const pluginsDir = path.join(this.currentDir, 'plugins');
        await this.recursivelyLoadPlugins(pluginsDir);
    }
    
    private async recursivelyLoadPlugins(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
    
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
    
            if (entry.isDirectory()) {
                await this.recursivelyLoadPlugins(fullPath);
            } else if (entry.isFile() && entry.name === 'plugin.js') {
                await this.loadPluginFromFile(fullPath);
            }
        }
    }
    
    private async loadPluginFromFile(filePath: string) {
        try {
            let plugin;
            if (filePath.endsWith('.js')) {
                // For .js files, try both require and import
                try {
                    plugin = require(filePath);
                } catch (requireError) {
                    const module = await import(filePath);
                    plugin = module.default;
                }
            } else {
                // For other files (e.g., .ts), use import
                const module = await import(filePath);
                plugin = module.default;
            }
    
            if (plugin && plugin.id && plugin.verb) {
                this.actionVerbs.set(plugin.verb, plugin);
                console.log(`Loaded plugin ${plugin.verb} from ${filePath}`);
            } else {
                console.warn(`Invalid plugin format in ${filePath}`);
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading plugin from ${filePath}:`, error instanceof Error ? error.message : error);
        }
    }

    private async loadLibrarianPlugins() {
        try {
            console.log(`Attempting to fetch plugins from Librarian at ${this.librarianUrl}`);
            const response = await axios.get(`http://${this.librarianUrl}/searchData`, {
                params: { 
                    collection: 'plugins', 
                    query: {}, 
                    options: { id: 1, name: 1, description: 1, version: 1, type: 1, verb: 1 } 
                },
                timeout: 5000 // Set a 5-second timeout
            });
            const pluginList = response.data.data || response.data;
            if (pluginList && Array.isArray(pluginList)) {
                for (const plugin of pluginList) {
                    if (plugin.verb && !this.actionVerbs.has(plugin.verb)) {
                        this.actionVerbs.set(plugin.verb, plugin);
                        console.log(`Loaded plugin ${plugin.verb} from Librarian`);
                    }
                }
                console.log(`Successfully loaded ${pluginList.length} plugins from Librarian`);
            } else {
                console.warn('Unexpected response format from Librarian:', pluginList);
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading plugins from Librarian:', error instanceof Error ? error.message : error);
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    console.error('Librarian response status:', error.response.status);
                    console.error('Librarian response data:', error.response.data);
                    console.error('Librarian response headers:', error.response.headers);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error('No response received from Librarian');
                    console.error('Request details:', error.request);
                } else {
                    // Something happened in setting up the request that triggered an Error
                    console.error('Error setting up the request:', error.message);
                }
            console.error('Axios error config:', error.config);                }
            // Continue execution even if Librarian plugins couldn't be loaded
            console.warn('Continuing without Librarian plugins');
            }

    }
    


    private async getAvailablePlugins(req: express.Request, res: express.Response) {
        try {
            await this.loadActionVerbs();
            const availablePlugins = Array.from(this.actionVerbs.keys());
            res.status(200).send(availablePlugins);
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting available plugins:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get available plugins' });
        }
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        try {
            const message = req.body;
            console.log('Received message:', message);
            await super.handleBaseMessage(message);
            res.status(200).send({ status: 'Message received and processed' });
        } catch (error) { analyzeError(error as Error);
            console.error('Error handling message:', error instanceof Error ? error.message : error);
            res.status(500).send({ 
                status: 'Error processing message', 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
        }
    }

    private async executeActionVerb(req: express.Request, res: express.Response) {
        const { step } = MapSerializer.transformFromSerialization(req.body);
        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            throw new Error('Invalid or missing verb');
        }
        if (!step.inputs || typeof step.inputs !== 'object') {
            throw new Error('Invalid or missing inputs');
        }

        // Validate and standardize inputs for known plugins
        this.validateAndStandardizeInputs(step);
        await this.loadActionVerbs();
        try {
            let pluginDef = this.actionVerbs.get(step.actionVerb);

            if (!pluginDef) {
                const pluginResult = await this.handleUnknownVerb(step);
                if (pluginResult.resultType === PluginParameterType.PLUGIN) {
                    pluginDef = this.actionVerbs.get(step.actionVerb);
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
            if (pluginDef.language === 'javascript') {
                result = await this.executeJavaScriptPlugin(pluginDef, step.inputs);
            } else if (pluginDef.language === 'python') {
                result = await this.executePythonPlugin(pluginDef, step.inputs);
            } else {
                throw new Error(`Unsupported plugin language: ${pluginDef.language}`);
            }
                
            res.status(200).send(MapSerializer.transformForSerialization(result));
        } catch (error) { analyzeError(error as Error);
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
        const pluginDef = this.actionVerbs.get(step.actionVerb);

        if (!pluginDef) {
            // If there's no plugin for this actionVerb, consider inputs validated
            return;
        }

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

            if (!input && inputDef.required ) {
                throw new Error(`Missing required input "${inputName}" for ${step.actionVerb}`);
            }

            if (input) {
                validInputs.set(inputName, input);
            }
        }

        // Replace the step's inputs with the validated inputs
        step.inputs = validInputs;
    }

    private async executeJavaScriptPlugin(plugin: Plugin, inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        const pluginDir = path.join(this.currentDir, 'plugins', plugin.verb);
        const mainFilePath = path.join(pluginDir, plugin.entryPoint!.main);

        try {
            // Dynamically import the main file
            const pluginModule = await import(mainFilePath);
            
            if (typeof pluginModule.execute !== 'function') {
                throw new Error(`Plugin ${plugin.verb} does not export an execute function`);
            }
            console.log(`Executing JS plugin <${plugin.verb}> with inputs:`, inputs);

            // Execute the plugin
            const result = await pluginModule.execute(inputs);
            console.log('capabilitiesManager received result from execute:', MapSerializer.transformForSerialization(result));
            return result;
        } catch (error) { analyzeError(error as Error);
            console.error(`Error executing JavaScript plugin ${plugin.verb}:`, error instanceof Error ? error.message : error);
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

    private async executePythonPlugin(plugin: Plugin, inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        const pluginDir = path.join(this.currentDir, 'plugins', plugin.verb);
        const mainFilePath = path.join(pluginDir, plugin.entryPoint!.main);

        try {
            // Create a temporary file for the input
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-input-'));
            const inputFilePath = path.join(tmpDir, 'input.json');
            await fs.writeFile(inputFilePath, JSON.stringify(inputs));

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
        } catch (error) { analyzeError(error as Error);
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
                    const newPlugin = await this.requestEngineerForPlugin(step.actionVerb, step.inputs);
                    await this.createPluginFiles(newPlugin);
                    this.actionVerbs.set(step.actionVerb, newPlugin);
                    return {
                        success: true,
                        name: 'newPlugin',
                        resultType: PluginParameterType.PLUGIN,
                        resultDescription: `Created new plugin for ${step.actionVerb}`,
                        result: `Created new plugin for ${step.actionVerb}`
                    };
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
        } catch (error) { analyzeError(error as Error);
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

    private async createPluginFiles(plugin: Plugin): Promise<void> {
        const pluginDir = path.join(this.currentDir, 'plugins', plugin.verb);
    
        try {
            // Create plugin directory
            await fs.mkdir(pluginDir, { recursive: true });

            // Write entryPoint files
            if (plugin.entryPoint && plugin.entryPoint.files) {
                for (const fileObj of plugin.entryPoint.files) {
                    const [filename, content] = Object.entries(fileObj)[0];
                    await fs.writeFile(path.join(pluginDir, filename), content);
                }
            }

            // Create plugin.js file
            const pluginJsContent = this.generatePluginJsContent(plugin);
            await fs.writeFile(path.join(pluginDir, 'plugin.js'), pluginJsContent);

            console.log(`Created plugin files for ${plugin.verb}`);
        } catch (error) { analyzeError(error as Error);
            console.error(`Error creating plugin files for ${plugin.verb}:`, error instanceof Error ? error.message : error);
            throw error;
        }
    }

    private generatePluginJsContent(plugin: Plugin): string {
        return `
        import { Plugin, PluginParameterType } from '@cktmcs/shared';

        const ${plugin.verb.toLowerCase()}Plugin = {
        id: '${plugin.id}',
        verb: '${plugin.verb}',
        description: ${JSON.stringify(plugin.description)},
        explanation: ${JSON.stringify(plugin.explanation)},
        inputDefinitions: ${JSON.stringify(plugin.inputDefinitions, null, 2)},
        outputDefinitions: ${JSON.stringify(plugin.outputDefinitions, null, 2)},
        language: '${plugin.language}',
        entryPoint: ${JSON.stringify(plugin.entryPoint, null, 2)}
        };

        export default ${plugin.verb.toLowerCase()}Plugin;
        `;
    }

    private async requestEngineerForPlugin(verb: string, context: Map<string, PluginInput>): Promise<Plugin> {
        console.log(`Requesting Engineer to create plugin for ${verb}`);
        try {
            const response = await api.post(`http://${this.engineerUrl}/createPlugin`, MapSerializer.transformForSerialization({ verb, context }));
            const newPlugin = response.data;
            
            if (!newPlugin || !newPlugin.entryPoint) {
                throw new Error('Engineer returned invalid plugin data');
            }
            console.log(`Successfully created new plugin for ${verb}`);
            return newPlugin;
        } catch (error) { analyzeError(error as Error);
            console.error(`Engineer plugin creation failed for ${verb}:`, error instanceof Error ? error.message : error);
            throw new Error(`Plugin creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
}

// Create and start the CapabilitiesManager
const manager = new CapabilitiesManager();
manager.start().catch(error => {
    console.error('Failed to start CapabilitiesManager:', error instanceof Error ? error.message : error);
    process.exit(1);
});

export default CapabilitiesManager;