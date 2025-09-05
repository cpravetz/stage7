import { createPluginOutputError, classifyError } from '../src/utils/errorHelper';
import { PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { StructuredError, GlobalErrorCodes, ErrorSeverity } from '../src/utils/errorReporter';

describe('errorHelper', () => {
    const MOCK_TRACE_ID = 'test-trace-id';

    describe('createPluginOutputError', () => {
        it('should convert a StructuredError to a PluginOutput error array', () => {
            const mockStructuredError: StructuredError = {
                error_id: 'err-123',
                trace_id: MOCK_TRACE_ID,
                timestamp_utc: new Date().toISOString(),
                error_code: GlobalErrorCodes.INVALID_INPUT,
                severity: ErrorSeverity.ERROR,
                message_human_readable: 'Invalid input provided',
                source_component: 'test-component',
                contextual_info: { input: 'bad' },
            };

            const result = createPluginOutputError(mockStructuredError);

            expect(result).toEqual([
                {
                    success: false,
                    name: GlobalErrorCodes.INVALID_INPUT,
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Invalid input provided',
                    result: mockStructuredError,
                    error: 'Invalid input provided',
                },
            ]);
        });

        it('should use UNKNOWN_ERROR code if structuredError.error_code is missing', () => {
            const mockStructuredError: StructuredError = {
                error_id: 'err-123',
                trace_id: MOCK_TRACE_ID,
                timestamp_utc: new Date().toISOString(),
                error_code: undefined as any, // Simulate missing error_code
                severity: ErrorSeverity.ERROR,
                message_human_readable: 'Generic error',
                source_component: 'test-component',
                contextual_info: {},
            };

            const result = createPluginOutputError(mockStructuredError);
            expect(result[0].name).toBe(GlobalErrorCodes.UNKNOWN_ERROR);
        });
    });

    describe('classifyError', () => {
        it('should classify by error_code: validation_error', () => {
            const error = { error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED, message: 'Validation failed' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('validation_error');
        });

        it('should classify by error_code: authentication_error', () => {
            const error = { error_code: GlobalErrorCodes.AUTHENTICATION_ERROR, message: 'Auth failed' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('authentication_error');
        });

        it('should classify by error_code: plugin_execution_error', () => {
            const error = { error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED, message: 'Exec failed' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('plugin_execution_error');
        });

        it('should classify by error_code: unknown_verb', () => {
            const error = { error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED, message: 'Unknown verb' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('unknown_verb');
        });

        it('should classify by message: validation_error', () => {
            const error = { message: 'Input validation failed' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('validation_error');
        });

        it('should classify by message: authentication_error', () => {
            const error = { message: 'User unauthorized' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('authentication_error');
        });

        it('should classify by message: unknown_verb', () => {
            const error = { message: 'Plugin not found for verb XYZ' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('unknown_verb');
        });

        it('should classify by message: brain_service_error', () => {
            const error = { message: 'Brain service returned 500 internal server error' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('brain_service_error');
        });

        it('should classify by message: json_parse_error', () => {
            const error = { message: 'Failed to parse JSON response' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('json_parse_error');
        });

        it('should classify as generic_error for unhandled cases', () => {
            const error = { message: 'Something unexpected happened' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('generic_error');
        });

        it('should prioritize error_code over message patterns', () => {
            const error = { error_code: GlobalErrorCodes.AUTHENTICATION_ERROR, message: 'Input validation failed' };
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('authentication_error');
        });

        it('should handle non-Error objects for message classification', () => {
            const error = 'Just a string error';
            expect(classifyError(error, MOCK_TRACE_ID)).toBe('generic_error');
        });
    });
});
