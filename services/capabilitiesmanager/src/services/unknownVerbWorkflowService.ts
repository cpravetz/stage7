import {
    Step, MapSerializer, PluginInput, PluginOutput, PluginDefinition, PluginParameterType,
    PluginManifest, environmentType // Added for type hint
} from '@cktmcs/shared';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from '../utils/errorReporter';
import { PluginRegistry } from '../utils/pluginRegistry';
import { PluginExecutionService, ExecutionContext } from './pluginExecutionService'; // Assuming ExecutionContext is exported
import { requestPluginFromEngineer } from '../utils/engineer'; // Path might need adjustment
// import { PluginOrchestrator } from '../orchestration/pluginOrchestrator'; // Circular dependency if PluginOrchestrator directly uses this. Pass necessary methods/refs.

// Helper to create PluginOutput error from a StructuredError - Duplicating temporarily
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

// Forward declaration for methods that might be on PluginOrchestrator if not passed directly
interface EngineerRequester {
    requestPluginFromEngineer(step: Step, pluginDetails: string, trace_id: string): Promise<PluginOutput>;
    // We need a way to get the authenticatedApi for requestPluginFromEngineer if it uses 'this.authenticatedApi'
    // This might mean passing the orchestrator or a specific http client configured like orchestrator's authenticatedApi
    getAuthenticatedApi(): any; 
}


export class UnknownVerbWorkflowService {
    private pluginRegistry: PluginRegistry;
    private pluginExecutionService: PluginExecutionService;
    private engineerRequester: EngineerRequester; // Or pass orchestrator instance

    constructor(
        pluginRegistry: PluginRegistry,
        pluginExecutionService: PluginExecutionService,
        engineerRequester: EngineerRequester // e.g. the PluginOrchestrator instance
    ) {
        this.pluginRegistry = pluginRegistry;
        this.pluginExecutionService = pluginExecutionService;
        this.engineerRequester = engineerRequester;
        console.log("UnknownVerbWorkflowService initialized");
    }

    public async handleUnknownVerb(step: Step, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "UnknownVerbWorkflowService.handleUnknownVerb";
        try {
            const context = ` ${step.description || ''} with inputs ${MapSerializer.transformForSerialization(step.inputs)}`;
            const goal = `Handle the action verb "${step.actionVerb}" in our plan with the following context: ${context} by defining a plan, generating an answer from the inputs, or recommending a new plugin for handling the actionVerb. Respond with a plan, a plugin request, or a literal result.  Avoid using this action verb, ${step.actionVerb}, in the plan.`;

            const accomplishResultArray = await this._executeAccomplishPlugin(goal, step.actionVerb, trace_id);
            if (!accomplishResultArray[0].success) {
                return accomplishResultArray;
            }
            const accomplishResult = accomplishResultArray[0];

            switch (accomplishResult.resultType) {
                case PluginParameterType.PLAN:
                case PluginParameterType.STRING:
                case PluginParameterType.NUMBER:
                case PluginParameterType.BOOLEAN:
                    return accomplishResultArray;
                case PluginParameterType.PLUGIN:
                    // The original requestPluginFromEngineer used 'this' (CapabilitiesManager)
                    // which had 'this.authenticatedApi'. We need to ensure that context is available.
                    // For now, assuming engineerRequester provides a compatible method or context.
                    const engineerResult = await requestPluginFromEngineer(
                        this.engineerRequester, // This needs to be compatible with what requestPluginFromEngineer expects
                        step,
                        JSON.stringify(accomplishResult.result)
                    );

                    if (!engineerResult.success) return [engineerResult];

                    const pluginDef = await this.pluginRegistry.fetchOneByVerb(step.actionVerb);
                    if (!pluginDef) {
                        throw generateStructuredError({ error_code: GlobalErrorCodes.PLUGIN_NOT_FOUND, severity: ErrorSeverity.ERROR, message: `Newly created plugin for verb '${step.actionVerb}' not found after engineer request.`, source_component, trace_id_param: trace_id });
                    }
                    return [{ success: true, name: 'plugin_created', resultType: PluginParameterType.PLUGIN, result: pluginDef, resultDescription: `CM: Created new plugin for ${step.actionVerb}` }];
                default:
                    throw generateStructuredError({ error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, severity: ErrorSeverity.ERROR, message: `Unexpected result type '${accomplishResult.resultType}' from ACCOMPLISH plugin.`, source_component, trace_id_param: trace_id });
            }
        } catch (error: any) {
            if (error.error_id && error.trace_id) { // Already a StructuredError
                throw error; // Re-throw if already structured
            }
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED,
                severity: ErrorSeverity.ERROR, message: `Failed to handle unknown verb '${step.actionVerb}': ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: { actionVerb: step.actionVerb }
            });
        }
    }

    private async _executeAccomplishPlugin(goal: string, verbToAvoid: string, trace_id: string): Promise<PluginOutput[]> {
        const source_component = "UnknownVerbWorkflowService._executeAccomplishPlugin";
        try {
            const accomplishInputs = new Map<string, PluginInput>([
                ['goal', { inputName: 'goal', inputValue: goal, args: {} }],
                ['verbToAvoid', { inputName: 'verbToAvoid', inputValue: verbToAvoid, args: {} }]
            ]);
            const accomplishPluginManifest = await this.pluginRegistry.fetchOneByVerb('ACCOMPLISH') as PluginManifest; // Cast needed if fetchOneByVerb returns PluginDefinition
            if (!accomplishPluginManifest) {
                throw generateStructuredError({ error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND, severity: ErrorSeverity.CRITICAL, message: "ACCOMPLISH plugin manifest not found.", trace_id_param: trace_id, source_component });
            }
            
            // Prepare execution context for ACCOMPLISH plugin
            const { pluginRootPath, effectiveManifest } = await this.pluginRegistry.preparePluginForExecution(accomplishPluginManifest);
            
            // Environment for ACCOMPLISH might need specific credentials or env vars.
            // For now, assume default process.env and empty credentials from plugin config (if any for ACCOMPLISH)
            // This part needs careful review based on ACCOMPLISH's actual needs.
            const configSet = await this.pluginExecutionService['configManager'].getPluginConfig(effectiveManifest.id); // Accessing private member, need better way
            const accomplishEnv: environmentType = { 
                env: { ...process.env }, // Or a more restricted set
                credentials: configSet ?? []
            };

            const accomplishExecutionContext: ExecutionContext = {
                inputs: accomplishInputs,
                environment: accomplishEnv,
                pluginDefinition: effectiveManifest, // Assuming effectiveManifest is a PluginDefinition
                pluginRootPath: pluginRootPath,
                trace_id: `${trace_id}-accomplish`
            };
            
            // The PluginExecutionService.execute method expects cmAuthToken.
            // For ACCOMPLISH, it might also need a Brain token. This needs to be supplied correctly.
            // Assuming ACCOMPLISH might need a brain token, which would be handled by PluginExecutionService.execute
            // The cmAuthToken for inter-service might not be relevant for ACCOMPLISH if it's self-contained or calls out differently.
            return await this.pluginExecutionService.execute(accomplishExecutionContext /*, cmAuthToken (if needed) */);

        } catch (error: any) {
            if (error.error_id && error.trace_id) { // Already a StructuredError
                // If it's already a structured error, createPluginOutputError will wrap it again.
                // Better to just return it as is, or ensure createPluginOutputError handles it.
                // For now, let's assume execute might return PluginOutputError directly or throw structured.
                 if (Array.isArray(error) && error.length > 0 && error[0].resultType === PluginParameterType.ERROR) {
                    return error; // Already in PluginOutput error format
                }
                throw error; // Re-throw if structured, to be caught by caller
            }
            // If not structured, wrap it
            throw generateStructuredError({
                error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED,
                severity: ErrorSeverity.ERROR, message: `Core ACCOMPLISH plugin execution failed: ${error.message}`,
                source_component, original_error: error, trace_id_param: trace_id, contextual_info: { goal_length: goal.length }
            });
        }
    }
}
