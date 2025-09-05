import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from '../src/utils/errorReporter';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid');
const mockUuidv4 = uuidv4 as jest.Mock;

describe('errorReporter', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUuidv4.mockReturnValue('mock-uuid');
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('should generate a basic structured error', () => {
        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
        });

        expect(error).toEqual(expect.objectContaining({
            error_id: 'mock-uuid',
            trace_id: 'mock-uuid',
            timestamp_utc: expect.any(String),
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message_human_readable: 'Something went wrong',
            source_component: 'test-component',
            contextual_info: {},
        }));
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should include provided trace_id', () => {
        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
            trace_id: 'custom-trace-id',
        });

        expect(error.trace_id).toBe('custom-trace-id');
    });

    it('should include contextual_info', () => {
        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
            contextual_info: { key: 'value', num: 123 },
        });

        expect(error.contextual_info).toEqual({ key: 'value', num: 123 });
    });

    it('should include suggested_action', () => {
        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
            suggested_action: 'Try again',
        });

        expect(error.suggested_action).toBe('Try again');
    });

    it('should include original_error details if it is an Error instance', () => {
        const originalError = new Error('Original error message');
        originalError.stack = 'Original stack trace';

        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
            original_error: originalError,
        });

        expect(error.contextual_info.original_error_message).toBe('Original error message');
        expect(error.contextual_info.original_error_stack).toBe('Original stack trace');
        expect(error.contextual_info.original_error_details).toBeUndefined();
    });

    it('should include original_error details if it is not an Error instance', () => {
        const originalError = 'Just a string error';

        const error = generateStructuredError({
            error_code: GlobalErrorCodes.UNKNOWN_ERROR,
            severity: ErrorSeverity.ERROR,
            message: 'Something went wrong',
            source_component: 'test-component',
            original_error: originalError,
        });

        expect(error.contextual_info.original_error_details).toBe('Just a string error');
        expect(error.contextual_info.original_error_message).toBeUndefined();
        expect(error.contextual_info.original_error_stack).toBeUndefined();
    });

    describe('Validation Errors', () => {
        it('should log as warn for VALIDATION severity', () => {
            const error = generateStructuredError({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                severity: ErrorSeverity.VALIDATION,
                message: 'Invalid input format',
                source_component: 'test-validator',
                contextual_info: { validation_type: 'format' },
            });

            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Error [test-validator]: Invalid input format (Type: format, Code: V001_INVALID_INPUT, Trace: mock-uuid, ID: mock-uuid)'));
            expect(error.contextual_info.is_validation_error).toBe(true);
            expect(error.contextual_info.validation_type).toBe('format');
        });

        it('should add specific suggested_action for MISSING_REQUIRED_INPUT', () => {
            const error = generateStructuredError({
                error_code: GlobalErrorCodes.MISSING_REQUIRED_INPUT,
                severity: ErrorSeverity.VALIDATION,
                message: 'Missing field',
                source_component: 'test-validator',
            });
            expect(error.suggested_action).toBe('Ensure all required inputs are provided with non-empty values');
        });

        it('should add specific suggested_action for INVALID_INPUT_TYPE', () => {
            const error = generateStructuredError({
                error_code: GlobalErrorCodes.INVALID_INPUT_TYPE,
                severity: ErrorSeverity.VALIDATION,
                message: 'Wrong type',
                source_component: 'test-validator',
            });
            expect(error.suggested_action).toBe('Check the type of the provided input matches the expected type');
        });

        it('should add specific suggested_action for INVALID_INPUT', () => {
            const error = generateStructuredError({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                severity: ErrorSeverity.VALIDATION,
                message: 'Bad value',
                source_component: 'test-validator',
            });
            expect(error.suggested_action).toBe('Validate input format and content against the plugin requirements');
        });

        it('should add default suggested_action for other validation errors', () => {
            const error = generateStructuredError({
                error_code: GlobalErrorCodes.PLAN_VALIDATION_EMPTY_PLAN,
                severity: ErrorSeverity.VALIDATION,
                message: 'Empty plan',
                source_component: 'test-validator',
            });
            expect(error.suggested_action).toBe('Review input requirements in the plugin documentation');
        });
    });
});
