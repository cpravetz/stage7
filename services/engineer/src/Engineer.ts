import axios from 'axios';
import express from 'express';
import { MapSerializer, BaseEntity, PluginInput, Plugin, PluginParameter } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });


export class Engineer extends BaseEntity {
    private brainUrl: string = process.env.BRAIN_URL ||  'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL ||  'librarian:5040';
    private newPlugins : Array<string> = [];

    constructor() {
        super('Engineer', 'Engineer', `engineer`, process.env.PORT || '5050');
        this.setupServer();
    }

    private async setupServer() {
        const app = express();
        app.use(express.json());

        app.post('/createPlugin', async (req, res) => {
            const { verb, context } = MapSerializer.transformFromSerialization(req.body);
            try {
                const plugin = await this.createPlugin(verb, context);
                res.json(plugin);
            } catch (error) { analyzeError(error as Error);
                console.error('Failed to create plugin:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error)  });
            }
        });

        app.post('/message', (req, res) => this.handleMessage(req, res));

        app.get('/statistics', (req, res) => { this.getStatistics(req, res) });

        app.listen(this.port, () => {
            console.log(`Engineer listening at ${this.url}`);
        });
    }

    private getStatistics(req: express.Request, res: express.Response) {
        res.status(200).json({ newPlugins: this.newPlugins });
    }

    private async handleMessage(req: express.Request, res: express.Response) {
        const message = req.body;
        console.log('Received message:', message);
        await super.handleBaseMessage(message);

        // Process the message based on its content
        // This might involve managing agent traffic or assignments
    
        res.status(200).send({ status: 'Message received and processed' });
    }
    
    async createPlugin(verb: string, context: Map<string, PluginInput>): Promise<Plugin> {
        this.newPlugins.push(verb);
        const explanation = await this.generateExplanation(verb, context);
        let pluginStructure: Plugin;
        
        try {
            const contextString = JSON.stringify(Array.from(context.entries()));
            const engineeringPrompt = `
    Create a "javascript" or "python" based plugin for the action verb "${verb}" with the following context: ${explanation}
    
    The plugin should expect inputs structured as a Map<string, PluginInput>, where PluginInput is defined as:
    
    interface PluginInput {
        inputValue: string | number | boolean | any[] | object | null;
        args: Record<string, any>;
        dependencyOutputs: Record<string, any>;
        agentDependencies?: Record<string, any>;
    }
    
    Use this context to determine the required inputs: ${contextString}
    
    Provide a JSON object with the following structure:
    
    export interface Plugin {
        id: string;
        verb: string;
        description?: string;
        explanation?: string;
        inputDefinitions: PluginParameter[];
        outputDefinitions: PluginParameter[];
        entryPoint?: EntryPointType;
        language: 'javascript' | 'python';
    }
    
    Supporting types are:
    export enum PluginParameterType {
        STRING = 'string',
        NUMBER = 'number',
        BOOLEAN = 'boolean',
        ARRAY = 'array',
        OBJECT = 'object',
        PLAN = 'plan',
        PLUGIN = 'plugin',
        ERROR = 'error'
    }
    
    export interface EntryPointType {
        main: string;
        files: Record<string,string>[];
    }
    
    export interface PluginParameter {
        name: string;
        required: boolean;
        type: PluginParameterType;
        description: string;
        mimeType?: string;
    }
    
    Ensure the plugin's 'inputDefinitions' field accurately defines the expected PluginInputs based on the provided context.
    The main file should implement the plugin logic and handle the inputs correctly, expecting a Map<string, PluginInput>.
    Include appropriate error handling and logging.
    The code should be immediately executable without any compilation step.
    `;
    
            const response = await axios.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', message: engineeringPrompt }],
                optimization: 'accuracy'
            });
            pluginStructure = JSON.parse(response.data.result);
            
            if (!pluginStructure || !pluginStructure.entryPoint) {
                throw new Error('Invalid plugin structure generated');
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error querying Brain for plugin structure:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate plugin structure');
        }
    
        const newPlugin: Plugin = {
            id: `plugin-${verb}`,
            verb: verb,
            description: pluginStructure.description,
            explanation: explanation,
            inputDefinitions: pluginStructure.inputDefinitions,
            outputDefinitions: pluginStructure.outputDefinitions,
            entryPoint: {
                main: pluginStructure.entryPoint.main,
                files: pluginStructure.entryPoint.files
            },
            language: pluginStructure.language
        };
    
        // Save the plugin to the librarian
        try {
            await api.post(`http://${this.librarianUrl}/storeData`, {
                id: newPlugin.id,
                data: newPlugin,
                collection: 'plugins',
                storageType: 'mongo'
            });
    
            return newPlugin;
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving or creating plugin:', error instanceof Error ? error.message : error);
            throw new Error('Failed to save or create plugin');
        }
    }
    
    private async generateExplanation(verb: string, context: Map<string, PluginInput>): Promise<string> {
        const prompt = `Given the action verb "${verb}" and the context "${context}", provide a detailed explanation of what a plugin for this verb should do. Include expected inputs and outputs.`;
        try {
            const response = await axios.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', message: prompt }],
                optimization: 'accuracy'
            });

            return response.data.result;
        } catch (error) { analyzeError(error as Error);
            console.error('Error querying Brain:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate explanation');
        }
    }
}

// Instantiate the Engineer
new Engineer();