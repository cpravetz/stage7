import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { spawn } from 'child_process';
import { Step, InputValue, PluginOutput, PluginDefinition, PluginParameterType, environmentType, OpenAPITool, MCPTool, MCPActionMapping, MCPAuthentication, ServiceTokenManager, DefinitionManifest, DefinitionType } from '@cktmcs/shared';
import { executePluginInSandbox, validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes } from './errorReporter';
import { ConfigManager } from './configManager';
import { ContainerManager } from './containerManager';
import { ensurePythonDependencies, validatePythonOutput } from './pythonPluginHelper';
import { ContainerExecutionRequest, ContainerPluginManifest } from '../types/containerTypes';
import { createPluginOutputError } from './errorHelper';
import { validateAndStandardizeInputs } from './validator';

interface ExecutionContext {
    inputValues: Map<string, InputValue>;
    environment: environmentType;
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
    trace_id: string;
}

function truncate(obj: any, length = 256): string {
    const str = JSON.stringify(obj);
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
}

export class PluginExecutor {
    private configManager: ConfigManager;
    private containerManager: ContainerManager;
    private librarianUrl: string;
    private securityManagerUrl: string;
    private missionControlUrl: string;  

    constructor(configManager: ConfigManager, containerManager: ContainerManager, librarianUrl: string, securityManagerUrl: string, missionControlUrl: string) {
        this.configManager = configManager;
        this.containerManager = containerManager;
        this.librarianUrl = librarianUrl;
        this.securityManagerUrl = securityManagerUrl;
        this.missionControlUrl = missionControlUrl;
    }

    public async execute(pluginToExecute: PluginDefinition, inputsForPlugin: Map<string, InputValue>, actualPluginRootPath: string, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "PluginExecutor.execute";
        console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginToExecute.id} v${pluginToExecute.version} (${pluginToExecute.verb}) at ${actualPluginRootPath}`);

        // Validate and standardize inputs before execution
        const validationResult = await validateAndStandardizeInputs(pluginToExecute, inputsForPlugin);
        if (!validationResult.success) {
            const errorDetails = validationResult.validationType ? 
                `${validationResult.error} (Type: ${validationResult.validationType})` : 
                validationResult.error;

            // Convert validation errors to 400 status with detailed error structure
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                severity: ErrorSeverity.VALIDATION,
                message: errorDetails || 'Input validation failed',
                contextual_info: {
                    plugin_id: pluginToExecute.id,
                    plugin_verb: pluginToExecute.verb,
                    version: pluginToExecute.version,
                    validation_type: validationResult.validationType,
                    provided_inputs: Array.from(inputsForPlugin.keys())
                },
                http_status: 400,
                trace_id_param: trace_id,
                source_component
            });
        }

        // Use validated inputs for execution
        inputsForPlugin = validationResult.inputs!;

        try {
            const permissionErrors = validatePluginPermissions(pluginToExecute);
            if (permissionErrors.length > 0) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR,
                    message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version},
                    trace_id_param: trace_id,
                    source_component
                });
            }

            if (hasDangerousPermissions(pluginToExecute)) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${pluginToExecute.id} v${pluginToExecute.version} has dangerous permissions.`);
            }

            const configSet = await this.configManager.getPluginConfig(pluginToExecute.id);
            await this.configManager.recordPluginUsage(pluginToExecute.id);

            let token = null;
            let brainToken = null;
            const tokenManager = new ServiceTokenManager(
                this.securityManagerUrl,
                'CapabilitiesManager',
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
            token = await tokenManager.getToken();

            const brainTokenManager = new ServiceTokenManager(
                this.securityManagerUrl,
                'Brain',
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
            brainToken = await brainTokenManager.getToken();
            console.log(`[${trace_id}] ${source_component}: Brain token retrieved: ${brainToken ? 'SUCCESS' : 'FAILED'}`);

            const currentEnv = { ...process.env };
            if (token) currentEnv.S7_CM_TOKEN = token;
            if (brainToken) currentEnv.S7_BRAIN_TOKEN = brainToken;

            const environment: environmentType = {
                env: currentEnv,
                credentials: configSet ?? []
            };
            
            // Add missionId and service URLs to inputsForPlugin if not already present
            if (!inputsForPlugin.has('missionId')) {
                const missionIdEnv = process.env.MISSION_ID || null;
                if (missionIdEnv) {
                    inputsForPlugin.set('missionId', {
                        inputName: 'missionId',
                        value: missionIdEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('postOffice_url')) {
                const postOfficeUrlEnv = process.env.POSTOFFICE_URL || null;
                if (postOfficeUrlEnv) {
                    inputsForPlugin.set('postOffice_url', {
                        inputName: 'postOffice_url',
                        value: postOfficeUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('brain_url')) {
                const brainUrlEnv = process.env.BRAIN_URL || null;
                if (brainUrlEnv) {
                    inputsForPlugin.set('brain_url', {
                        inputName: 'brain_url',
                        value: brainUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('librarian_url')) {
                const librarianUrlEnv = process.env.LIBRARIAN_URL || this.librarianUrl || null;
                if (librarianUrlEnv) {
                    inputsForPlugin.set('librarian_url', {
                        inputName: 'librarian_url',
                        value: librarianUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }
            if (!inputsForPlugin.has('missioncontrol_url')) {
                const missionControlUrlEnv = process.env.MISSIONCONTROL_URL || this.missionControlUrl || null;
                if (missionControlUrlEnv) {
                    inputsForPlugin.set('missioncontrol_url', {
                        inputName: 'missioncontrol_url',
                        value: missionControlUrlEnv,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                }
            }

            const executionInputs = new Map(inputsForPlugin);

            // Add CapabilitiesManager token for calling other services (Librarian, PostOffice, etc.)
            if (token) {
                executionInputs.set('__auth_token', {
                    inputName: '__auth_token',
                    value: token,
                    valueType: PluginParameterType.STRING,
                    args: { token: token }
                });
                console.log(`[${trace_id}] ${source_component}: Added __auth_token to plugin inputs`);
            } else {
                console.log(`[${trace_id}] ${source_component}: WARNING - No CapabilitiesManager token available, __auth_token not added to plugin inputs`);
            }

            // Add Brain token for calling Brain service directly
            if (brainToken) {
                executionInputs.set('__brain_auth_token', {
                    inputName: '__brain_auth_token',
                    value: brainToken,
                    valueType: PluginParameterType.STRING,
                    args: { token: brainToken }
                });
                console.log(`[${trace_id}] ${source_component}: Added __brain_auth_token to plugin inputs`);
            } else {
                console.log(`[${trace_id}] ${source_component}: WARNING - No brain token available, __brain_auth_token not added to plugin inputs`);
            }


            
            // Add Google and LangSearch API keys to the environment passed to the plugin
            if (process.env.GOOGLE_SEARCH_API_KEY) {
                currentEnv.GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY; // Corrected variable name
                console.log(`[${trace_id}] ${source_component}: Added GOOGLE_API_KEY to plugin environment.`);
            }
            if (process.env.GOOGLE_CSE_ID) {
                currentEnv.GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID; // Corrected variable name
                console.log(`[${trace_id}] ${source_component}: Added GOOGLE_SEARCH_ENGINE_ID to plugin environment.`);
            }
            if (process.env.LANGSEARCH_API_KEY) {
                currentEnv.LANGSEARCH_API_KEY = process.env.LANGSEARCH_API_KEY;
                console.log(`[${trace_id}] ${source_component}: Added LANGSEARCH_API_KEY to plugin environment.`);
            }
            const executionContext: ExecutionContext = {
                inputValues: executionInputs,
                environment,
                pluginDefinition: pluginToExecute,
                pluginRootPath: actualPluginRootPath,
                trace_id
            };

            if (pluginToExecute.language === 'javascript') {
                try {
                    const result = await executePluginInSandbox(
                        executionContext.pluginDefinition,
                        Array.from(executionContext.inputValues.values()),
                        executionContext.environment
                    );
                    console.log(`[${trace_id}] ${source_component}: Workproduct from JS plugin:`, truncate(result));
                    return result;
                } catch (sandboxError: any) {
                    console.error(`[${trace_id}] ${source_component}: Sandbox execution failed for ${pluginToExecute.id} v${pluginToExecute.version}, falling back to direct: ${sandboxError.message}`);
                    sandboxError.trace_id = trace_id;
                    throw sandboxError;
                }
            } else if (pluginToExecute.language === 'python') {
                const result = await this.executePythonPlugin(executionContext);
                console.log(`[${trace_id}] ${source_component}: Workproduct from Python plugin:`, truncate(result));
                return result;
            } else if (pluginToExecute.language === 'container') {
                const result = await this.executeContainerPlugin(executionContext);
                console.log(`[${trace_id}] ${source_component}: Workproduct from Container plugin:`, truncate(result));
                return result;
            }

            throw generateStructuredError({
                error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE,
                severity: ErrorSeverity.ERROR,
                message: `Unsupported plugin language: ${pluginToExecute.language}`,
                contextual_info: {plugin_id: pluginToExecute.id, version: pluginToExecute.version},
                trace_id_param: trace_id,
                source_component
            });

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Execution failed for plugin ${pluginToExecute?.id || 'unknown'} v${pluginToExecute?.version || 'unknown'}: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginToExecute?.id,
                    verb: pluginToExecute?.verb,
                    version: pluginToExecute?.version,
                    original_error_stack: error.stack
                }
            });
        }
    }

    private async executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "PluginExecutor.executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);

        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);
        
        try {
            // await ensurePythonDependencies(pluginRootPath, trace_id); // Removed as it's now handled during plugin preparation

            const isWindows = process.platform === 'win32';
            const venvBinDir = isWindows ? path.join(pluginRootPath, 'venv', 'Scripts') : path.join(pluginRootPath, 'venv', 'bin');
            const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');

            let pythonExecutable: string;
            if (fs.existsSync(venvPythonPath)) {
                pythonExecutable = venvPythonPath;
            } else {
                pythonExecutable = isWindows ? 'python.exe' : 'python3'; // Fallback to system python
            }

            const inputsArray: [string, InputValue][] = Array.from(inputValues.entries());
            const inputsJsonString = JSON.stringify(inputsArray);

            return new Promise<PluginOutput[]>((resolve, reject) => {
                                        const pythonProcess = spawn(pythonExecutable, [mainFilePath, pluginRootPath], {
                                            cwd: pluginRootPath,
                                            env: {
                                                ...environment.env,
                                                PYTHONPATH: `${pluginRootPath}:${path.join(__dirname, '..', '..', '..', '..', 'shared', 'python')}`,
                                                PYTHONUNBUFFERED: '1',
                                                PYTHONDONTWRITEBYTECODE: '1'
                                            },
                                            timeout: pluginDefinition.security?.sandboxOptions?.timeout || 60000
                                        });                let stdout = '';
                let stderr = '';

                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code !== 0) {
                        const error = new Error(`Python script exited with code ${code === null ? 'null (terminated by signal)' : code}. Stderr: ${stderr}`);
                        (error as any).stdout = stdout;
                        (error as any).stderr = stderr;
                        reject(error);
                    } else {
                        console.log(`[${trace_id}] ${source_component}: Raw stdout from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stdout}`);
                        if (stderr) {
                            console.warn(`[${trace_id}] ${source_component}: Raw stderr from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stderr}`);
                        }
                        const result = validatePythonOutput(stdout, pluginDefinition, trace_id);
                        resolve(result);
                    }
                });

                pythonProcess.on('error', (err) => {
                    console.error(`[${trace_id}] ${source_component}: Python process spawn error: ${err.message}`);
                    console.error(`[${trace_id}] ${source_component}: Attempted to execute: ${pythonExecutable}`);
                    console.error(`[${trace_id}] ${source_component}: Working directory: ${pluginRootPath}`);
                    console.error(`[${trace_id}] ${source_component}: Main file: ${mainFilePath}`);
                    reject(new Error(`Failed to spawn Python process: ${err.message}. Executable: ${pythonExecutable}`));
                });

                // Write inputs to stdin and close it to signal end of input
                pythonProcess.stdin.write(inputsJsonString);
                pythonProcess.stdin.end();
            });

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error during Python execution for ${pluginDefinition.verb} v${pluginDefinition.version}. Error: ${error.message}`);
            if ((error as any).stdout) {
                console.error(`[${trace_id}] ${source_component}: Error stdout: ${(error as any).stdout}`);
            }
            if ((error as any).stderr) {
                console.error(`[${trace_id}] ${source_component}: Error stderr: ${(error as any).stderr}`);
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id,
                contextual_info: {
                    plugin_id: pluginDefinition.id,
                    version: pluginDefinition.version,
                    command_executed: "python3",
                    stdout_on_error: (error as any).stdout,
                    stderr_on_error: (error as any).stderr,
                    main_file: mainFilePath
                }
            });
        }
    }

    private async executeContainerPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, pluginRootPath, trace_id } = executionContext;
        const source_component = "PluginExecutor.executeContainerPlugin";

        console.log(`[${trace_id}] ${source_component}: Container execution for plugin ${pluginDefinition.id} v${pluginDefinition.version}`);

        try {
            if (!pluginDefinition.container || !pluginDefinition.api) {
                throw new Error("Container plugin missing container or api configuration");
            }

            const containerManifest: ContainerPluginManifest = {
                id: pluginDefinition.id,
                name: pluginDefinition.verb,
                version: pluginDefinition.version,
                actionVerb: pluginDefinition.verb,
                language: 'container',
                container: {
                    dockerfile: pluginDefinition.container.dockerfile,
                    buildContext: pluginDefinition.container.buildContext,
                    image: pluginDefinition.container.image,
                    ports: pluginDefinition.container.ports,
                    environment: pluginDefinition.container.environment,
                    resources: pluginDefinition.container.resources,
                    healthCheck: pluginDefinition.container.healthCheck
                },
                api: pluginDefinition.api,
                inputs: pluginDefinition.inputDefinitions,
                outputs: pluginDefinition.outputDefinitions,
                security: pluginDefinition.security,
                metadata: pluginDefinition.metadata
            };

            await this.containerManager.buildPluginImage(containerManifest, pluginRootPath, trace_id);

            const containerInstance = await this.containerManager.startPluginContainer(containerManifest, trace_id);

            try {
                const inputsObject: { [key: string]: any } = {};
                inputValues.forEach((value, key) => {
                    inputsObject[key] = value.value;
                });

                const executionRequest: ContainerExecutionRequest = {
                    inputs: inputsObject,
                    context: {
                        trace_id,
                        plugin_id: pluginDefinition.id,
                        version: pluginDefinition.version
                    }
                };

                const response = await this.containerManager.executePluginInContainer(
                    containerInstance,
                    containerManifest,
                    executionRequest,
                    trace_id
                );

                if (!response.success) {
                    throw new Error(response.error || "Container execution failed");
                }

                const outputs: PluginOutput[] = [];
                if (response.outputs) {
                    for (const [key, value] of Object.entries(response.outputs)) {
                        outputs.push({
                            success: true,
                            name: key,
                            resultType: this.inferResultType(value),
                            result: value,
                            resultDescription: `Container plugin output: ${key}`,
                            mimeType: 'application/json'
                        });
                    }
                }

                if (outputs.length === 0) {
                    outputs.push({
                        success: true,
                        name: 'result',
                        resultType: PluginParameterType.STRING,
                        result: 'Container execution completed successfully',
                        resultDescription: 'Container plugin execution result'
                    });
                }

                console.log(`[${trace_id}] ${source_component}: Container plugin executed successfully in ${response.executionTime}ms`);
                return outputs;

            } finally {
                try {
                    await this.containerManager.stopPluginContainer(containerInstance.id, trace_id);
                } catch (cleanupError: any) {
                    console.warn(`[${trace_id}] ${source_component}: Failed to cleanup container: ${cleanupError.message}`);
                }
            }

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Container plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginDefinition.id,
                    version: pluginDefinition.version,
                    container_image: pluginDefinition.container?.image,
                    api_endpoint: pluginDefinition.api?.endpoint
                }
            });
        }
    }

    private inferResultType(value: any): PluginParameterType {
        if (typeof value === 'string') return PluginParameterType.STRING;
        if (typeof value === 'number') return PluginParameterType.NUMBER;
        if (typeof value === 'boolean') return PluginParameterType.BOOLEAN;
        if (Array.isArray(value)) return PluginParameterType.ARRAY;
        if (typeof value === 'object' && value !== null) return PluginParameterType.OBJECT;
        return PluginParameterType.ANY;
    }

    public async executeOpenAPITool(tool: OpenAPITool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "PluginExecutor.executeOpenAPIToolInternal";

        try {
            const actionMapping = tool.actionMappings.find(mapping => mapping.actionVerb === step.actionVerb);
            if (!actionMapping) {
                throw new Error(`Action verb ${step.actionVerb} not found in OpenAPI tool ${tool.id}`);
            }

            const apiRequest = await this.buildOpenAPIRequest(tool, actionMapping, step);

            const startTime = Date.now();
            const apiResponse = await this.makeOpenAPICall(apiRequest);
            const responseTime = Date.now() - startTime;

            const pluginOutputs: PluginOutput[] = [{
                success: true,
                name: 'result',
                resultType: PluginParameterType.OBJECT,
                result: apiResponse.data,
                resultDescription: `OpenAPI call to ${actionMapping.method} ${actionMapping.path}`,
                mimeType: 'application/json'
            }];

            if (apiResponse.status) {
                pluginOutputs.push({
                    success: true,
                    name: 'statusCode',
                    resultType: PluginParameterType.NUMBER,
                    result: apiResponse.status,
                    resultDescription: 'HTTP status code'
                });
            }

            pluginOutputs.push({
                success: true,
                name: 'responseTime',
                resultType: PluginParameterType.NUMBER,
                result: responseTime,
                resultDescription: 'Response time in milliseconds'
            });

            console.log(`[${trace_id}] ${source_component}: Successfully executed OpenAPI tool ${tool.id} action ${step.actionVerb}`);
            return pluginOutputs;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing OpenAPI tool:`, error);
            return [{ 
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `OpenAPI execution failed: ${error.message}`,
                error: error.message
            }];
        }
    }

    private async buildOpenAPIRequest(tool: OpenAPITool, actionMapping: any, step: Step): Promise<any> {
        const url = new URL(actionMapping.path, tool.baseUrl);
        const headers: any = {
            'Content-Type': 'application/json',
            'User-Agent': 'Stage7-Agent/1.0'
        };

        let body: any = null;
        const queryParams: any = {};

        for (const inputMapping of actionMapping.inputs) {
            const inputValue = step.inputValues?.get(inputMapping.name)?.value;

            if (inputValue !== undefined) {
                switch (inputMapping.in) {
                    case 'path':
                        url.pathname = url.pathname.replace(`{${inputMapping.name}}`, String(inputValue));
                        break;
                    case 'query':
                        queryParams[inputMapping.name] = inputValue;
                        break;
                    case 'header':
                        headers[inputMapping.name] = inputValue;
                        break;
                    case 'body':
                        body = inputValue;
                        break;
                }
            }
        }

        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.append(key, String(value));
        }

        await this.addOpenAPIAuthentication(headers, tool.authentication);

        return {
            method: actionMapping.method,
            url: url.toString(),
            headers,
            data: body,
            timeout: actionMapping.timeout || 30000
        };
    }

    private async addOpenAPIAuthentication(headers: any, auth: any): Promise<void> {
        if (!auth || auth.type === 'none') return;

        switch (auth.type) {
            case 'apiKey':
                if (auth.apiKey) {
                    const apiKey = await this.getCredential(auth.apiKey.credentialSource);
                    if (auth.apiKey.in === 'header') {
                        headers[auth.apiKey.name] = apiKey;
                    }
                }
                break;
            case 'bearer':
                if (auth.bearer) {
                    const token = await this.getCredential(auth.bearer.credentialSource);
                    headers['Authorization'] = `Bearer ${token}`;
                }
                break;
            case 'basic':
                if (auth.basic) {
                    const credentials = await this.getCredential(auth.basic.credentialSource);
                    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
                }
                break;
        }
    }

    private async getCredential(credentialSource: string): Promise<string> {
        const envVar = credentialSource.replace('env:', '');
        return process.env[envVar] || '';
    }

    private async makeOpenAPICall(request: any): Promise<any> {
        try {
            const response = await axios({
                method: request.method,
                url: request.url,
                headers: request.headers,
                data: request.data,
                timeout: request.timeout,
                validateStatus: (status) => status < 500
            });

            return response;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`API call failed with status ${error.response.status}: ${error.response.data?.message || error.response.statusText}`);
            } else if (error.request) {
                throw new Error(`Network error: ${error.message}`);
            } else {
                throw new Error(`Request setup error: ${error.message}`);
            }
        }
    }

    private createErrorOutput(errorCode: string, message: string, trace_id: string, context?: any): PluginOutput {
        return {
            success: false,
            name: errorCode,
            resultType: PluginParameterType.ERROR,
            result: message,
            resultDescription: message,
            error: message,
            trace_id: trace_id,
            context: context
        };
    }

    private async applyMCPAuthentication(headers: any, auth: MCPAuthentication, trace_id: string): Promise<void> {
        if (!auth || auth.type === 'none') return;

        switch (auth.type) {
            case 'apiKey':
                if (auth.apiKey) {
                    const apiKey = await this.getCredential(auth.apiKey.credentialSource || '');
                    if (auth.apiKey.in === 'header') {
                        headers[auth.apiKey.name] = apiKey;
                    }
                }
                break;
            case 'bearer':
                if (auth.bearer) {
                    const token = await this.getCredential(auth.bearer.credentialSource);
                    headers['Authorization'] = `Bearer ${token}`;
                }
                break;
            case 'basic':
                if (auth.basic) {
                    const credentials = await this.getCredential(auth.basic.credentialSource);
                    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
                }
                break;
        }
    }

    public async executeMCPTool(mcpTool: MCPTool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "PluginExecutor.executeMCPTool";
        console.log(`[${trace_id}] ${source_component}: Executing MCP Tool ${mcpTool.id} for actionVerb ${step.actionVerb}`);

        const actionMapping = mcpTool.actionMappings.find(m => m.actionVerb === step.actionVerb);
        if (!actionMapping) {
            const errorMsg = `ActionVerb '${step.actionVerb}' not found in MCP Tool '${mcpTool.id}'. This should have been caught by getHandlerForActionVerb.`;
            console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
            return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, errorMsg, trace_id)];
        }

        try {
            const validatedInputsResult = await validateAndStandardizeInputs(actionMapping as any, step.inputValues || new Map());
            if (!validatedInputsResult.success || !validatedInputsResult.inputs) {
                const errorMsg = validatedInputsResult.error || "Input validation failed for MCP tool.";
                console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
                return [this.createErrorOutput(GlobalErrorCodes.INPUT_VALIDATION_FAILED, errorMsg, trace_id, { toolId: mcpTool.id, actionVerb: step.actionVerb })];
            }
            const validatedInputs = validatedInputsResult.inputs;
            const inputsObject: { [key: string]: any } = {};
            validatedInputs.forEach((value: InputValue, key: string) => {
                inputsObject[key] = value.value;
            });

            const mcpTarget = actionMapping.mcpServiceTarget;
            let targetUrl = mcpTarget.serviceName;

            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                const envUrl = process.env[`MCP_SERVICE_${targetUrl.toUpperCase().replace(/-/g, '_')}_URL`];
                if (envUrl) {
                    targetUrl = envUrl;
                }
                else {
                    console.error(`[${trace_id}] ${source_component}: Cannot resolve MCP service name '${mcpTarget.serviceName}' to a URL.`);
                    return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, `Cannot resolve MCP service name '${mcpTarget.serviceName}'.`, trace_id)];
                }
            }

            if (mcpTarget.endpointOrCommand.startsWith('/')) {
                targetUrl += mcpTarget.endpointOrCommand;
            }
            else {
                console.warn(`[${trace_id}] ${source_component}: MCP endpointOrCommand '${mcpTarget.endpointOrCommand}' is not a path, specific handling required.`);
            }

            const requestConfig: any = {
                method: mcpTarget.method.toLowerCase() || 'post',
                url: targetUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Trace-ID': trace_id,
                },
                data: inputsObject
            };

            if (mcpTarget.additionalConfig) {
                if (mcpTarget.additionalConfig.headers) {
                    requestConfig.headers = { ...requestConfig.headers, ...mcpTarget.additionalConfig.headers };
                }
            }

            const authConfig = mcpTool.authentication;
            if (authConfig) {
                await this.applyMCPAuthentication(requestConfig.headers, authConfig, trace_id);
            }

            console.log(`[${trace_id}] ${source_component}: Calling MCP service. URL: ${requestConfig.url}, Method: ${requestConfig.method}`);
            const mcpResponse = await axios(requestConfig);

            const outputs: PluginOutput[] = [];
            if (mcpResponse.data && typeof mcpResponse.data === 'object') {
                for (const outputDef of actionMapping.outputs) {
                    if (mcpResponse.data.hasOwnProperty(outputDef.name)) {
                        outputs.push({
                            success: true,
                            name: outputDef.name,
                            resultType: outputDef.type,
                            result: mcpResponse.data[outputDef.name],
                            resultDescription: outputDef.description || `Output from MCP tool ${mcpTool.id}`,
                        });
                    }
                }
            }

            return outputs;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing MCP tool:`, error);
            return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, `MCP tool execution failed: ${error.message}`, trace_id, { toolId: mcpTool.id, actionVerb: step.actionVerb, original_error: error.message })];
        }
    }
}
