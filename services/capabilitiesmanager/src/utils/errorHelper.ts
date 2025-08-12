import { PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { StructuredError, GlobalErrorCodes } from './errorReporter';

// Helper to create PluginOutput error from a StructuredError
export function createPluginOutputError(structuredError: StructuredError): PluginOutput[] {
    return [{
        success: false,
        name: structuredError.error_code || GlobalErrorCodes.UNKNOWN_ERROR,
        resultType: PluginParameterType.ERROR,
        resultDescription: structuredError.message_human_readable,
        result: structuredError,
        error: structuredError.message_human_readable
    }];
}

/**
 * Classify error types to determine appropriate handling strategy
 */
export function classifyError(error: any, trace_id: string): string {
    // Check error codes first
    if (error.error_code) {
        switch (error.error_code) {
            case GlobalErrorCodes.INPUT_VALIDATION_FAILED:
                return 'validation_error';
            case GlobalErrorCodes.AUTHENTICATION_ERROR:
                return 'authentication_error';
            case GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED:
            case GlobalErrorCodes.ACCOMPLISH_PLUGIN_EXECUTION_FAILED:
                return 'plugin_execution_error';
            case GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED:
                return 'unknown_verb';
        }
    }

    const errorMessage = error.message || error.toString();
    const lowerMessage = errorMessage.toLowerCase();

    // Classify based on error patterns
    if (lowerMessage.includes('validation') || lowerMessage.includes('required input')) {
        return 'validation_error';
    }
    if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized')) {
        return 'authentication_error';
    }
    if (lowerMessage.includes('plugin not found') || lowerMessage.includes('unknown verb')) {
        return 'unknown_verb';
    }
    if (lowerMessage.includes('brain') && lowerMessage.includes('500')) {
        return 'brain_service_error';
    }
    if (lowerMessage.includes('json') && lowerMessage.includes('parse')) {
        return 'json_parse_error';
    }

    return 'generic_error';
}
