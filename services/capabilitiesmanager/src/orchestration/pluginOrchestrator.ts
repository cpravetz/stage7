import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express'; // For Request, Response types in handlers

import {
    Step, MapSerializer, BaseEntity, ServiceTokenManager, PluginInput, PluginOutput,
    PluginDefinition, PluginParameterType, environmentType, PluginManifest,
    verifyPluginSignature, validatePluginPermissions, checkPluginCompatibility
} from '@cktmcs/shared';

import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from '../utils/errorReporter';
import { ConfigManager } from '../utils/configManager';
import { PluginRegistry } from '../utils/pluginRegistry';
import { validateAndStandardizeInputs } from '../utils/validator';
import { requestPluginFromEngineer as actualRequestPluginFromEngineer } from '../utils/engineer'; // This will be used by UnknownVerbWorkflowService

import { PluginExecutionService, ExecutionContext as PluginServiceExecutionContext } from '../services/pluginExecutionService';
import { UnknownVerbWorkflowService } from '../services/unknownVerbWorkflowService';
// ApiRouterService is not directly instantiated or used by PluginOrchestrator; it uses the orchestrator.

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

// This interface is used by UnknownVerbWorkflowService for calling back to orchestrator
// to use its authenticatedApi for requestPluginFromEngineer
export interface EngineerRequesterContext extends BaseEntity {
    // No additional methods needed beyond what BaseEntity provides for requestPluginFromEngineer
}


export class PluginOrchestrator extends BaseEntity implements EngineerRequesterContext {
    private librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040';
    // private server: any; // Server instance will be managed by ApiRouterService
    public configManager!: ConfigManager; // Made public for PluginExecutionService if needed, or pass explicitly
    public pluginRegistry: PluginRegistry; // Made public for ApiRouterService and other services
    
    // Services
    private pluginExecutionService!: PluginExecutionService;
    private unknownVerbWorkflowService!: UnknownVerbWorkflowService;
    
    private serviceId = 'PluginOrchestrator'; // Updated serviceId

    constructor() {
        // Port is now managed by ApiRouterService, but BaseEntity might still need a default or passed-in port
        super('PluginOrchestrator', 'PluginOrchestrator', `pluginorchestrator`, process.env.PORT || '5060');
        const trace_id = `${this.serviceId}-constructor-${uuidv4().substring(0, 8)}`;
        console.log(`[${trace_id}] Starting PluginOrchestrator initialization...`);
        
        this.pluginRegistry = new PluginRegistry();
        // ConfigManager initialization is async, must be handled in initialize method
        // this.configManager = await ConfigManager.initialize(this.librarianUrl); // MOVED to initialize()

        // Initialize services - ConfigManager is needed by PluginExecutionService
        // Defer service initialization until ConfigManager is ready in `initialize`
        console.log(`[${trace_id}] PluginOrchestrator constructor completed. Services will be initialized in 'initialize()'.`);
    }

    public async initialize(trace_id_param?: string): Promise<void> {
        const trace_id = trace_id_param || `${this.serviceId}-initialize-${uuidv4().substring(0, 8)}`;
        const source_component = "PluginOrchestrator.initialize";
        try {
            this.configManager = await ConfigManager.initialize(this.librarianUrl);
            console.log(`[${trace_id}] ${source_component}: ConfigManager initialized.`);

            // Now initialize services that depend on ConfigManager
            this.pluginExecutionService = new PluginExecutionService(this.configManager, this.securityManagerUrl);
            this.unknownVerbWorkflowService = new UnknownVerbWorkflowService(this.pluginRegistry, this.pluginExecutionService, this);


            // The server startup is now handled by ApiRouterService, which is created in index.ts
            // await this.start(trace_id); // 'start' in BaseEntity might do more than just server setup. Review BaseEntity.start

            if (!this.registeredWithPostOffice) {
                console.log(`[${trace_id}] ${source_component}: Registering with PostOffice...`);
                // port, name, serviceId, version, node are set in BaseEntity constructor
                await this.registerWithPostOffice(15, 2000);
                if (this.registeredWithPostOffice) {
                    console.log(`[${trace_id}] ${source_component}: Successfully registered with PostOffice.`);
                } else {
                     // Log error, but don't prevent startup for now. PostOffice might be optional or recover.
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, // Use a more generic code or specific orchestrator code
                        severity: ErrorSeverity.CRITICAL,
                        message: "CRITICAL - Failed to register with PostOffice after multiple attempts.",
                        source_component,
                        trace_id_param: trace_id
                    });
                }
            } else {
                console.log(`[${trace_id}] ${source_component}: Already registered with PostOffice.`);
            }
            this.setupPeriodicReregistration(trace_id); // Keep this for PostOffice heartbeats
            console.log(`[${trace_id}] ${source_component}: Initialization complete.`);
        } catch (error: any) {
            const initError = error instanceof Error ? error : new Error(String(error));
            const message = (initError as any).message_human_readable || initError.message;
            console.error(`[${trace_id}] ${source_component} INIT_FAILURE: ${message}`, (initError as any).contextual_info || initError.stack);
            process.exit(1); // Exit if essential parts of initialization fail
        }
    }
    
    // setupServer is removed, now handled by ApiRouterService
    // start method from BaseEntity might be implicitly called or parts of it are covered by initialize.
    // If BaseEntity.start() does more than server setup, that needs to be preserved here or in initialize.
    // For now, assuming ApiRouterService handles all server aspects.

    private setupPeriodicReregistration(trace_id_parent: string): void {
        const source_component = "PluginOrchestrator.setupPeriodicReregistration";
        setInterval(async () => {
            const trace_id = `${trace_id_parent}-reReg-${uuidv4().substring(0,8)}`;
            if (!this.registeredWithPostOffice) {
                console.log(`[${trace_id}] ${source_component}: Not registered with PostOffice. Attempting to register...`);
                await this.registerWithPostOffice(5, 1000);
            } else {
                try {
                    // Verify registration by checking if PostOffice knows about us
                    const response = await this.authenticatedApi.get(`http://${this.postOfficeUrl}/getServices`);
                    const services = response.data;
                    // Adjust service name if it changed from 'capabilitiesManagerUrl' to 'pluginOrchestratorUrl'
                    if (!services || !services[this.name + 'Url']) { // Using this.name which is 'PluginOrchestrator'
                        console.warn(`[${trace_id}] ${source_component}: Not found in PostOffice services list. Re-registering...`);
                        this.registeredWithPostOffice = false;
                        await this.registerWithPostOffice(5, 1000);
                    } else {
                        if (process.env.DEBUG_POSTOFFICE) {
                             console.log(`[${trace_id}] ${source_component}: Still registered with PostOffice.`);
                        }
                    }
                } catch (error:any) {
                    generateStructuredError({
                        error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, // Or a more generic code
                        severity: ErrorSeverity.WARNING,
                        message: "Error verifying registration with PostOffice. Will attempt re-registration.",
                        source_component, original_error: error, trace_id_param: trace_id
                    });
                    this.registeredWithPostOffice = false; // Assume registration lost
                }
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    // Handler for /storeNewPlugin route (called by ApiRouterService)
    public async storeNewPluginHandler(req: Request, res: Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "PluginOrchestrator.storeNewPluginHandler";
        try {
            const newPlugin = req.body as PluginManifest;

            if (!newPlugin.id || !newPlugin.verb || !newPlugin.version || !newPlugin.language ) {
                const err = generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MANIFEST_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: "Plugin manifest validation failed: Missing id, verb, version, or language.",
                    contextual_info: { plugin_id: newPlugin.id, verb: newPlugin.verb, version: newPlugin.version, language: newPlugin.language }, trace_id_param: trace_id, source_component
                });
                res.status(400).json(createPluginOutputError(err));
                return;
            }
            if (newPlugin.language !== 'openapi' && (!newPlugin.entryPoint || !newPlugin.entryPoint.main)) {
                const err = generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_MANIFEST_VALIDATION_FAILED,
                    severity: ErrorSeverity.ERROR, message: "Plugin manifest validation failed: Missing entryPoint.main for non-openapi plugin.",
                    contextual_info: { plugin_id: newPlugin.id, language: newPlugin.language }, trace_id_param: trace_id, source_component
                });
                res.status(400).json(createPluginOutputError(err));
                return;
            }

            const existingPlugin = await this.pluginRegistry.fetchOne(newPlugin.id, newPlugin.version, newPlugin.repository?.type);
            if (existingPlugin) {
                console.warn(`[${trace_id}] ${source_component}: Plugin ${newPlugin.id} version ${newPlugin.version} already exists. Store operation will likely update or be rejected by the repository based on its policy.`);
            }

            if (!newPlugin.security?.trust?.signature) {
                const err = generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED, severity: ErrorSeverity.ERROR,
                    message: 'Plugin submission requires a signature.', contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                });
                res.status(400).json(createPluginOutputError(err));
                return;
            }
            if (!await verifyPluginSignature(newPlugin as PluginDefinition)) { // Cast to PluginDefinition
                const err = generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED, severity: ErrorSeverity.ERROR,
                    message: 'Plugin signature is invalid.', contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                });
                res.status(400).json(createPluginOutputError(err));
                return;
            }

            const permissionErrors = validatePluginPermissions(newPlugin);
            if (permissionErrors.length > 0) {
                const err = generateStructuredError({
                    error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED, severity: ErrorSeverity.ERROR,
                    message: `Plugin permission validation failed: ${permissionErrors.join(', ')}`, contextual_info: { plugin_id: newPlugin.id }, trace_id_param: trace_id, source_component
                });
                res.status(400).json(createPluginOutputError(err));
                return;
            }

            await this.pluginRegistry.store(newPlugin);
            console.log(`[${trace_id}] ${source_component}: Plugin registered/updated: ${newPlugin.id} v${newPlugin.version}`);
            res.status(200).json({ message: 'Plugin registered successfully', pluginId: newPlugin.id, version: newPlugin.version, isUpdate: !!existingPlugin });

        } catch (error: any) {
            const sError = generateStructuredError({
                error_code: error.code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_STORE_FAILED,
                severity: ErrorSeverity.ERROR, message: `Failed to store plugin '${req.body?.id || 'unknown'}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
            });
            const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR")) ? 400 : 500);
            res.status(httpStatus).json(createPluginOutputError(sError));
        }
    }

    // Handler for /executeAction route (called by ApiRouterService)
    public async executeActionVerbHandler(req: Request, res: Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        const source_component = "PluginOrchestrator.executeActionVerbHandler";
        const step = { ...req.body, inputs: MapSerializer.transformFromSerialization(req.body.inputs) } as Step;

        if (!step.actionVerb || typeof step.actionVerb !== 'string') {
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_INVALID_REQUEST_GENERIC, severity: ErrorSeverity.ERROR,
                message: 'Invalid or missing actionVerb in request.', source_component, trace_id_param: trace_id
            });
            res.status(400).json(createPluginOutputError(sError));
            return;
        }

        const pluginDetails = (step as any).plugin_details;
        const pluginIdToFetch = pluginDetails?.plugin_id || step.actionVerb;
        const pluginVersionToFetch = pluginDetails?.plugin_version;
        const hostCapabilities = { hostVersion: process.env.CM_VERSION || "1.0.0", hostAppName: "PluginOrchestrator" };

        console.log(`[${trace_id}] ${source_component}: Executing action: ${step.actionVerb}, PluginID: ${pluginIdToFetch}, Version: ${pluginVersionToFetch || 'default/latest'}`);

        let plugin: PluginDefinition | undefined;
        try {
            if (pluginDetails && pluginDetails.plugin_id && pluginDetails.plugin_version) {
                plugin = await this.pluginRegistry.fetchOne(pluginDetails.plugin_id, pluginDetails.plugin_version);
                if (!plugin) {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND,
                        severity: ErrorSeverity.ERROR, message: `Plugin '${pluginDetails.plugin_id}' version '${pluginDetails.plugin_version}' not found.`,
                        source_component, trace_id_param: trace_id, contextual_info: { plugin_id: pluginDetails.plugin_id, version: pluginDetails.plugin_version }
                    });
                }
                console.log(`[${trace_id}] ${source_component}: Successfully fetched specific plugin ${plugin.id} v${plugin.version}`);
                const compatibility = checkPluginCompatibility(plugin, hostCapabilities);
                if (!compatibility.compatible) {
                    console.warn(`[${trace_id}] ${source_component}: Warning - Explicitly requested plugin ${plugin.id} v${plugin.version} may not be fully compatible. Reason: ${compatibility.reason || 'N/A'}`);
                } else {
                    console.log(`[${trace_id}] ${source_component}: Explicitly requested plugin ${plugin.id} v${plugin.version} is compatible.`);
                }
            } else {
                const allVersions = await this.pluginRegistry.fetchAllVersionsByVerb(step.actionVerb);
                if (allVersions && allVersions.length > 0) {
                    for (const p of allVersions) {
                        const compatibility = checkPluginCompatibility(p, hostCapabilities);
                        console.log(`[${trace_id}] ${source_component}: Checking compatibility for plugin ${p.id} v${p.version}. Compatible: ${compatibility.compatible}. Reason: ${compatibility.reason || 'N/A'}`);
                        if (compatibility.compatible) {
                            plugin = p;
                            console.log(`[${trace_id}] ${source_component}: Selected plugin ${plugin.id} v${plugin.version} for verb ${step.actionVerb} based on compatibility.`);
                            break;
                        }
                    }
                    if (!plugin) {
                        throw generateStructuredError({
                            error_code: GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND,
                            severity: ErrorSeverity.ERROR,
                            message: `No compatible version of plugin for action verb '${step.actionVerb}' found for host ${hostCapabilities.hostAppName} v${hostCapabilities.hostVersion}.`,
                            source_component, trace_id_param: trace_id,
                            contextual_info: { actionVerb: step.actionVerb, hostCapabilities, checkedVersions: allVersions.map(v => ({id: v.id, version: v.version, requirements: v.requirements})) }
                        });
                    }
                } else {
                    console.log(`[${trace_id}] ${source_component}: No versions found for verb ${step.actionVerb}.`);
                }
            }

            if (!plugin) {
                console.log(`[${trace_id}] ${source_component}: Plugin for action '${step.actionVerb}' not found or no compatible version. Handling as unknown verb or checking cache.`);
                const cachedPlanArray = await this.checkCachedPlan(step.actionVerb);
                if (cachedPlanArray && cachedPlanArray.length > 0) {
                    console.log(`[${trace_id}] ${source_component}: Using cached plan for verb: ${step.actionVerb}`);
                    res.status(200).send(MapSerializer.transformForSerialization(cachedPlanArray));
                    return;
                } else {
                    console.log(`[${trace_id}] ${source_component}: No cached plan. Delegating to UnknownVerbWorkflowService for '${step.actionVerb}'.`);
                    const resultUnknownVerb = await this.unknownVerbWorkflowService.handleUnknownVerb(step, trace_id);
                    res.status(200).send(MapSerializer.transformForSerialization(resultUnknownVerb));
                    return;
                }
            }
        } catch (error: any) {
            const errorCode = error.error_code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_FETCH_FAILED;
            const sError = generateStructuredError({
                error_code: errorCode,
                severity: ErrorSeverity.ERROR, message: `Failed to fetch or determine compatible plugin for action '${step.actionVerb}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: { actionVerb: step.actionVerb, plugin_id: pluginIdToFetch, plugin_version: pluginVersionToFetch, hostCapabilities }
            });
            const httpStatus = error.error_code === GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND ? 400 : // Changed from PLUGIN_VERSION_NOT_COMPATIBLE
                               error.error_code === GlobalErrorCodes.PLUGIN_VERSION_NOT_FOUND ? 404 :
                               (error.originalError?.response?.status || 500);
            res.status(httpStatus).json(createPluginOutputError(sError));
            return;
        }

        if (plugin) {
            try {
                const validatedInputsResult = await validateAndStandardizeInputs(plugin, step.inputs);
                if (!validatedInputsResult.success) {
                    throw generateStructuredError({
                        error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED,
                        severity: ErrorSeverity.ERROR, message: validatedInputsResult.error || "Input validation failed for plugin.",
                        source_component, contextual_info: { plugin_id: plugin.id, version: plugin.version, verb: plugin.verb }, trace_id_param: trace_id
                    });
                }

                const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(plugin as PluginManifest);
                
                const configSet = await this.configManager.getPluginConfig(effectiveManifest.id);
                const currentEnv = { ...process.env }; // Base environment variables
                const environmentForPlugin: environmentType = { env: currentEnv, credentials: configSet ?? [] };

                const executionContext: PluginServiceExecutionContext = {
                    inputs: validatedInputsResult.inputs || new Map<string, PluginInput>(),
                    environment: environmentForPlugin,
                    pluginDefinition: effectiveManifest,
                    pluginRootPath: pluginRootPath,
                    trace_id: trace_id
                };
                
                // Get CM_AUTH_TOKEN for the plugin execution
                const cmAuthToken = await this.getTokenManager().getToken();

                const result = await this.pluginExecutionService.execute(executionContext, cmAuthToken);
                
                // Record usage after successful or attempted execution (policy decision)
                await this.configManager.recordPluginUsage(effectiveManifest.id);

                res.status(200).send(MapSerializer.transformForSerialization(result));

            } catch (error: any) {
                console.error(`[${trace_id}] ${source_component}: Error during execution pipeline for ${plugin.verb} v${plugin.version}: ${error.message}`, error.stack);
                const errorCode = error.code || error.error_code || GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED;
                const sError = generateStructuredError({
                    error_code: errorCode,
                    severity: ErrorSeverity.CRITICAL,
                    message: `Execution pipeline failed for plugin '${plugin.verb}' v'${plugin.version || 'unknown'}'. ${error.message}`,
                    source_component, original_error: error, trace_id_param: trace_id,
                    contextual_info: { plugin_id: plugin.id, verb: plugin.verb, version: plugin.version, actionVerb: step.actionVerb }
                });
                const httpStatus = error.originalError?.response?.status || (error.code && typeof error.code === 'string' && (error.code.startsWith("G") || error.code.startsWith("PR") || error.code === GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_PREPARATION_FAILED) ? 400 : 500);
                res.status(httpStatus).json(createPluginOutputError(sError));
            }
        } else {
            // This case should have been handled by previous logic (unknown verb or error)
            console.error(`[${trace_id}] ${source_component}: Plugin is undefined before execution, though this state should have been handled. ActionVerb: ${step.actionVerb}`);
            const sError = generateStructuredError({
                error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND,
                severity: ErrorSeverity.ERROR,
                message: `Plugin for action verb '${step.actionVerb}' could not be determined or found, and was not handled by unknown verb workflow.`,
                source_component, trace_id_param: trace_id, contextual_info: { actionVerb: step.actionVerb }
            });
            res.status(404).json(createPluginOutputError(sError));
        }
    }

    // Methods moved to PluginExecutionService:
    // - executePlugin (now part of this.pluginExecutionService.execute)
    // - executeOpenAPIPlugin
    // - executeJavaScriptPlugin (sandboxed one is called from PluginExecutionService)
    // - executePythonPlugin

    // Methods moved to UnknownVerbWorkflowService:
    // - handleUnknownVerb
    // - executeAccomplishPlugin

    // Methods moved to ApiRouterService:
    // - setupServer
    // - Most route handlers (now implemented as public methods on PluginOrchestrator, called by ApiRouterService)

    // --- Helper methods that might be used by handlers or internally ---
    private async checkCachedPlan(actionVerb: string): Promise<PluginOutput[] | null> {
        const trace_id = uuidv4();
        const source_component = "PluginOrchestrator.checkCachedPlan";
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData`, {
                params: { collection: 'actionPlans', id: actionVerb }
            });
            if (response.data?.data) {
                console.log(`[${trace_id}] ${source_component}: Found cached plan for verb: ${actionVerb}`);
                return response.data.data as PluginOutput[];
            }
            return null;
        } catch (error: any) {
            generateStructuredError({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.WARNING,
                message: `Could not check cached plan for verb '${actionVerb}'. ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id
            });
            return null;
        }
    }

    // Example of a handler method for ApiRouterService
    public healthCheckHandler(req: Request, res: Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        super.healthCheckHandler(req, res, trace_id); // Call BaseEntity's healthCheckHandler
    }
    
    public readinessCheckHandler(req: Request, res: Response) {
        const trace_id = (req as any).trace_id || uuidv4();
        super.readinessCheckHandler(req, res, trace_id); // Call BaseEntity's readinessCheckHandler
    }

    public async handleBaseMessageHandler(message: any, trace_id: string) {
        // Wrapper for BaseEntity's handleBaseMessage if needed, or ApiRouterService calls super.handleBaseMessage directly
        // For now, this assumes ApiRouterService might need an explicit handler on the orchestrator.
        await super.handleBaseMessage(message);
    }
    
    // Make authenticatedApi accessible to UnknownVerbWorkflowService via EngineerRequesterContext
    public getAuthenticatedApi() {
        return this.authenticatedApi;
    }

    public async requestPluginFromEngineer(step: Step, pluginDetails: string, trace_id: string): Promise<PluginOutput> {
        return actualRequestPluginFromEngineer(this, step, pluginDetails, trace_id);
    }
}

// Note: We are not exporting an instance like `export const pluginOrchestrator = new PluginOrchestrator();` here.
// Instantiation will be handled in index.ts to manage the async initialization.
// export default PluginOrchestrator; // Default export for class
