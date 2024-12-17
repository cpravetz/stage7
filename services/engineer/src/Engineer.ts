import axios from 'axios';
import express from 'express';
import { MapSerializer, BaseEntity, PluginInput, PluginDefinition, PluginParameter, ConfigItem, MetadataType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { createHash } from 'crypto';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export class Engineer extends BaseEntity {
    private brainUrl: string = process.env.BRAIN_URL || 'brain:5070';
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private newPlugins: Array<string> = [];
    private pluginMarketplace: PluginMarketplace;

    constructor() {
        super('Engineer', 'Engineer', `engineer`, process.env.PORT || '5050');
        this.pluginMarketplace = new PluginMarketplace();
        this.initialize();
    }

    private async initialize() {
        await this.setupServer();
    }

    private async setupServer() {
        const app = express();
        app.use(express.json());

        app.post('/createPlugin', async (req, res) => {
            const { verb, context, guidance } = MapSerializer.transformFromSerialization(req.body);
            try {
                const plugin = await this.createPlugin(verb, context, guidance);
                res.json(plugin || {});
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to create plugin:', error instanceof Error ? error.message : error);
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        app.post('/message', (req, res) => this.handleMessage(req, res))
        ;app.get('/statistics', (req, res) => { this.getStatistics(req, res) });

        app.listen(this.port, () => {
            console.log(`Engineer listening at ${this.url}`);
        });
    }

    private getStatistics(req: express.Request, res: express.Response) {
        res.status(200).json({ newPlugins: this.newPlugins });
    }
    async createPlugin(verb: string, context: Map<string, PluginInput>, guidance: string): Promise<PluginDefinition | undefined> {
        console.log('Creating plugin for verb:', verb);
        this.newPlugins.push(verb);
        const explanation = await this.generateExplanation(verb, context);
        let pluginStructure: PluginDefinition;
        let configItems: ConfigItem[];
        let metadata: MetadataType;
  
        try {
            const contextString = JSON.stringify(Array.from(context.entries()));
            const engineeringPrompt = `
            Create a javascript or python based plugin for the action verb "${verb}" with the following context: ${explanation}
            
            The planner provides this additional guidance: ${guidance}

            The plugin should expect inputs structured as a Map<string, PluginInput>, where PluginInput is defined as:
            
            interface PluginInput {
                inputValue: string | number | boolean | any[] | object | null;
                args: Record<string, any>;
                dependencyOutputs: Record<string, any>;
                agentDependencies?: Record<string, any>;
            }
            
            Use this context to determine the required inputs: ${contextString}

             Important requirements:
              1. The plugin MUST include comprehensive error handling
              2. All external dependencies must be explicitly declared
              3. Include input validation for all parameters
              4. Add logging for important operations
              5. If the plugin might generate a plan, include PLAN in outputDefinitions
              6. Include unit tests in a separate file
              7. Add retry logic for external service calls
              8. Include proper TypeScript types/interfaces

            Provide a JSON object with the following structure:
            {
                id: 'plugin-{verb}',
                verb: '{verb}',
                description: A short description of the plugin,
                explanation: A more complete description including inputs, process overview, and outputs,
                inputDefinitions: [{
                  name: string,
                  required: boolean,
                  type: PluginParameterType,
                  description: string,
                  validation?: {
                      pattern?: string,
                      min?: number,
                      max?: number,
                      allowedValues?: any[]
                  }
                }],
                outputDefinitions: [{
                  name: string,
                  required: boolean,
                  type: PluginParameterType,
                  description: string
                }],
                language: 'javascript',
                entryPoint: {
                    main: {name of primary code file to run},
                    files: Record<filename, code>,
                    test:  Record<filename, code>,
                },
                configuration: array of configuration items formed like
                {
                    key: {configuration key},
                    value: {default value if any},
                    description: {description of the configuration item},
                    required: true/false
                },
                metadata: {
                    category: [array of categories],
                    tags: [array of tags],
                    complexity: {number from 1 to 10},
                    dependencies: [array of dependencies],
                    version: {version string}
                }
            }
Types used in the plugin structure are:
    
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
        main: string; //Name of entry point file
        files: Record<string,string>; //files defined as filename: filecontent
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
            Determine any necessary environment variables or configuration items needed for the plugin to function correctly.
            `;
    
            const response = await axios.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', message: engineeringPrompt }],
                optimization: 'accuracy'
            });
            const pluginStructure = JSON.parse(response.data.result);
        
            // Validate the generated plugin structure
            if (!this.validatePluginStructure(pluginStructure)) {
                throw new Error('Generated plugin structure is invalid');
            }
    
            // Run basic syntax validation on the generated code
            if (!await this.validatePluginCode(pluginStructure.entryPoint)) {
                throw new Error('Generated plugin code contains syntax errors');
            }
    
            return this.finalizePlugin(pluginStructure, explanation);
        } catch (error) { 
            analyzeError(error as Error);
            console.error('Error querying Brain for plugin structure:', error instanceof Error ? error.message : error);
            return undefined;
        }
    
        const newPlugin: PluginDefinition = {
            id: `plugin-${verb}`,
            verb: verb,
            description: pluginStructure.description,
            explanation: explanation,
            inputDefinitions: pluginStructure.inputDefinitions,
            outputDefinitions: pluginStructure.outputDefinitions,
            entryPoint: pluginStructure.entryPoint,
            language: pluginStructure.language,
            configuration: configItems,
            version: '1.0.0',
            metadata: metadata,
            security: {
                permissions: this.determineRequiredPermissions(pluginStructure),
                sandboxOptions: {
                    allowEval: false,
                    timeout: 5000,
                    memory: 128 * 1024 * 1024, // 128MB
                    allowedModules: ['fs', 'path', 'http', 'https'],
                    allowedAPIs: ['fetch', 'console']
                },
                trust: {
                    publisher: 'system-generated'
                }
            }
        }
        return newPlugin;
    }

    
    private async handleMessage(req: express.Request, res: express.Response) {
        const message = req.body;
        console.log('Received message:', message);
        await super.handleBaseMessage(message);

        // Process the message based on its content
        // This might involve managing agent traffic or assignments
    
        res.status(200).send({ status: 'Message received and processed' });
    }
    
    private determineRequiredPermissions(plugin: PluginDefinition): string[] {
        const permissions: string[] = [];
        if (!plugin.entryPoint?.files) return permissions;
        for (const [_, file] of Object.entries(plugin.entryPoint?.files || {})) {
            if (file.toString().includes('fs.')) permissions.push('fs.read', 'fs.write');
            if (file.toString().includes('fetch(')) permissions.push('net.fetch');
            if (file.toString().includes('http.')) permissions.push('net.http');
            // Add more permission checks as needed
        }
        
        return [...new Set(permissions)]; // Remove duplicates
    }
    
    private validatePluginStructure(plugin: any): boolean {
      const requiredFields = ['id', 'verb', 'inputDefinitions', 'outputDefinitions', 'entryPoint'];
      return requiredFields.every(field => plugin[field]) &&
             plugin.entryPoint.files &&
             Object.keys(plugin.entryPoint.files).length > 0;
    }
  
    private async validatePluginCode(entryPoint: any): Promise<boolean> {
      try {
          // Basic syntax check for JavaScript/TypeScript files
          for (const [filename, content] of Object.entries(entryPoint.files)) {
              if (filename.endsWith('.js') || filename.endsWith('.ts')) {
                  new Function(content as string);
              }
          }
          return true;
      } catch (error) {
          console.error('Code validation error:', error);
          return false;
      }
    }

    private finalizePlugin(pluginStructure: any, explanation: string): PluginDefinition {
      return {
          ...pluginStructure,
          explanation,
          version: '1.0.0',
          security: {
              permissions: this.determineRequiredPermissions(pluginStructure),
              sandboxOptions: {
                  allowEval: false,
                  timeout: 5000,
                  memory: 128 * 1024 * 1024,
                  allowedModules: ['fs', 'path', 'http', 'https'],
                  allowedAPIs: ['fetch', 'console']
              },
              trust: {
                  publisher: 'system-generated',
                  signature: this.signPlugin(pluginStructure)
              }
          }
      };
  }


  private signPlugin(plugin: PluginDefinition): string {
    try {
        // Create a deterministic subset of plugin properties for signing
        const contentToSign = {
            id: plugin.id,
            verb: plugin.verb,
            version: plugin.version,
            entryPoint: plugin.entryPoint,
            security: {
                permissions: plugin.security.permissions,
                sandboxOptions: plugin.security.sandboxOptions
            }
        };

        // Create a deterministic string representation
        const content = JSON.stringify(contentToSign, Object.keys(contentToSign).sort());

        // Generate SHA-256 hash
        return createHash('sha256').update(content).digest('hex');
    } catch (error) {
        console.error('Error signing plugin:', error instanceof Error ? error.message : error);
        // Return a null signature that will fail verification
        return '';
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
        } catch (error) { 
            analyzeError(error as Error);
            console.error('Error querying Brain:', error instanceof Error ? error.message : error);
            return '';
        }
    }
}

// Instantiate the Engineer
new Engineer();