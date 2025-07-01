import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Step, MapSerializer, BaseEntity, ServiceTokenManager } from '@cktmcs/shared';
import { InputValue, InputReference, PluginOutput, PluginDefinition, PluginParameterType, environmentType, PluginManifest, PluginLocator, PluginRepositoryType, PluginParameter, DefinitionManifest, DefinitionType, OpenAPITool, MCPTool, MCPActionMapping, MCPAuthentication, MCPServiceTarget, OpenAPIExecutionRequest, OpenAPIExecutionResult } from '@cktmcs/shared'; // Added DefinitionManifest, DefinitionType
import { PlanTemplate, ExecutionContext as PlanExecutionContext, StepExecution, PlanExecutionStatus, StepExecutionStatus } from '@cktmcs/shared'; // Removed OpenAPITool, MCPTool etc from here as they are imported above
import { executePluginInSandbox } from '@cktmcs/shared';
import { validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from './utils/errorReporter';
import { ConfigManager } from './utils/configManager';
import { PluginRegistry } from './utils/pluginRegistry';
import { validateAndStandardizeInputs } from './utils/validator';
import { ContainerManager } from './utils/containerManager';
import { ContainerExecutionRequest, ContainerPluginManifest } from './types/containerTypes';
const execAsync = promisify(execCallback);

// Helper to create PluginOutput error from a StructuredError
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

interface ExecutionContext {
    inputValues: Map<string, InputValue>;
    environment: environmentType;
    pluginDefinition: PluginDefinition;
    pluginRootPath: string;
    trace_id: string;
}

export class CapabilitiesManager extends BaseEntity {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    private server: any;
    private configManager!: ConfigManager;
    private pluginRegistry: PluginRegistry;
    private containerManager: ContainerManager;
    private serviceId = 'CapabilitiesManager';

    private failedPluginLookups: Map<string, number> = new Map(); // actionVerb -> last failure timestamp
    private static readonly PLUGIN_LOOKUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes


    constructor() {
        super('CapabilitiesManager', 'CapabilitiesManager', `capabilitiesmanager`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0,8)}`;
        //console.log(`[${trace_id}] Starting CapabilitiesManager initialization...`);
        
        this.pluginRegistry = new PluginRegistry();
        this.containerManager = new ContainerManager();

        this.initialize(trace_id).catch(error => {
            const initError = error instanceof Error ? error : new Error(String(error));
            const message = (initError as any).message_human_readable || initError.message;
            console.error(`[${trace_id}] INIT_FAILURE: ${message}`, (initError as any).contextual_info || initError.stack);
            process.exit(1);
        });
    }

    private async initialize(trace_id: string) {
        const source_component = "CapabilitiesManager.initialize";
        try {
            this.configManager = await ConfigManager.initialize(this.librarianUrl);
            console.log(`[${trace_id}] ${source_component}: ConfigManager initialized.`);

            await this.start(trace_id);

            if (!this.registeredWithPostOffice) {
                //console.log(`[${trace_id}] ${source_component}: Registering with PostOffice...`);
                await this.registerWithPostOffice(15, 2000);
                if (this.registeredWithPostOffice) {
                    //console.log(`[${trace_id}] ${source_component}: Successfully registered with PostOffice.`);
                } else {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: "CRITICAL - Failed to register with PostOffice after multiple attempts.",
                        source_component,
                        trace_id_param: trace_id
                    });
                }
            }

        } catch (error: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: "Failed to initialize CapabilitiesManager.",
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    private setupServer(trace_id_parent: string): Promise<void> {
        const source_component = "CapabilitiesManager.setupServer";
        return new Promise((resolve, reject) => {
            try {
                const app = express();
                app.use(bodyParser.json());

                // Authentication middleware - skip for health checks
                app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
                    if (req.path === '/health' || req.path === '/ready') return next();
                    this.verifyToken(req, res, next);
                });

                // Core routes
                app.post('/executeAction', (req, res) => this.executeActionVerb(req, res));

                // --- Plugin CRUD API ---
                app.get('/plugins', async (req, res) => {
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        console.log(`[${trace_id_parent}] ${source_component}: Fetching plugins from repository: ${repository || 'default'}`);
                        const plugins = await this.pluginRegistry.list(repository);
                        res.json({ plugins });
                    } catch (error: any) {
                        res.status(200).json({ plugins: [] });
                    }
                });
                app.get('/plugins/:id', async (req, res) => {
                    try {
                        const repository = req.query.repository as PluginRepositoryType | undefined;
                        const plugin = await this.pluginRegistry.fetchOne(req.params.id, undefined, repository);
                        if (!plugin) {
                            res.status(404).json({ error: 'Plugin not found' });
                        } else {
                            res.json({ plugin });
                        }
                    } catch (error: any) {
                        res.status(404).json({ error: 'Plugin not found' });
                    }
                });
                app.post('/plugins', async (req, res) => {
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.status(201).json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to create plugin', details: error.message });
                    }
                });
                app.put('/plugins/:id', async (req, res) => {
                    try {
                        await this.pluginRegistry.store(req.body);
                        res.json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to update plugin', details: error.message });
                    }
                });
                app.delete('/plugins/:id', async (req, res) => {
                    try {
                        const repository = req.query.repository as string | undefined;
                        // Only librarian-definition repos support delete
                        if (repository === 'librarian-definition' && typeof this.pluginRegistry.delete === 'function') {
                            await this.pluginRegistry.delete(req.params.id, undefined, repository);
                        }
                        res.json({ success: true });
                    } catch (error: any) {
                        res.status(400).json({ error: 'Failed to delete plugin', details: error.message });
                    }
                });
                // --- Plugin Repositories API ---
                app.get('/pluginRepositories', (req, res) => {
                    try {
                        const repos = this.pluginRegistry.getActiveRepositories();
                        res.json({ repositories: repos });
                    } catch (error: any) {
                        res.status(200).json({ repositories: [] });
                    }
                });

                app.post('/message', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-msg-${uuidv4().substring(0,8)}`;
                    try {
                        await super.handleBaseMessage(req.body);
                        res.status(200).send({ status: 'Message received and processed' });
                    } catch (error: any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                            severity: ErrorSeverity.ERROR,
                            message: "Error handling message.",
                            source_component: `${source_component}.handleMessage`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                app.get('/availablePlugins', async (req, res) => {
                    const trace_id = (req as any).trace_id || `${trace_id_parent}-avail-${uuidv4().substring(0,8)}`;
                    try {
                        const plugins: PluginLocator[] = (await this.pluginRegistry.list()).filter(
                            (p: PluginLocator) => !('language' in p) || (p as any).language === 'javascript' || (p as any).language === 'python' || (p as any).language === 'container'
                        );
                        res.json(plugins);
                    } catch (error:any) {
                        const sError = generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: "Failed to list available plugins.",
                            source_component: `${source_component}.availablePlugins`,
                            original_error: error,
                            trace_id_param: trace_id
                        });
                        res.status(500).json(sError);
                    }
                });

                this.server = app.listen(this.port, () => {
                    console.log(`[${trace_id_parent}] CapabilitiesManager server listening on port ${this.port}`);
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                    const sError = generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.CRITICAL,
                        message: "CapabilitiesManager server startup error.",
                        source_component,
                        original_error: error,
                        trace_id_param: trace_id_parent
                    });
                    reject(sError);
                });

            } catch (error) {
                const sError = generateStructuredError({
                    error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                    severity: ErrorSeverity.CRITICAL,
                    message: "Error in CapabilitiesManager server setup.",
                    source_component,
                    original_error: error as Error,
                    trace_id_param: trace_id_parent
                });
                reject(sError);
            }
        });
    }

    public async start(trace_id_parent?: string): Promise<void> {
        const trace_id = trace_id_parent || `${this.serviceId}-start-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.start";
        try {
            console.log(`[${trace_id}] Setting up express server...`);
            await this.setupServer(trace_id);
            this.setupPeriodicReregistration(trace_id);
            console.log(`[${trace_id}] CapabilitiesManager server setup complete`);
        } catch (error:any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: `Failed to start CapabilitiesManager: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }

    private setupPeriodicReregistration(trace_id_parent: string): void {
        const source_component = "CapabilitiesManager.setupPeriodicReregistration";
        setInterval(async () => {
            const trace_id = `${trace_id_parent}-reReg-${uuidv4().substring(0,8)}`;
            if (!this.registeredWithPostOffice) {
                await this.registerWithPostOffice(5, 1000);
            } else {
                try {
                    const response = await this.authenticatedApi.get(`http://${this.postOfficeUrl}/getServices`);
                    const services = response.data;
                    if (!services || !services.capabilitiesManagerUrl) {
                        this.registeredWithPostOffice = false;
                        await this.registerWithPostOffice(5, 1000);
                    }
                } catch (error:any) {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.WARNING,
                        message: "Error verifying registration with PostOffice.",
                        source_component,
                        original_error: error,
                        trace_id_param: trace_id
                    });
                }
            }
        }, 5 * 60 * 1000);
    }


    private async executeActionVerb(req: express.Request, res: express.Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "CapabilitiesManager.executeActionVerb";
        const step = { ...req.body, inputValues: MapSerializer.transformFromSerialization(req.body.inputValues) } as Step;

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_REQUEST_GENERIC,
                severity: ErrorSeverity.ERROR,
                message: 'Invalid or missing actionVerb in request.',
                source_component,
                trace_id_param: trace_id
            });
            res.status(400).json(createPluginOutputError(sError));
            return;
        }

        try {
            // Query PluginRegistry for the handler for this actionVerb
            // The handlerResult.handler will be a PluginManifest (or DefinitionManifest)
            const handlerResult = await this.getHandlerForActionVerb(step.actionVerb, trace_id);

            if (handlerResult && handlerResult.handler) {
                const manifest = handlerResult.handler; // Could be DefinitionManifest

                if (manifest.language === DefinitionType.OPENAPI) {
                    const definitionManifest = manifest as DefinitionManifest;
                    if (definitionManifest.toolDefinition && (definitionManifest.toolDefinition as OpenAPITool).specUrl) {
                        const result = await this.executeOpenAPIToolInternal(definitionManifest.toolDefinition as OpenAPITool, step, trace_id);
                        res.status(200).send(MapSerializer.transformForSerialization(result));
                        return;
                    } else {
                         throw generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_HANDLER_DEF,
                            severity: ErrorSeverity.ERROR,
                            message: `OpenAPI manifest for verb '${step.actionVerb}' is missing toolDefinition.`,
                            trace_id_param: trace_id, source_component
                        });
                    }
                } else if (manifest.language === DefinitionType.MCP) {
                    const definitionManifest = manifest as DefinitionManifest;
                     if (definitionManifest.toolDefinition && (definitionManifest.toolDefinition as MCPTool).actionMappings) {
                        const result = await this.executeMCPTool(definitionManifest.toolDefinition as MCPTool, step, trace_id);
                        res.status(200).send(MapSerializer.transformForSerialization(result));
                        return;
                    } else {
                         throw generateStructuredError({
                            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_HANDLER_DEF,
                            severity: ErrorSeverity.ERROR,
                            message: `MCP manifest for verb '${step.actionVerb}' is missing toolDefinition.`,
                            trace_id_param: trace_id, source_component
                        });
                    }
                } else if (manifest.language === 'javascript' || manifest.language === 'python' || manifest.language === 'container') {
                    // Standard code-based plugin execution
                    const pluginDefinition = manifest as PluginDefinition; // Assuming PluginManifest is compatible enough
                    const validatedInputs = await validateAndStandardizeInputs(pluginDefinition, step.inputValues || new Map<string, InputValue>());
                    if (!validatedInputs.success || !validatedInputs.inputs) {
                        throw generateStructuredError({
                            error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                            severity: ErrorSeverity.ERROR,
                            message: validatedInputs.error || "Input validation failed for plugin.",
                            source_component,
                            contextual_info: { plugin_id: pluginDefinition.id, version: pluginDefinition.version, verb: pluginDefinition.verb },
                            trace_id_param: trace_id
                        });
                    }
                    // preparePluginForExecution expects PluginManifest, which DefinitionManifest extends
                    const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifest);
                    const result = await this.executePlugin(effectiveManifest, validatedInputs.inputs, pluginRootPath, trace_id);
                    res.status(200).send(MapSerializer.transformForSerialization(result));
                    return;
                } else {
                    console.warn(`[${trace_id}] ${source_component}: Unknown handler language/type '${manifest.language}' for verb '${step.actionVerb}'. Falling back.`);
                }
            }

            // If no specific handler found via PluginRegistry, or unknown type, fall back to ACCOMPLISH/Brain
            this.logPluginLookupFailure(step.actionVerb, trace_id, `No handler found for actionVerb '${step.actionVerb}'. Invoking ACCOMPLISH/Brain for reasoning.`);
            const cachedPlanArray = await this.checkCachedPlan(step.actionVerb);
            if (cachedPlanArray && cachedPlanArray.length > 0) {
                res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray));
                return;
            }
            const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
            res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
        } catch (error: any) {
            // Patch: On handler fetch error, treat as missing and fall back to ACCOMPLISH/Brain
            this.logPluginLookupFailure(step.actionVerb, trace_id, `Handler lookup failed for actionVerb '${step.actionVerb}': ${error.message}. Invoking ACCOMPLISH/Brain for reasoning.`);
            const cachedPlanArray = await this.checkCachedPlan(step.actionVerb);
            if (cachedPlanArray && cachedPlanArray.length > 0) {
                res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray));
                return;
            }
            const resultUnknownVerb = await this.handleUnknownVerb(step, trace_id);
            res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
        }
    }

    /**
     * Find the best handler (plugin or plan template) for an actionVerb.
     * Returns an object: { type: 'plugin' | 'planTemplate', handler: PluginDefinition | PlanTemplate }
     */
    private async getHandlerForActionVerb(actionVerb: string, trace_id: string): Promise<{ type: string, handler: any } | null> {
        const source_component = "CapabilitiesManager.getHandlerForActionVerb";
        try {
            const plugin = await this.pluginRegistry.fetchOneByVerb(actionVerb);
            if (plugin) {
                return { type: 'plugin', handler: plugin };
            }

            // Try to find an OpenAPI tool - This direct call will be removed.
            // const openApiTool = await this.findOpenAPIToolByActionVerb(actionVerb);
            // if (openApiTool) {
            //     console.log(`[${trace_id}] ${source_component}: Found OpenAPI tool for actionVerb '${actionVerb}': ${openApiTool.id}`);
            //     return { type: 'openapiTool', handler: openApiTool };
            // }

            // Try to find an MCP tool - This direct call will be removed.
            // const mcpTool = await this.findMCPToolByActionVerb(actionVerb, trace_id);
            // if (mcpTool) {
            //     console.log(`[${trace_id}] ${source_component}: Found MCP tool for actionVerb '${actionVerb}': ${mcpTool.id}`);
            //     return { type: 'mcpTool', handler: mcpTool };
            // }

            // If plugin is found by pluginRegistry, it could be a code plugin, openapi tool, or mcp tool.
            // The type differentiation will happen based on plugin.language in executeActionVerb.
            if (plugin) {
                 // The 'type' here is generic 'plugin' now, specific type (openapi, mcp) determined by language later.
                return { type: 'plugin', handler: plugin };
            }

            // TODO: Add PlanTemplate lookup here if they are also to be channelled via PluginRegistry.
            // For now, PlanTemplates are not dynamically looked up as primary handlers in this function if not via pluginRegistry.

            return null;
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error resolving handler for actionVerb '${actionVerb}':`, error.message);
            return null;
        }
    }

    // private async findMCPToolByActionVerb(actionVerb: string, trace_id: string): Promise<MCPTool | null> {
    //     // This method is being removed as MCP tools will be fetched via PluginRegistry -> PluginMarketplace.
    //     // ... (implementation removed)
    // }

    // Helper to log plugin lookup failures with cooldown
    private logPluginLookupFailure(actionVerb: string, trace_id: string, message: string) {
        const now = Date.now();
        const lastFailure = this.failedPluginLookups.get(actionVerb) || 0;
        if (now - lastFailure > CapabilitiesManager.PLUGIN_LOOKUP_COOLDOWN_MS) {
            console.warn(`[${trace_id}] ${message}`);
            this.failedPluginLookups.set(actionVerb, now);
        }
    }

    protected async executePlugin(
        pluginToExecute: PluginDefinition,
        inputsForPlugin: Map<string, InputValue>,
        actualPluginRootPath: string,
        trace_id: string
    ): Promise<PluginOutput[]> {
        if (pluginToExecute.verb === 'SEARCH') {
            console.log(`[${trace_id}] CapabilitiesManager.executePlugin: Inputs for SEARCH plugin execution:`, MapSerializer.transformForSerialization(inputsForPlugin));
        }
        const source_component = "CapabilitiesManager.executePlugin";
        console.log(`[${trace_id}] ${source_component}: Executing plugin ${pluginToExecute.id} v${pluginToExecute.version} (${pluginToExecute.verb}) at ${actualPluginRootPath}`);

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
            const tokenManager = this.getTokenManager();
            token = await tokenManager.getToken();

            if (pluginToExecute.verb === 'ACCOMPLISH') {
                const brainTokenManager = new ServiceTokenManager(
                    `http://${this.securityManagerUrl}`,
                    'Brain',
                    process.env.CLIENT_SECRET || 'stage7AuthSecret'
                );
                brainToken = await brainTokenManager.getToken();
            }

            const currentEnv = { ...process.env };
            if (token) currentEnv.CM_AUTH_TOKEN = token;
            if (brainToken) currentEnv.BRAIN_AUTH_TOKEN = brainToken;

            const environment: environmentType = {
                env: currentEnv,
                credentials: configSet ?? []
            };

            const executionInputs = new Map(inputsForPlugin);
            if (token) executionInputs.set('__auth_token', {
                inputName: '__auth_token',
                value: token,
                valueType: PluginParameterType.STRING,
                args: { token }
            });

            if (brainToken) {
                executionInputs.set('__brain_auth_token', {
                    inputName: '__brain_auth_token',
                    value: brainToken,
                    valueType: PluginParameterType.STRING,
                    args: { token: brainToken }
                });
                executionInputs.set('token', {
                    inputName: 'token',
                    value: brainToken,
                    valueType: PluginParameterType.STRING,
                    args: { token: brainToken }
                });
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
                    return await executePluginInSandbox(
                        executionContext.pluginDefinition,
                        Array.from(executionContext.inputValues.values()),
                        executionContext.environment
                    );
                } catch (sandboxError: any) {
                    console.error(`[${trace_id}] ${source_component}: Sandbox execution failed for ${pluginToExecute.id} v${pluginToExecute.version}, falling back to direct: ${sandboxError.message}`);
                    sandboxError.trace_id = trace_id;
                    throw sandboxError;
                }
            } else if (pluginToExecute.language === 'python') {
                return this.executePythonPlugin(executionContext);
            } else if (pluginToExecute.language === 'container') {
                return this.executeContainerPlugin(executionContext);
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
            if (error.error_id && error.trace_id) {
                return createPluginOutputError(error);
            }

            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Execution failed for plugin ${pluginToExecute?.id || 'unknown'} v${pluginToExecute?.version || 'unknown'}: ${error.message}`,
                source_component,
                original_error: error,
                contextual_info: {
                    plugin_id: pluginToExecute?.id,
                    verb: pluginToExecute?.verb,
                    version: pluginToExecute?.version
                },
                trace_id_param: trace_id
            });
            return createPluginOutputError(sError);
        }
    }

    private async executePythonPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, environment, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executePythonPlugin";
        const mainFilePath = path.join(pluginRootPath, pluginDefinition.entryPoint!.main);

        console.log(`[${trace_id}] ${source_component}: Python execution - Main file path: ${mainFilePath}, Root path: ${pluginRootPath}`);

        try {
            // Check if plugin has dependencies and install them if needed
            await this.ensurePythonDependencies(pluginRootPath, trace_id);

            // Convert Map to array of [key, value] pairs for Python plugin compatibility
            const inputsArray: [string, InputValue][] = Array.from(inputValues.entries());

            const inputsJsonString = JSON.stringify(inputsArray);

            // Use enhanced Python execution with better error handling and security
            const pythonCommand = await this.buildPythonCommand(mainFilePath, pluginRootPath, inputsJsonString, pluginDefinition);

            console.log(`[${trace_id}] ${source_component}: Executing Python command: ${pythonCommand}`);
            console.log(`[${trace_id}] ${source_component}: Piping inputsJsonString to Python plugin: ${inputsJsonString}`);

            const { stdout, stderr } = await execAsync(pythonCommand, {
                cwd: pluginRootPath,
                env: {
                    ...environment.env,
                    PYTHONPATH: pluginRootPath,
                    PYTHONUNBUFFERED: '1',  // Ensure immediate output
                    PYTHONDONTWRITEBYTECODE: '1'  // Prevent .pyc files
                },
                timeout: pluginDefinition.security?.sandboxOptions?.timeout || 30000
            });

            console.log(`[${trace_id}] ${source_component}: Raw stdout from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stdout}`);
            if (stderr) {
                console.warn(`[${trace_id}] ${source_component}: Raw stderr from Python plugin ${pluginDefinition.verb} v${pluginDefinition.version}:\n${stderr}`);
            }

            // Validate and parse output
            const result = this.validatePythonOutput(stdout, pluginDefinition, trace_id);
            return result;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error during execAsync for ${pluginDefinition.verb} v${pluginDefinition.version}. Error: ${error.message}`);
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
                trace_id_param: trace_id,
                contextual_info: {
                    plugin_id: pluginDefinition.id,
                    version: pluginDefinition.version,
                    command_executed: "python3", // This might be slightly inaccurate due to buildPythonCommand changes
                    stdout_on_error: (error as any).stdout,
                    stderr_on_error: (error as any).stderr,
                    main_file: mainFilePath
                }
            });
        }
    }

    private async executeContainerPlugin(executionContext: ExecutionContext): Promise<PluginOutput[]> {
        const { pluginDefinition, inputValues, pluginRootPath, trace_id } = executionContext;
        const source_component = "CapabilitiesManager.executeContainerPlugin";

        console.log(`[${trace_id}] ${source_component}: Container execution for plugin ${pluginDefinition.id} v${pluginDefinition.version}`);

        try {
            // Validate container configuration
            if (!pluginDefinition.container || !pluginDefinition.api) {
                throw new Error("Container plugin missing container or api configuration");
            }

            // Convert to ContainerPluginManifest
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

            // Build the container image if needed
            await this.containerManager.buildPluginImage(containerManifest, pluginRootPath, trace_id);

            // Start the container
            const containerInstance = await this.containerManager.startPluginContainer(containerManifest, trace_id);

            try {
                // Prepare execution request
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

                // Execute the plugin in the container
                const response = await this.containerManager.executePluginInContainer(
                    containerInstance,
                    containerManifest,
                    executionRequest,
                    trace_id
                );

                if (!response.success) {
                    throw new Error(response.error || "Container execution failed");
                }

                // Convert container response to PluginOutput format
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
                // Clean up the container
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

    private async ensurePythonDependencies(pluginRootPath: string, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.ensurePythonDependencies";
        const requirementsPath = path.join(pluginRootPath, 'requirements.txt');

        // Check if requirements.txt exists
        if (!fs.existsSync(requirementsPath)) {
            console.log(`[${trace_id}] ${source_component}: No requirements.txt found, skipping dependency installation`);
            return;
        }

        try {
            // Check if dependencies are already installed by looking for a .dependencies_installed marker
            const markerPath = path.join(pluginRootPath, '.dependencies_installed');
            const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
            const requirementsHash = require('crypto').createHash('md5').update(requirementsContent).digest('hex');

            if (fs.existsSync(markerPath)) {
                const existingHash = fs.readFileSync(markerPath, 'utf8').trim();
                if (existingHash === requirementsHash) {
                    console.log(`[${trace_id}] ${source_component}: Dependencies already installed and up to date`);
                    return;
                }
            }

            const venvPath = path.join(pluginRootPath, 'venv');
            // Platform-aware venv paths
            const isWindows = process.platform === 'win32';
            const venvBinDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
            const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');
            const venvPipPath = path.join(venvBinDir, isWindows ? 'pip.exe' : 'pip');

            // Helper to check if venv is healthy
            function venvHealthy() {
                return fs.existsSync(venvPythonPath) && fs.existsSync(venvPipPath);
            }

            // If venv exists but is not healthy, remove it
            if (fs.existsSync(venvPath) && !venvHealthy()) {
                console.warn(`[${trace_id}] ${source_component}: Existing venv at ${venvPath} is broken (missing python or pip). Deleting and recreating.`);
                // Remove venv recursively
                fs.rmSync(venvPath, { recursive: true, force: true });
            }

            let installCommand: string;
            if (!fs.existsSync(venvPath)) {
                console.log(`[${trace_id}] ${source_component}: Creating virtual environment at ${venvPath}.`);
                installCommand = `${isWindows ? 'python' : 'python3'} -m venv "${venvPath}" && "${venvPipPath}" install --upgrade pip && "${venvPipPath}" install -r "${requirementsPath}"`;
            } else {
                console.log(`[${trace_id}] ${source_component}: Virtual environment exists and is healthy at ${venvPath}. Installing dependencies using its pip.`);
                installCommand = `"${venvPipPath}" install --upgrade pip && "${venvPipPath}" install -r "${requirementsPath}"`;
            }

            console.log(`[${trace_id}] ${source_component}: Install command: ${installCommand}`);

            const { stdout, stderr } = await execAsync(installCommand, {
                cwd: pluginRootPath, // Execute in the plugin's root directory
                timeout: 120000  // 2 minutes timeout for dependency installation
            });

            if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
                // Some warnings might not include "Successfully installed" but are not critical errors.
                // e.g. deprecation warnings. We log them but don't necessarily fail.
                console.warn(`[${trace_id}] ${source_component}: Python dependency installation stderr: ${stderr}`);
            }
            if (stdout) {
                console.log(`[${trace_id}] ${source_component}: Python dependency installation stdout: ${stdout}`);
            }

            // Create marker file with requirements hash
            fs.writeFileSync(markerPath, requirementsHash);
            console.log(`[${trace_id}] ${source_component}: Python dependencies processed successfully for ${pluginRootPath}. Marker file updated.`);

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Failed to install Python dependencies for ${pluginRootPath}: ${error.message}`);
            // Log specific error details if available
            if (error.stderr) {
                console.error(`[${trace_id}] ${source_component}: Stderr from failed command: ${error.stderr}`);
            }
            if (error.stdout) {
                console.error(`[${trace_id}] ${source_component}: Stdout from failed command: ${error.stdout}`);
            }
        }
    }

    private async buildPythonCommand(mainFilePath: string, pluginRootPath: string, inputsJson: string, pluginDefinition: PluginDefinition): Promise<string> {
        const venvPythonPath = path.join(pluginRootPath, 'venv', 'bin', 'python');
        const pythonExecutable = fs.existsSync(venvPythonPath) ? `"${venvPythonPath}"` : 'python3';

        // Use a more reliable approach to pass JSON to Python
        // Instead of shell escaping, we'll use base64 encoding to avoid shell interpretation issues
        const base64Input = Buffer.from(inputsJson).toString('base64');

        // Build the command with base64 encoded input
        // The plugin's main script is executed with the python from its venv (if available) or system python3.
        // The pluginRootPath is passed as an argument to the script, useful if the script needs to know its own location.
        const command = `echo "${base64Input}" | base64 -d | ${pythonExecutable} "${mainFilePath}" "${pluginRootPath}"`;

        return command;
    }

    private validatePythonOutput(stdout: string, pluginDefinition: PluginDefinition, trace_id: string): PluginOutput[] {
        const source_component = "CapabilitiesManager.validatePythonOutput";
        console.log(`[${trace_id}] ${source_component}: Validating Python output for ${pluginDefinition.verb} v${pluginDefinition.version}. Received stdout:\n${stdout}`);

        try {
            // Parse JSON output
            const result = JSON.parse(stdout);

            // Validate that result is an array
            if (!Array.isArray(result)) {
                throw new Error("Plugin output must be an array of PluginOutput objects");
            }

            // Validate each output object
            for (const output of result) {
                if (typeof output !== 'object' || output === null) {
                    throw new Error("Each output must be an object");
                }

                // Check required fields
                const requiredFields = ['success', 'name', 'resultType', 'result', 'resultDescription'];
                for (const field of requiredFields) {
                    if (!(field in output)) {
                        throw new Error(`Missing required field: ${field}`);
                    }
                }

                // Validate field types
                if (typeof output.success !== 'boolean') {
                    throw new Error("Field 'success' must be a boolean");
                }
                if (typeof output.name !== 'string') {
                    throw new Error("Field 'name' must be a string");
                }
                if (typeof output.resultType !== 'string') {
                    throw new Error("Field 'resultType' must be a string");
                }
                if (typeof output.resultDescription !== 'string') {
                    throw new Error("Field 'resultDescription' must be a string");
                }
            }

            console.log(`[${trace_id}] ${source_component}: Python plugin output parsed and validated successfully for ${pluginDefinition.verb} v${pluginDefinition.version}`);
            return result;

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Invalid Python plugin output for ${pluginDefinition.verb} v${pluginDefinition.version}: JSON parsing failed. Error: ${error.message}`);
            console.error(`[${trace_id}] ${source_component}: Raw stdout that failed to parse: ${stdout}`);

            // Return error output
            return [{
                success: false,
                name: 'validation_error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `Invalid plugin output format: ${error.message}. Raw output: ${stdout.substring(0, 200)}...`,
                error: error.message
            }];
        }
    }

    private async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleUnknownVerb";
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputValues)}`;
            const goal = `Handle the action verb \"${step.actionVerb}\" in our plan with the following context: ${context} by defining a plan, generating an answer from the inputs, or recommending a new plugin for handling the actionVerb. Respond with a plan, a plugin request, or a literal result. Avoid using this action verb, ${step.actionVerb}, in the plan.`;

            const accomplishResultArray = await this.executeAccomplishPlugin(goal, step.actionVerb, trace_id);
            console.log(`[handleUnknownVerb] plugin result:`, accomplishResultArray);
            if (!accomplishResultArray[0].success) {
                return accomplishResultArray;
            }

            const accomplishResult = accomplishResultArray[0];
            switch (accomplishResult.resultType) {
                case PluginParameterType.PLAN:
                case PluginParameterType.STRING:
                case PluginParameterType.NUMBER:
                case PluginParameterType.BOOLEAN:
                case PluginParameterType.DIRECT_ANSWER:
                case PluginParameterType.PLUGIN:
                    return accomplishResultArray;

                default:
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                        severity: ErrorSeverity.ERROR,
                        message: `Unexpected result type '${accomplishResult.resultType}' from ACCOMPLISH plugin.`,
                        source_component,
                        trace_id_param: trace_id
                    });
            }
        } catch (error: any) {
            if (error.error_id && error.trace_id) {
                throw error;
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Failed to handle unknown verb '${step.actionVerb}': ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {actionVerb: step.actionVerb}
            });
        }
    }

    private async executeAccomplishPlugin(goal: string, verbToAvoid: string, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeAccomplishPlugin";
        try {
            // Get available plugins string from pluginRegistry (which proxies to marketplace)
            const availablePluginsStr = await this.pluginRegistry.getAvailablePluginsStr();
            const accomplishInputs : Map<string, InputValue> = new Map([
                ['goal', { inputName: 'goal', value: goal, valueType: PluginParameterType.STRING, args: {} }],
                ['verbToAvoid', { inputName: 'verbToAvoid', value: verbToAvoid, valueType: PluginParameterType.STRING, args: {} }],
                ['available_plugins', { inputName: 'available_plugins', value: availablePluginsStr, valueType: PluginParameterType.STRING, args: {} }]
            ]);

            const accomplishPluginManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH');
            if (!accomplishPluginManifest) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND,
                    severity: ErrorSeverity.CRITICAL,
                    message: "ACCOMPLISH plugin manifest not found.",
                    trace_id_param: trace_id,
                    source_component
                });
            }

            // Convert PluginDefinition to PluginManifest for execution
            const manifestForExecution: PluginManifest = {
                ...accomplishPluginManifest,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            return await this.executePlugin(effectiveManifest, accomplishInputs, pluginRootPath, trace_id);
        } catch (error:any) {
            if (error.error_id && error.trace_id) {
                throw error;
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `Core ACCOMPLISH plugin execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {goal_length: goal.length}
            });
        }
    }

    private async checkCachedPlan(actionVerb: string): Promise<PluginOutput[] | null> {
        const trace_id = uuidv4();
        const source_component = "CapabilitiesManager.checkCachedPlan";
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${actionVerb}`, {
                params: { collection: 'actionPlans', storageType: 'mongo' }
            });

            if (response.data?.data) {
                console.log(`[${trace_id}] ${source_component}: Found cached plan for verb: ${actionVerb}`);
                return response.data.data as PluginOutput[];
            }
            return null;
        } catch (error:any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.WARNING,
                message: `Could not check cached plan for verb '${actionVerb}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
            return null;
        }
    }

    private async cachePlan(actionVerb: string, planOutput: PluginOutput): Promise<void> {
        const trace_id = uuidv4();
        const source_component = "CapabilitiesManager.cachePlan";
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'actionPlans',
                id: actionVerb,
                data: [planOutput]
            });
            console.log(`[${trace_id}] ${source_component}: Cached plan for verb: ${actionVerb}`);
        } catch (error:any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.WARNING,
                message: `Could not cache plan for verb '${actionVerb}'. ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id
            });
        }
    }
    
    private async executeTemplate(template: PlanTemplate, context: PlanExecutionContext, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.executeTemplate";

        try {
            context.status = 'running';
            await this.updateExecutionContext(context);

            // Build dependency graph
            const dependencyGraph = this.buildDependencyGraph(template.tasks);

            // Execute tasks in dependency order
            for (const taskId of dependencyGraph) {
                const task = template.tasks.find(t => t.id === taskId);
                if (!task) continue;

                const stepExecution: StepExecution = {
                    taskId: task.id,
                    stepId: uuidv4(),
                    status: 'pending',
                    inputs: {},
                    outputs: {},
                    retryCount: 0
                };

                context.steps.push(stepExecution);
                await this.executeStep(template, task, stepExecution, context, trace_id);
            }

            // Extract final outputs
            context.outputs = this.extractOutputs(template, context);
            context.status = 'completed';
            context.metadata.endTime = new Date();

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Template execution failed:`, error);
            context.status = 'failed';
            context.metadata.endTime = new Date();
        } finally {
            await this.updateExecutionContext(context);
        }
    }

    private buildDependencyGraph(tasks: any[]): string[] {
        // Simple topological sort for task dependencies
        const graph = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        // Initialize graph
        for (const task of tasks) {
            graph.set(task.id, task.dependsOn || []);
            inDegree.set(task.id, 0);
        }

        // Calculate in-degrees
        for (const [taskId, deps] of graph) {
            for (const dep of deps) {
                inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
            }
        }

        // Topological sort
        const result: string[] = [];
        const queue: string[] = [];

        for (const [taskId, degree] of inDegree) {
            if (degree === 0) queue.push(taskId);
        }

        while (queue.length > 0) {
            const current = queue.shift()!;
            result.push(current);

            const deps = graph.get(current) || [];
            for (const dep of deps) {
                const newDegree = (inDegree.get(dep) || 0) - 1;
                inDegree.set(dep, newDegree);
                if (newDegree === 0) queue.push(dep);
            }
        }

        return result;
    }

    private async executeStep(template: PlanTemplate, task: any, stepExecution: StepExecution, context: PlanExecutionContext, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.executeStep";

        try {
            stepExecution.status = 'running';
            stepExecution.startTime = new Date();

            // Resolve inputs
            stepExecution.inputs = this.resolveStepInputs(task, context);

            // Create Step object for execution
            const step: Step = {
                id: stepExecution.stepId,
                stepNo: context.steps.length,
                actionVerb: task.actionVerb,
                description: task.description,
                inputValues: new Map(Object.entries(stepExecution.inputs).map(([k, v]) => [k, { inputName: k, value: v, valueType: PluginParameterType.STRING, args: {} }])),
                outputs: new Map(),
                dependencies: [],
                status: 'pending'
            };

            // Execute the step
            const result = await this.executeActionVerbInternal(step, trace_id);

            stepExecution.outputs = this.extractStepOutputs(result);
            // Determine step status based on plugin output
            if (Array.isArray(result) && result.some(r => r.success === true)) {
                stepExecution.status = 'completed';
            } else {
                stepExecution.status = 'failed';
                // Try to set error message from first output
                if (Array.isArray(result) && result.length > 0) {
                    stepExecution.error = result[0].error || result[0].resultDescription || 'Step failed';
                } else {
                    stepExecution.error = 'Step failed (no output)';
                }
            }
            stepExecution.endTime = new Date();

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Step execution failed:`, error);
            stepExecution.status = 'failed';
            stepExecution.error = error.message;
            stepExecution.endTime = new Date();
        } finally {
            await this.updateExecutionContext(context);
        }
    }

    private resolveStepInputs(task: any, context: PlanExecutionContext): { [key: string]: any } {
        const resolvedInputs: { [key: string]: any } = {};

        for (const [inputName, inputValue] of Object.entries(task.inputs)) {
            if (typeof inputValue === 'string') {
                // Handle template references like {{inputs.topic}} or {{tasks.search.outputs.results}}
                if (inputValue.startsWith('{{') && inputValue.endsWith('}}')) {
                    const reference = inputValue.slice(2, -2).trim();
                    resolvedInputs[inputName] = this.resolveReference(reference, context);
                } else {
                    resolvedInputs[inputName] = inputValue;
                }
            } else {
                resolvedInputs[inputName] = inputValue;
            }
        }

        return resolvedInputs;
    }

    private resolveReference(reference: string, context: PlanExecutionContext): any {
        const parts = reference.split('.');

        if (parts[0] === 'inputs') {
            // Reference to execution inputs
            return this.getNestedValue(context.inputs, parts.slice(1));
        } else if (parts[0] === 'tasks') {
            // Reference to task outputs
            const taskId = parts[1];
            const step = context.steps.find(s => s.taskId === taskId);
            if (step && parts[2] === 'outputs') {
                return this.getNestedValue(step.outputs, parts.slice(3));
            }
        }

        return null;
    }

    private getNestedValue(obj: any, path: string[]): any {
        let current = obj;
        for (const key of path) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return null;
            }
        }
        return current;
    }

    private extractStepOutputs(result: PluginOutput[]): { [key: string]: any } {
        const outputs: { [key: string]: any } = {};

        for (const output of result) {
            if (output.success) {
                outputs[output.name] = output.result;
            }
        }

        return outputs;
    }

    private extractOutputs(template: PlanTemplate, context: PlanExecutionContext): { [key: string]: any } {
        const outputs: { [key: string]: any } = {};

        for (const outputDef of template.outputs) {
            if (outputDef.name) {
                // For plan templates, we need to check if there's a source reference
                // If not, try to find the output in the last step or by name
                let value = null;

                // Try to find the output in the completed steps
                for (const step of context.steps) {
                    if (step.outputs && step.outputs[outputDef.name]) {
                        value = step.outputs[outputDef.name];
                        break;
                    }
                }

                outputs[outputDef.name] = value;
            }
        }

        return outputs;
    }

    private async updateExecutionContext(context: PlanExecutionContext): Promise<void> {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'executionContexts',
                id: context.id,
                data: context,
                storageType: 'mongo'
            });
        } catch (error: any) {
            console.error('Failed to update execution context:', error);
        }
    }

    private async executeActionVerbInternal(step: Step, trace_id: string): Promise<PluginOutput[]> {
        // Handle special internal action verbs first
        if (step.actionVerb === 'EXECUTE_PLAN_TEMPLATE_INTERNAL') {
            return await this.handleExecutePlanTemplateInternal(step, trace_id);
        }

        // First try to find a plugin
        const plugin = await this.pluginRegistry.fetchOneByVerb(step.actionVerb) as PluginDefinition | null;

        if (plugin) {
            // Execute plugin
            const validatedInputs = await validateAndStandardizeInputs(plugin, step.inputValues || new Map());
            if (!validatedInputs.success) {
                throw new Error(validatedInputs.error || "Input validation failed");
            }

            const manifestForExecution: PluginManifest = {
                ...plugin,
                repository: {
                    type: 'local' as any,
                    url: '',
                    dependencies: {}
                }
            };

            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(manifestForExecution);
            return await this.executePlugin(effectiveManifest, validatedInputs.inputs!, pluginRootPath, trace_id);
        }

        // If plugin (which could be a DefinitionManifest) is found:
        if (plugin) {
            // Check if it's a DefinitionManifest for OpenAPI or MCP
            if ((plugin as any).language === DefinitionType.OPENAPI && (plugin as DefinitionManifest).toolDefinition) {
                const definitionManifest = plugin as DefinitionManifest;
                const openApiToolDef = definitionManifest.toolDefinition as OpenAPITool;
                if (openApiToolDef.specUrl) { // Basic check for valid OpenAPITool
                    return await this.executeOpenAPIToolInternal(openApiToolDef, step, trace_id);
                } else {
                    throw new Error(`OpenAPI manifest for verb '${step.actionVerb}' is missing a valid toolDefinition in executeActionVerbInternal.`);
                }
            } else if ((plugin as any).language === DefinitionType.MCP && (plugin as DefinitionManifest).toolDefinition) {
                const definitionManifest = plugin as DefinitionManifest;
                const mcpToolDef = definitionManifest.toolDefinition as MCPTool;
                if (mcpToolDef.actionMappings) { // Basic check for valid MCPTool
                    return await this.executeMCPTool(mcpToolDef, step, trace_id);
                } else {
                     throw new Error(`MCP manifest for verb '${step.actionVerb}' is missing a valid toolDefinition in executeActionVerbInternal.`);
                }
            } else if ((plugin as any).language === 'javascript' || (plugin as any).language === 'python' || (plugin as any).language === 'container') {
                 console.warn(`[${trace_id}] executeActionVerbInternal: Handler found with language '${(plugin as any).language}' but not a recognized definition type or standard code type. Falling back.`);
            } else {
                 console.warn(`[${trace_id}] executeActionVerbInternal: Handler found with language '${(plugin as any).language}' but not a recognized definition type (OpenAPI, MCP) or standard code type. Falling back.`);
            }
        }

        // If no handler found via PluginRegistry, or if it was an unknown type, handle as unknown verb
        return await this.handleUnknownVerb(step, trace_id);
    }

    private async executeOpenAPIToolInternal(tool: OpenAPITool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeOpenAPIToolInternal";

        try {
            // Find the action mapping for this action verb
            const actionMapping = tool.actionMappings.find(mapping => mapping.actionVerb === step.actionVerb);
            if (!actionMapping) {
                throw new Error(`Action verb ${step.actionVerb} not found in OpenAPI tool ${tool.id}`);
            }

            // Build the API request
            const apiRequest = await this.buildOpenAPIRequest(tool, actionMapping, step);

            // Execute the API call
            const startTime = Date.now();
            const apiResponse = await this.makeOpenAPICall(apiRequest);
            const responseTime = Date.now() - startTime;

            // Convert API response to PluginOutput format
            const pluginOutputs: PluginOutput[] = [{
                success: true,
                name: 'result',
                resultType: PluginParameterType.OBJECT,
                result: apiResponse.data,
                resultDescription: `OpenAPI call to ${actionMapping.method} ${actionMapping.path}`,
                mimeType: 'application/json'
            }];

            // Add metadata about the API call
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

        // Process inputs according to parameter mappings
        for (const inputMapping of actionMapping.inputs) {
            const inputValue = step.inputValues?.get(inputMapping.name)?.value;

            if (inputValue !== undefined) {
                switch (inputMapping.in) {
                    case 'path':
                        // Replace path parameters
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

        // Add query parameters to URL
        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.append(key, String(value));
        }

        // Add authentication
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
                    // Query and cookie auth would be handled in buildOpenAPIRequest
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
        // For now, try to get from environment variables
        // In a production system, this would integrate with a proper secrets manager
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
                validateStatus: (status) => status < 500 // Accept 4xx as valid responses
            });

            return response;
        } catch (error: any) {
            if (error.response) {
                // API returned an error response
                throw new Error(`API call failed with status ${error.response.status}: ${error.response.data?.message || error.response.statusText}`);
            } else if (error.request) {
                // Network error
                throw new Error(`Network error: ${error.message}`);
            } else {
                // Other error
                throw new Error(`Request setup error: ${error.message}`);
            }
        }
    }

    private async handleExecutePlanTemplateInternal(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.handleExecutePlanTemplateInternal";

        try {
            const templateId = step.inputValues?.get('templateId')?.value as string;
            const inputs = step.inputValues?.get('inputs')?.value || {};
            const userId = step.inputValues?.get('userId')?.value as string || 'agent-user';
            const executionMode = step.inputValues?.get('executionMode')?.value as string || 'automatic';

            if (!templateId) {
                throw new Error('Template ID is required for plan template execution');
            }

            // Get the plan template
            const templateResponse = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${templateId}`, {
                params: {
                    collection: 'planTemplates',
                    storageType: 'mongo'
                }
            });

            if (!templateResponse.data?.data) {
                throw new Error(`Plan template not found: ${templateId}`);
            }

            const template: PlanTemplate = templateResponse.data.data;

            // Create execution context
            const executionContext: PlanExecutionContext = {
                id: uuidv4(),
                planTemplateId: template.id,
                planTemplateVersion: template.metadata.version,
                status: 'pending' as PlanExecutionStatus,
                inputs: inputs,
                steps: [],
                outputs: {},
                metadata: {
                    startTime: new Date(),
                    userId: userId,
                    executionMode: executionMode as any
                }
            };

            // Store initial execution context
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                collection: 'executionContexts',
                id: executionContext.id,
                data: executionContext,
                storageType: 'mongo'
            });

            // Start execution (async)
            this.executeTemplate(template, executionContext, trace_id).catch(error => {
                console.error(`[${trace_id}] ${source_component}: Template execution failed:`, error);
            });

            console.log(`[${trace_id}] ${source_component}: Started execution of template: ${templateId}`);

            return [{
                success: true,
                name: 'executionId',
                resultType: PluginParameterType.STRING,
                result: executionContext.id,
                resultDescription: 'Plan template execution started'
            }, {
                success: true,
                name: 'templateId',
                resultType: PluginParameterType.STRING,
                result: templateId,
                resultDescription: 'Template ID being executed'
            }, {
                success: true,
                name: 'status',
                resultType: PluginParameterType.STRING,
                result: 'started',
                resultDescription: 'Execution status'
            }];

        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Error executing plan template:`, error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: `Plan template execution failed: ${error.message}`,
                error: error.message
            }];
        }
    }

    /**
     * Cleanup method for graceful shutdown
     */
    async cleanup(): Promise<void> {
        const trace_id = `cleanup-${uuidv4().substring(0,8)}`;
        const source_component = "CapabilitiesManager.cleanup";

        try {
            console.log(`[${trace_id}] ${source_component}: Starting cleanup...`);

            // Cleanup container manager
            if (this.containerManager) {
                await this.containerManager.cleanup(trace_id);
            }

            // Close server if running
            if (this.server) {
                this.server.close();
            }

            console.log(`[${trace_id}] ${source_component}: Cleanup completed`);
        } catch (error: any) {
            console.error(`[${trace_id}] ${source_component}: Cleanup failed: ${error.message}`);
        }
    }

    private async executeMCPTool(mcpTool: MCPTool, step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "CapabilitiesManager.executeMCPTool";
        console.log(`[${trace_id}] ${source_component}: Executing MCP Tool ${mcpTool.id} for actionVerb ${step.actionVerb}`);

        const actionMapping = mcpTool.actionMappings.find(m => m.actionVerb === step.actionVerb);
        if (!actionMapping) {
            const errorMsg = `ActionVerb '${step.actionVerb}' not found in MCP Tool '${mcpTool.id}'. This should have been caught by getHandlerForActionVerb.`;
            console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
            return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, errorMsg, trace_id)];
        }

        try {
            // 1. Validate Inputs
            const validatedInputsResult = await validateAndStandardizeInputs(actionMapping as any, step.inputValues || new Map()); // Cast as any because actionMapping is not PluginDefinition
            if (!validatedInputsResult.success || !validatedInputsResult.inputs) {
                const errorMsg = validatedInputsResult.error || "Input validation failed for MCP tool.";
                console.error(`[${trace_id}] ${source_component}: ${errorMsg}`);
                return [this.createErrorOutput(GlobalErrorCodes.INPUT_VALIDATION_FAILED, errorMsg, trace_id, { toolId: mcpTool.id, actionVerb: step.actionVerb })];
            }
            const validatedInputs = validatedInputsResult.inputs;
            const inputsObject: { [key: string]: any } = {};
            validatedInputs.forEach((value, key) => {
                inputsObject[key] = value.value;
            });

            // 2. Prepare Request for MCP Service
            // This part is highly dependent on the specifics of MCPServiceTarget and how MCP services are called.
            // For this example, let's assume mcpServiceTarget.serviceName is a key for a URL in config or env,
            // and we make a POST request with inputsObject as JSON body.

            const mcpTarget = actionMapping.mcpServiceTarget;
            let targetUrl = mcpTarget.serviceName; // Could be a direct URL or a service discovery key

            // Basic service discovery placeholder (replace with actual discovery if used)
            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                 // Try to resolve from environment, assuming format MCP_SERVICE_<NAME>_URL
                const envUrl = process.env[`MCP_SERVICE_${targetUrl.toUpperCase().replace(/-/g, '_')}_URL`];
                if (envUrl) {
                    targetUrl = envUrl;
                } else {
                    // Fallback or error if service name cannot be resolved
                    console.error(`[${trace_id}] ${source_component}: Cannot resolve MCP service name '${mcpTarget.serviceName}' to a URL.`);
                    return [this.createErrorOutput(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, `Cannot resolve MCP service name '${mcpTarget.serviceName}'.`, trace_id)];
                }
            }

            // Append endpoint/command if it's a path
            if (mcpTarget.endpointOrCommand.startsWith('/')) {
                targetUrl += mcpTarget.endpointOrCommand;
            } else {
                // If not a path, it might be part of the payload or a different protocol.
                // This example focuses on HTTP.
                console.warn(`[${trace_id}] ${source_component}: MCP endpointOrCommand '${mcpTarget.endpointOrCommand}' is not a path, specific handling required.`);
            }

            const requestConfig: any = {
                method: mcpTarget.method.toLowerCase() || 'post',
                url: targetUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Trace-ID': trace_id,
                    // Add other common headers
                },
                data: inputsObject // Assuming inputs are sent as JSON body
            };

            // Add additional static config from mcpServiceTarget
            if (mcpTarget.additionalConfig) {
                if (mcpTarget.additionalConfig.headers) {
                    requestConfig.headers = { ...requestConfig.headers, ...mcpTarget.additionalConfig.headers };
                }
                // Handle other additionalConfig fields as needed
            }


            // 3. Handle Authentication
            // Use authentication from mcpTool, since MCPActionMapping does not have 'authentication'
            const authConfig = mcpTool.authentication;
            if (authConfig) {
                await this.applyMCPAuthentication(requestConfig.headers, authConfig, trace_id);
            }


            // 4. Make the call
            console.log(`[${trace_id}] ${source_component}: Calling MCP service. URL: ${requestConfig.url}, Method: ${requestConfig.method}`);
            const mcpResponse = await axios(requestConfig);

            // 5. Transform Response to PluginOutput[]
            // This is also highly dependent on the expected response structure from MCP services
            // and what's defined in actionMapping.outputs.
            // For simplicity, assume the response data is an object with keys matching output names.
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
                    } else {
                         outputs.push({
                            success: false, // Or true if partial success is allowed and output is optional
                            name: outputDef.name,
                            resultType: PluginParameterType.ERROR,
                            result: null,
                            resultDescription: `Output '${outputDef.name}' not found in MCP response.`,
                            error: `Output '${outputDef.name}' not found in MCP response.`
                        });
                    }
                }
                 // If no specific outputs matched, but we got data, return it as a generic result
                if (outputs.length === 0) {
                     outputs.push({
                        success: true,
                        name: 'mcp_result',
                        resultType: PluginParameterType.OBJECT,
                        result: mcpResponse.data,
                        resultDescription: `Raw response from MCP tool ${mcpTool.id}`,
                    });
                }

            } else {
                // Handle non-object or empty responses
                outputs.push({
                    success: true, // Or false if data is strictly expected
                    name: 'mcp_response',
                    resultType: this.inferResultType(mcpResponse.data),
                    result: mcpResponse.data,
                    resultDescription: `Response from MCP tool ${mcpTool.id}`,
                });
            }

            console.log(`[${trace_id}] ${source_component}: MCP Tool ${mcpTool.id} executed successfully.`);
            return outputs;

       

        } catch ( error: any) {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR,
                message: `MCP Tool '${mcpTool.id}' action '${step.actionVerb}' execution failed: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: {
                    toolId: mcpTool.id,
                    actionVerb: step.actionVerb,
                    mcpTarget: actionMapping.mcpServiceTarget,
                    responseStatus: error.response?.status,
                    responseData: error.response?.data
                }
            });
            return createPluginOutputError(sError);
        }
    }

    private async applyMCPAuthentication(headers: any, authConfig: MCPAuthentication, trace_id: string): Promise<void> {
        const source_component = "CapabilitiesManager.applyMCPAuthentication";
        console.log(`[${trace_id}] ${source_component}: Applying MCP authentication type: ${authConfig.type}`);

        try {
            switch (authConfig.type) {
                case 'none':
                    break;
                case 'apiKey':
                    if (authConfig.apiKey) {
                        const keyName = authConfig.apiKey.name;
                        const keyValue = authConfig.apiKey.value || (authConfig.apiKey.credentialSource ? await this.getCredential(authConfig.apiKey.credentialSource) : undefined);
                        if (!keyValue) {
                            throw new Error(`API key value not found for ${keyName}.`);
                        }
                        if (authConfig.apiKey.in === 'header') {
                            headers[keyName] = keyValue;
                        } else if (authConfig.apiKey.in === 'query') {
                            // Query params need to be added to URL, this function only modifies headers
                            // This indicates a need for a more comprehensive request modification function
                            console.warn(`[${trace_id}] ${source_component}: API key in query for ${keyName} not directly supported by this header modification function.`);
                        }
                        // 'body' would also need different handling
                    } else {
                         throw new Error("apiKey authentication config is missing.");
                    }
                    break;
                case 'customToken':
                    if (authConfig.customToken && authConfig.customToken.credentialSource) {
                        const token = await this.getCredential(authConfig.customToken.credentialSource);
                        const tokenPrefix = authConfig.customToken.tokenPrefix || '';
                        headers[authConfig.customToken.headerName] = `${tokenPrefix}${token}`;
                    } else {
                        throw new Error("customToken authentication config is incomplete.");
                    }
                    break;
                // Add cases for oauth2 or other MCP-specific auth types
                default:
                    console.warn(`[${trace_id}] ${source_component}: Unsupported MCP authentication type: ${authConfig.type}`);
                    // Potentially throw an error if unsupported auth type is critical
                    break;
            }
        } catch (error: any) {
             generateStructuredError({
                error_code: GlobalErrorCodes.AUTHENTICATION_ERROR,
                severity: ErrorSeverity.ERROR,
                message: `Failed to apply MCP authentication: ${error.message}`,
                source_component,
                original_error: error,
                trace_id_param: trace_id,
                contextual_info: { authType: authConfig.type }
            });
            throw error; // Re-throw to be caught by the calling function
        }
    }

    private createErrorOutput(
        errorCode: string,
        message: string,
        trace_id: string,
        contextual_info?: any
    ): PluginOutput {
        const sError = generateStructuredError({
            error_code: errorCode,
            severity: ErrorSeverity.ERROR,
            message: message,
            source_component: "CapabilitiesManager", // Generic source for this helper
            trace_id_param: trace_id,
            contextual_info: contextual_info
        });
        return {
            success: false,
            name: sError.error_code || 'error',
            resultType: PluginParameterType.ERROR,
            result: sError,
            resultDescription: sError.message_human_readable,
            error: sError.message_human_readable,
        };
    }

}

export const capabilitiesManager = new CapabilitiesManager();
export default CapabilitiesManager;

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, starting graceful shutdown...');
    await capabilitiesManager.cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, starting graceful shutdown...');
    await capabilitiesManager.cleanup();
    process.exit(0);
});
