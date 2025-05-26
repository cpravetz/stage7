import path from 'path';
import { promisify } from 'util';
import { exec as execCallback, execAsync as sharedExecAsync } from 'child_process'; // Assuming execAsync might be from a shared utility or defined if not

import {
    PluginInput, PluginOutput, PluginDefinition, PluginParameterType, environmentType,
    executePluginInSandbox, validatePluginPermissions, hasDangerousPermissions, ServiceTokenManager
} from '@cktmcs/shared';

import fs from 'fs/promises'; // For reading OpenAPI spec
import yaml from 'js-yaml'; // For parsing YAML OpenAPI spec
import axios, { AxiosRequestConfig, AxiosResponse, Method as AxiosMethod } from 'axios'; // For making HTTP requests for OpenAPI

import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from '../utils/errorReporter';
import { ConfigManager } from '../utils/configManager'; // Path might need adjustment

// Helper to create PluginOutput error from a StructuredError - Duplicating temporarily, ideally from a shared util
function createPluginOutputError(structuredError: StructuredError): PluginOutput[] {
    return [{
        success: false,
        name: structuredError.error_code || GlobalErrorCodes.UNKNOWN_ERROR,
        resultType: PluginParameterType.ERROR,
        resultDescription: structuredError.message_human_readable,
        result: structuredError,
        error: structuredError.message_human_readable
    }];
}

// If execAsync is not from a shared utility, define it here.
const execAsyncLocal = promisify(execCallback);


export interface ExecutionContext {
    inputs: Map<string, PluginInput>;
    environment: environmentType; // Contains credentials and env vars
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
    trace_id: string;
}

export class PluginExecutionService {
    private configManager: ConfigManager;
    // private serviceTokenManagerGetter: () => ServiceTokenManager; // To get CM's own token manager
    private securityManagerUrl: string; // For Brain token

    constructor(
        configManager: ConfigManager,
        // serviceTokenManagerGetter: () => ServiceTokenManager,
        securityManagerUrl: string, // Pass this from orchestrator
    ) {
        this.configManager = configManager;
        // this.serviceTokenManagerGetter = serviceTokenManagerGetter;
        this.securityManagerUrl = securityManagerUrl;
        console.log("PluginExecutionService initialized");
    }

    public async execute(
        executionContext: ExecutionContext,
        // Add specific parameters for things previously accessed via `this` from CapabilitiesManager
        cmAuthToken?: string | null, // CM's own auth token for plugins if needed
    ): Promise<PluginOutput[]> {
        // If a plugin (JS/Python) returns a fileName in its output, it should be preserved.
        // This service itself won't generally create filenames for JS/Python plugins unless intrinsic to the output type (e.g. a plan).
        const { pluginDefinition, inputs, pluginRootPath, trace_id } = executionContext;
        const source_component = "PluginExecutionService.execute";
        console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginDefinition.id} v${pluginDefinition.version} (${pluginDefinition.verb}) at ${pluginRootPath}`);

        try {
            const permissionErrors = validatePluginPermissions(pluginDefinition);
            if (permissionErrors.length > 0) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`,
                    contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version }, trace_id_param: trace_id, source_component
                });
            }

            if (hasDangerousPermissions(pluginDefinition)) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${pluginDefinition.id} v${pluginDefinition.version} has dangerous permissions.`);
            }

            // Config is already part of executionContext.environment.credentials (loaded by ConfigManager)
            // Usage recording should ideally be done by the orchestrator after successful execution or based on policy
            // await this.configManager.recordPluginUsage(pluginDefinition.id);

            let brainToken: string | null = null;
            if (pluginDefinition.verb === 'ACCOMPLISH') { // Or any other plugin needing a Brain token
                const brainTokenManager = new ServiceTokenManager(`http://${this.securityManagerUrl}`, 'Brain', process.env.CLIENT_SECRET || 'stage7AuthSecret');
                brainToken = await brainTokenManager.getToken();
            }

            // Augment executionContext's environment with necessary tokens
            const finalEnv = { ...executionContext.environment.env };
            if (cmAuthToken) finalEnv.CM_AUTH_TOKEN = cmAuthToken;
            if (brainToken) finalEnv.BRAIN_AUTH_TOKEN = brainToken;
            
            const finalExecutionContext: ExecutionContext = {
                ...executionContext,
                environment: { ...executionContext.environment, env: finalEnv },
                inputs: new Map(inputs) // Clone to avoid modification issues
            };
            
            // Add tokens to inputs as well, as some plugins might expect them there
            if (cmAuthToken) finalExecutionContext.inputs.set('__auth_token', { inputName: '__auth_token', inputValue: cmAuthToken, args: { token: cmAuthToken } });
            if (brainToken) {
                finalExecutionContext.inputs.set('__brain_auth_token', { inputName: '__brain_auth_token', inputValue: brainToken, args: { token: brainToken } });
                finalExecutionContext.inputs.set('token', { inputName: 'token', inputValue: brainToken, args: { token: brainToken } }); // Common for ACCOMPLISH
            }


            if (pluginDefinition.language === 'javascript') {
                try {
                    // executePluginInSandbox expects environment to have env and credentials.
                    // inputs are passed as an array.
                    return await executePluginInSandbox(finalExecutionContext.pluginDefinition, Array.from(finalExecutionContext.inputs.values()), finalExecutionContext.environment);
                } catch (sandboxError: any) {
                    console.error(`[${trace_id}] ${source_component}: Sandbox execution failed for ${pluginDefinition.id} v${pluginDefinition.version}, falling back to direct (if implemented, currently not): ${sandboxError.message}`);
                    sandboxError.trace_id = trace_id;
                    // NOTE: The original CapabilitiesManager had a fallback to direct JS execution (executeJavaScriptPlugin).
                    // This is generally unsafe and removed from the primary flow here.
                    // If direct execution is needed, it should be a conscious decision and potentially a different language type.
                    throw sandboxError;
                }
            } else if (pluginDefinition.language === 'python') {
                return this._executePythonPlugin(finalExecutionContext);
            } else if (pluginDefinition.language === 'openapi') {
                return this._executeOpenAPIPlugin(finalExecutionContext);
            }
            throw generateStructuredError({ error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE, severity: ErrorSeverity.ERROR, message: `Unsupported plugin language: ${pluginDefinition.language}`, contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version }, trace_id_param: trace_id, source_component });

        } catch (error: any) {
            if (error.error_id && error.trace_id) { // Already a StructuredError
                return createPluginOutputError(error);
            }
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Execution failed for plugin ${pluginDefinition?.id || 'unknown'} v${pluginDefinition?.version || 'unknown'}: ${error.message}`,
                source_component, original_error: error,
                contextual_info: { plugin_id: pluginDefinition?.id, verb: pluginDefinition?.verb, version: pluginDefinition?.version },
                trace_id_param: trace_id
            });
            return createPluginOutputError(sError);
        }
    }

    // Note: executeJavaScriptPlugin (direct, non-sandboxed) is intentionally omitted for security.
    // If it were to be brought back, it would be here.

    private async _executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputs, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "PluginExecutionService._executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);
        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);
        try {
            const inputsObject: { [key: string]: PluginInput } = {};
            inputs.forEach((value, key) => { inputsObject[key] = value; });
            const inputsJsonString = JSON.stringify(inputsObject);
            const command = `echo '${inputsJsonString.replace(/'/g, "'\\''")}' | python3 "${mainFilePath}" "${pluginRootPath}"`;

            const { stdout, stderr } = await execAsyncLocal(command, {
                cwd: pluginRootPath,
                env: { ...(environment.env || process.env), PYTHONPATH: pluginRootPath } // Ensure environment.env is used
            });

            if (stderr) {
                console.warn(`[${trace_id}] ${source_component}: Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} stderr:\n${stderr}`);
            }
            // Python plugins should ideally return PluginOutput[] structure directly as JSON string.
            // If a fileName is part of that, it will be preserved.
            // Example: [{ success: true, name: "output1", ..., fileName: "result.txt" }]
            return JSON.parse(stdout); 
        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED, severity: ErrorSeverity.ERROR,
                message: `Python plugin ${pluginDefinition.verb} v${pluginDefinition.version} execution failed: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version, command_executed: "python3", stderr: (error as any).stderr }
            });
        }
    }

    private async _executeOpenAPIPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputs, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "PluginExecutionService._executeOpenAPIPlugin";
        console.log(`[${trace_id}] ${source_component}: Starting execution of OpenAPI plugin ${pluginDefinition.id} v${pluginDefinition.version} (${pluginDefinition.verb})`);

        try {
            if (!pluginDefinition.entryPoint?.main) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                    severity: ErrorSeverity.ERROR, message: "OpenAPI plugin manifest must define entryPoint.main specifying the spec file.",
                    source_component, trace_id_param: trace_id, contextual_info: { plugin_id: pluginDefinition.id }
                });
            }
            const specPath = path.join(pluginRootPath, pluginDefinition.entryPoint.main);
            let specContent: any;
            try {
                const rawContent = await fs.readFile(specPath, 'utf-8');
                if (specPath.endsWith('.yaml') || specPath.endsWith('.yml')) {
                    specContent = yaml.load(rawContent);
                } else if (specPath.endsWith('.json')) {
                    specContent = JSON.parse(rawContent);
                } else {
                    throw new Error(`Unsupported OpenAPI spec file extension. Supported: .json, .yaml, .yml. Path: ${specPath}`);
                }
            } catch (error: any) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                    severity: ErrorSeverity.ERROR, message: `Failed to read or parse OpenAPI spec at ${specPath}: ${error.message}`,
                    source_component, trace_id_param: trace_id, original_error: error, contextual_info: { plugin_id: pluginDefinition.id }
                });
            }

            let serverUrl = "";
            const serverUrlConfig = pluginDefinition.configuration?.items?.find(item => item.key === "serverUrl" && item.type === "string");
            if (serverUrlConfig) {
                serverUrl = serverUrlConfig.value;
            } else if (specContent.servers && specContent.servers.length > 0) {
                serverUrl = specContent.servers[0].url;
                if (specContent.servers[0].variables) {
                    for (const [key, variable] of Object.entries(specContent.servers[0].variables as Record<string, { default: string }>)) {
                        serverUrl = serverUrl.replace(`{${key}}`, variable.default);
                    }
                }
            } else {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                    severity: ErrorSeverity.ERROR, message: "No server URL found in plugin configuration or OpenAPI spec.",
                    source_component, trace_id_param: trace_id, contextual_info: { plugin_id: pluginDefinition.id }
                });
            }
            console.log(`[${trace_id}] ${source_component}: Using server URL: ${serverUrl} for plugin ${pluginDefinition.id}`);

            let operationPath: string | undefined;
            let operationMethod: AxiosMethod | undefined;
            let operationSpec: any;

            for (const [pathKey, pathItem] of Object.entries(specContent.paths as Record<string, any>)) {
                for (const [methodKey, methodItem] of Object.entries(pathItem as Record<string, any>)) {
                    if (methodItem.operationId === pluginDefinition.verb) {
                        operationPath = pathKey;
                        operationMethod = methodKey.toUpperCase() as AxiosMethod;
                        operationSpec = methodItem;
                        break;
                    }
                }
                if (operationPath) break;
            }

            if (!operationPath || !operationMethod || !operationSpec) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                    severity: ErrorSeverity.ERROR, message: `Operation with operationId '${pluginDefinition.verb}' not found in OpenAPI spec.`,
                    source_component, trace_id_param: trace_id, contextual_info: { plugin_id: pluginDefinition.id, verb: pluginDefinition.verb }
                });
            }
            console.log(`[${trace_id}] ${source_component}: Found operation '${pluginDefinition.verb}' at ${operationMethod} ${operationPath}`);

            const requestConfig: AxiosRequestConfig = {
                method: operationMethod,
                url: serverUrl.replace(/\/$/, '') + operationPath,
                headers: {},
                params: {},
                data: undefined,
            };
            let requestBodyInput: PluginInput | undefined;
            const requestBodyContentType = operationSpec.requestBody?.content && Object.keys(operationSpec.requestBody.content)[0] || 'application/json';

            for (const [inputName, pluginInput] of inputs.entries()) {
                const inputDef = pluginDefinition.inputDefinitions?.find(def => def.inputName === inputName);
                if (!inputDef || !inputDef.args) continue;

                const openApiName = inputDef.args['x-openapi-name'] as string;
                const openApiIn = inputDef.args['x-openapi-in'] as string;

                if (!openApiName || !openApiIn) {
                    console.warn(`[${trace_id}] ${source_component}: Skipping input '${inputName}' for plugin ${pluginDefinition.id} due to missing 'x-openapi-name' or 'x-openapi-in' in manifest args.`);
                    continue;
                }

                switch (openApiIn) {
                    case 'path':
                        requestConfig.url = requestConfig.url?.replace(`{${openApiName}}`, encodeURIComponent(String(pluginInput.inputValue)));
                        break;
                    case 'query':
                        requestConfig.params[openApiName] = pluginInput.inputValue;
                        break;
                    case 'header':
                        requestConfig.headers![openApiName] = String(pluginInput.inputValue);
                        break;
                    case 'requestBody':
                        requestBodyInput = pluginInput;
                        requestConfig.headers!['Content-Type'] = requestBodyContentType;
                        break;
                    default:
                        console.warn(`[${trace_id}] ${source_component}: Unsupported 'x-openapi-in' value: ${openApiIn} for input ${inputName}`);
                }
            }
            if (requestBodyInput) {
                requestConfig.data = requestBodyInput.inputValue;
            }

            if (specContent.components?.securitySchemes && operationSpec.security) {
                for (const securityRequirement of operationSpec.security) {
                    for (const schemeName of Object.keys(securityRequirement)) {
                        const scheme = specContent.components.securitySchemes[schemeName];
                        if (scheme?.type === 'apiKey') {
                            const apiKeyCredential = environment.credentials?.find(cred => cred.key === scheme.name && cred.type === 'secret');
                            if (apiKeyCredential?.value) {
                                if (scheme.in === 'header') {
                                    requestConfig.headers![scheme.name] = apiKeyCredential.value;
                                } else if (scheme.in === 'query') {
                                    requestConfig.params[scheme.name] = apiKeyCredential.value;
                                }
                                console.log(`[${trace_id}] ${source_component}: Applied API key '${scheme.name}' from credentials.`);
                            } else {
                                console.warn(`[${trace_id}] ${source_component}: API key '${scheme.name}' defined in spec security scheme but not found or no value in environment credentials.`);
                            }
                        }
                    }
                }
            }

            console.log(`[${trace_id}] ${source_component}: Executing OpenAPI request for ${pluginDefinition.id}: ${requestConfig.method} ${requestConfig.url}`);
            console.log(`[${trace_id}] ${source_component}: Request config details: ${JSON.stringify({ params: requestConfig.params, headers: requestConfig.headers, data: requestConfig.data }, null, 2)}`);

            let response: AxiosResponse;
            try {
                response = await axios(requestConfig);
            } catch (error: any) {
                if (axios.isAxiosError(error) && error.response) {
                    response = error.response;
                    console.warn(`[${trace_id}] ${source_component}: OpenAPI request for ${pluginDefinition.id} completed with non-2xx status: ${response.status}. Response data: ${JSON.stringify(response.data)}`);
                } else {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_API_CALL_FAILED,
                        severity: ErrorSeverity.ERROR, message: `OpenAPI request failed for ${pluginDefinition.verb}: ${error.message}`,
                        source_component, trace_id_param: trace_id, original_error: error,
                        contextual_info: { plugin_id: pluginDefinition.id, verb: pluginDefinition.verb, url: requestConfig.url }
                    });
                }
            }

            const isSuccessStatus = response.status >= 200 && response.status < 300;
            const responseData = response.data;
            let resultType = PluginParameterType.STRING;
            const responseContentTypeHeader = response.headers['content-type']?.split(';')[0].trim();
            if (responseContentTypeHeader === 'application/json') {
                resultType = PluginParameterType.OBJECT;
            } else if (responseContentTypeHeader?.startsWith('text/')) {
                resultType = PluginParameterType.STRING;
            }

            // Attempt to extract fileName from Content-Disposition header
            let fileName: string | undefined;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename\*?=['"]?([^'";]+)['"]?/);
                if (fileNameMatch && fileNameMatch[1]) {
                    try {
                        fileName = decodeURIComponent(fileNameMatch[1]);
                    } catch (e) {
                        // Fallback for non-standard encoding or already decoded
                        fileName = fileNameMatch[1]; 
                        console.warn(`[${trace_id}] ${source_component}: Could not decodeURIComponent for filename: ${fileNameMatch[1]}. Using raw value.`);
                    }
                }
            }
            // Fallback filename if not found in header
            if (!fileName) {
                const extension = responseContentTypeHeader === 'application/json' ? 'json' :
                                  responseContentTypeHeader?.startsWith('image/') ? responseContentTypeHeader.split('/')[1] :
                                  responseContentTypeHeader?.startsWith('text/') ? 'txt' :
                                  responseContentTypeHeader === 'application/pdf' ? 'pdf' :
                                  'data';
                fileName = `${pluginDefinition.verb}_response.${extension}`;
            }


            const outputName = pluginDefinition.outputDefinitions?.[0]?.outputName || `${pluginDefinition.verb}_response`;

            return [{
                success: isSuccessStatus,
                name: outputName,
                resultType: resultType,
                result: responseData,
                resultDescription: `HTTP ${response.status} ${response.statusText}. Content-Type: ${responseContentTypeHeader}`,
                error: isSuccessStatus ? undefined : `Request failed with status ${response.status}: ${JSON.stringify(responseData)}`,
                mimeType: responseContentTypeHeader || 'application/octet-stream', // Ensure mimeType is set
                fileName: fileName
            }];

        } catch (error: any) {
            if (error.error_id && error.trace_id) {
                return createPluginOutputError(error);
            }
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `OpenAPI plugin ${pluginDefinition.verb} execution failed: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id,
                contextual_info: { plugin_id: pluginDefinition.id, verb: pluginDefinition.verb }
            });
            return createPluginOutputError(sError);
        }
    }
}
