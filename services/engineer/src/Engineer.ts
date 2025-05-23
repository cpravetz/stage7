import axios from 'axios';
import express from 'express';
import { MapSerializer, BaseEntity, PluginInput, PluginDefinition, PluginParameter, ConfigItem, MetadataType, signPlugin, EntryPointType, PluginParameterType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path'; // Added for temp file path
import os from 'os'; // Added for temp directory

const execAsync = promisify(exec);
import { createHash } from 'crypto';

// NOTE: Don't use this directly - use this.authenticatedApi or this.getAuthenticatedAxios() instead
// This is kept for backward compatibility only
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

        // Use the BaseEntity verifyToken method for authentication
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip authentication for health endpoints
            if (req.path === '/health' || req.path === '/ready') {
                return next();
            }

            // Use the BaseEntity verifyToken method
            this.verifyToken(req, res, next);
        });

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

        app.post('/message', (req, res) => this.handleMessage(req, res));
        app.get('/statistics', (req, res) => { this.getStatistics(req, res) });

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
            const engineeringPrompt = `Create a Python 3.9+ based plugin for the action verb "${verb}" with the following context: ${explanation}. If Python is not suitable for this specific task (provide a brief justification if so), you may generate a JavaScript plugin instead.

            The planner provides this additional guidance: ${guidance}

            The plugin should expect inputs structured as a Map<string, PluginInput>, where PluginInput is defined as:

            interface PluginInput {
                inputValue: string | number | boolean | any[] | object | null;
                args: Record<string, any>; // Note: For Python, this structure will be part of the JSON received on stdin
                // dependencyOutputs, agentDependencies are less relevant for direct code generation prompt
            }

            Use this context to determine the required inputs: ${contextString}

             Important requirements:
              1. The plugin MUST include comprehensive error handling.
              2. All external dependencies must be explicitly declared (e.g., in requirements.txt for Python).
              3. Include input validation for all parameters within the plugin logic.
              4. Add logging for important operations.
              5. If the plugin might generate a plan, include PLAN in outputDefinitions.
              6. Include comprehensive unit tests in a separate file (e.g., 'test_main.py' for Python or 'plugin.test.js' for JavaScript) covering primary functionality, input validation, and edge cases.
              7. Add retry logic for external service calls if applicable.
              8. Python plugins MUST read their inputs (a JSON string representing Map<string, PluginInput> equivalent) from standard input (stdin) and print their results (a JSON string representing PluginOutput[] array) to standard output (stdout).
              9. Generated code should follow security best practices, including sanitizing any inputs used in shell commands or file paths, and avoiding common vulnerabilities.
              10. For Python plugins, ensure the main logic is in a 'main.py' file.
              11. If the Python plugin requires external Python packages, include a 'requirements.txt' file in the entryPoint.files listing these dependencies (e.g., requests==2.25.1).

            Provide a JSON object with the following structure:
            {
                "id": "plugin-${verb}",
                "verb": "${verb}",
                "description": "A short description of the plugin",
                "explanation": "A more complete description including inputs, process overview, and outputs",
                "inputDefinitions": [{
                  "name": "string",
                  "required": true, // or false
                  "type": "PluginParameterType (e.g. string, number, object)",
                  "description": "string"
                }],
                "outputDefinitions": [{
                  "name": "string",
                  "required": true, // or false
                  "type": "PluginParameterType (e.g. string, object, plan)",
                  "description": "string"
                }],
                // Example for Python:
                "language": "python",
                "entryPoint": {
                    "main": "main.py",
                    "files": {
                        "main.py": "# Python code here...\nimport json, sys\nif __name__ == '__main__':\n  try:\n    inputs_map = json.load(sys.stdin)\n    # Example: process inputs_map['input_name']['inputValue']\n    # Replace with actual plugin logic \n    result = [{'name': 'outputName', 'result': 'resultValue', 'resultType': 'string', 'success': True, 'resultDescription': 'Operation successful'}]\n  except Exception as e:\n    result = [{'name': 'error', 'result': str(e), 'resultType': 'ERROR', 'success': False, 'resultDescription': 'An error occurred'}]\n  print(json.dumps(result))",
                        "requirements.txt": "# e.g., requests>=2.20"
                    },
                    "test": {
                        "test_main.py": "# Python unit tests here..."
                    }
                },
                // Example for JavaScript:
                // "language": "javascript",
                // "entryPoint": {
                //     "main": "plugin.js",
                //     "files": {
                //         "plugin.js": "// JavaScript code here..."
                //     },
                //     "test": {
                //         "plugin.test.js": "// JavaScript unit tests here..."
                //     }
                // },
                "configuration": [{ // array of configuration items
                    "key": "API_KEY_EXAMPLE",
                    "value": "default_value_if_any",
                    "description": "Description of the configuration item",
                    "required": true
                }],
                "metadata": {
                    "category": ["category1", "category2"],
                    "tags": ["tag1", "tag2"],
                    "complexity": 5, // number from 1 to 10
                    "dependencies": ["dependency1", "dependency2"], // e.g., other plugins or services
                    "version": "1.0.0"
                }
            }

            Relevant TypeScript type definitions for structure:
            PluginParameterType: ${JSON.stringify(Object.values(PluginParameterType))}

            Ensure the plugin's 'inputDefinitions' field accurately defines the expected PluginInputs based on the provided context.
            The main file should implement the plugin logic and handle the inputs correctly.
            Include appropriate error handling and logging.
            Use publicly available web services where possible.
            The code should be immediately executable (Python scripts, JavaScript).
            Determine any necessary environment variables or configuration items needed for the plugin to function correctly and list them in 'configuration'.
`;

            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: engineeringPrompt }],
                optimization: 'accuracy'
            });
            const pluginStructure = JSON.parse(response.data.result);

            // Validate the generated plugin structure
            if (!this.validatePluginStructure(pluginStructure)) {
                // More specific error or logging can be added in validatePluginStructure
                throw new Error('Generated plugin structure is invalid or incomplete.');
            }

            // Run basic syntax validation on the generated code
            if (!await this.validatePluginCode(pluginStructure.entryPoint, pluginStructure.language)) {
                throw new Error('Generated plugin code failed validation');
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
      // TODO: Implement JSON schema validation for comprehensive manifest checking.
      const requiredFields = ['id', 'verb', 'inputDefinitions', 'outputDefinitions', 'entryPoint', 'language'];
      for (const field of requiredFields) {
          if (!plugin[field]) {
              console.error(`Plugin structure validation failed: Missing required field '${field}'.`);
              return false;
          }
      }

      if (!plugin.entryPoint.main || typeof plugin.entryPoint.main !== 'string' || plugin.entryPoint.main.trim() === '') {
        console.error(`Plugin structure validation failed: 'entryPoint.main' must be a non-empty string.`);
        return false;
      }

      if (!plugin.entryPoint.files || typeof plugin.entryPoint.files !== 'object' || Object.keys(plugin.entryPoint.files).length === 0) {
          console.error(`Plugin structure validation failed: 'entryPoint.files' must be a non-empty object.`);
          return false;
      }
      return true;
    }

    private async validatePluginCode(entryPoint: EntryPointType, language: string): Promise<boolean> {
        if (!entryPoint || !entryPoint.files) {
            console.warn('Code validation warning: entryPoint or entryPoint.files is missing. Skipping code validation.');
            return true; // Or false, depending on strictness requirements
        }
        try {
            for (const [filename, content] of Object.entries(entryPoint.files)) {
                if (typeof content !== 'string') {
                    console.error(`Code validation error: Content of ${filename} is not a string.`);
                    return false;
                }
                if (language === 'javascript' && (filename.endsWith('.js') || filename.endsWith('.ts'))) {
                    console.log(`Validating JavaScript syntax for ${filename}...`);
                    new Function(content as string); // Basic syntax check
                    console.log(`JavaScript syntax OK for ${filename}`);
                } else if (language === 'python' && filename.endsWith('.py')) {
                    console.log(`Validating Python syntax for ${filename}...`);
                    const tempPyFile = path.join(os.tmpdir(), `validate_${Date.now()}.py`);
                    try {
                        await fs.writeFile(tempPyFile, content as string);
                        await execAsync(`python3 -m py_compile ${tempPyFile}`);
                        console.log(`Python syntax OK for ${filename}`);
                    } catch (compileError: any) {
                        console.error(`Python syntax error in ${filename}:`, compileError.stderr || compileError.message);
                        throw new Error(`Python syntax error in ${filename}: ${compileError.stderr || compileError.message}`);
                    } finally {
                        await fs.unlink(tempPyFile).catch(e => console.error(`Failed to delete temp file ${tempPyFile}:`, e));
                    }
                }
            }
            return true;
        } catch (error) {
            console.error('Code validation error during processing:', error);
            return false;
        }
    }

    private finalizePlugin(pluginStructure: any, explanation: string): PluginDefinition {
      // Create the plugin definition
      const plugin: PluginDefinition = {
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
                  publisher: 'system-generated'
              }
          }
      };

      // Sign the plugin
      try {
          // Sign the plugin using the RSA key if available
          plugin.security.trust.signature = signPlugin(plugin);
          console.log(`Plugin ${plugin.id} signed successfully`);
      } catch (error) {
          console.error(`Error signing plugin ${plugin.id}:`, error instanceof Error ? error.message : error);
      }

      return plugin;
  }

    private async generateExplanation(verb: string, context: Map<string, PluginInput>): Promise<string> {
        const prompt = `Given the action verb "${verb}" and the context "${context}", provide a detailed explanation of what a plugin for this verb should do. Include expected inputs and outputs.`;
        try {
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
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