import { sanitizeInputValue, performPreExecutionChecks } from '../src/utils/inputSanitizer';
import { InputValue, PluginParameterType } from '@cktmcs/shared';

describe('inputSanitizer', () => {
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('sanitizeInputValue', () => {
        it('should convert non-string to string for STRING type', () => {
            const input: InputValue = { inputName: 'test', value: 123, valueType: PluginParameterType.STRING, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe('123');
        });

        it('should remove null bytes from STRING type', () => {
            const input: InputValue = { inputName: 'test', value: 'hello\x00world', valueType: PluginParameterType.STRING, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe('helloworld');
        });

        it('should convert numeric string to NUMBER type', () => {
            const input: InputValue = { inputName: 'test', value: '123.45', valueType: PluginParameterType.NUMBER, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe(123.45);
        });

        it('should convert boolean string to BOOLEAN type', () => {
            let input: InputValue = { inputName: 'test', value: 'true', valueType: PluginParameterType.BOOLEAN, args: {} };
            let sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe(true);

            input = { inputName: 'test', value: 'FALSE', valueType: PluginParameterType.BOOLEAN, args: {} };
            sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe(false);
        });

        it('should parse JSON string to OBJECT type', () => {
            const input: InputValue = { inputName: 'test', value: '{"key":"value"}', valueType: PluginParameterType.OBJECT, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toEqual({ key: 'value' });
        });

        it('should parse JSON string to ARRAY type', () => {
            const input: InputValue = { inputName: 'test', value: '[1,2,3]', valueType: PluginParameterType.ARRAY, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toEqual([1, 2, 3]);
        });

        it('should split plain string to ARRAY type', () => {
            const input: InputValue = { inputName: 'test', value: 'item1, item2;item3\nitem4', valueType: PluginParameterType.ARRAY, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toEqual(['item1', 'item2', 'item3', 'item4']);
        });

        it('should apply TEXT_ANALYSIS specific rule', () => {
            const input: InputValue = { inputName: 'text', value: 'hello\x00world\x01', valueType: PluginParameterType.STRING, args: {} };
            const sanitized = sanitizeInputValue(input, 'TEXT_ANALYSIS', MOCK_TRACE_ID);
            expect(sanitized.value).toBe('helloworld');
        });

        it('should apply FILE_OPS specific rule', () => {
            const input: InputValue = { inputName: 'path', value: 'C:\\path\\to/file.txt?*<>', valueType: PluginParameterType.STRING, args: {} };
            const sanitized = sanitizeInputValue(input, 'FILE_OPS', MOCK_TRACE_ID);
            expect(sanitized.value).toBe('C:/path/to/file.txt____');
        });

        it('should return original input on error', () => {
            const input: InputValue = { inputName: 'test', value: 'invalid json', valueType: PluginParameterType.OBJECT, args: {} };
            const sanitized = sanitizeInputValue(input, 'ANY_VERB', MOCK_TRACE_ID);
            expect(sanitized.value).toBe('invalid json');
            expect(console.warn).toHaveBeenCalled();
        });
    });

    describe('performPreExecutionChecks', () => {
        it('should return isValid true for valid inputs', () => {
            const inputs = new Map<string, InputValue>([
                ['small_string', { inputName: 'small_string', value: 'abc', valueType: PluginParameterType.STRING, args: {} }],
                ['small_array', { inputName: 'small_array', value: [1, 2], valueType: PluginParameterType.ARRAY, args: {} }],
                ['flat_object', { inputName: 'flat_object', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(true);
            expect(result.issues).toEqual([]);
        });

        it('should flag very large string inputs', () => {
            const inputs = new Map<string, InputValue>([
                ['large_string', { inputName: 'large_string', value: 'a'.repeat(1000001), valueType: PluginParameterType.STRING, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain(expect.stringContaining('Input 'large_string' is very large'));
        });

        it('should flag problematic characters in string inputs', () => {
            const inputs = new Map<string, InputValue>([
                ['bad_string', { inputName: 'bad_string', value: 'text <script>&;', valueType: PluginParameterType.STRING, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain(expect.stringContaining('Input 'bad_string' contains characters'));
        });

        it('should not flag problematic characters in base64-like strings', () => {
            const inputs = new Map<string, InputValue>([
                ['base64_string', { inputName: 'base64_string', value: 'SGVsbG8gV29ybGQ=', valueType: PluginParameterType.STRING, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(true);
            expect(result.issues).toEqual([]);
        });

        it('should flag very large array inputs', () => {
            const inputs = new Map<string, InputValue>([
                ['large_array', { inputName: 'large_array', value: Array(10001).fill(1), valueType: PluginParameterType.ARRAY, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain(expect.stringContaining('Input 'large_array' array is very large'));
        });

        it('should flag deeply nested objects', () => {
            let nestedObject: any = {};
            let current = nestedObject;
            for (let i = 0; i < 51; i++) {
                current.next = {};
                current = current.next;
            }
            const inputs = new Map<string, InputValue>([
                ['deep_object', { inputName: 'deep_object', value: nestedObject, valueType: PluginParameterType.OBJECT, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain(expect.stringContaining('Input 'deep_object' has deep nesting'));
        });

        it('should flag large text input for TEXT_ANALYSIS verb', () => {
            const inputs = new Map<string, InputValue>([
                ['text', { inputName: 'text', value: 'word '.repeat(10001), valueType: PluginParameterType.STRING, args: {} }],
            ]);
            const result = performPreExecutionChecks(inputs, 'TEXT_ANALYSIS', MOCK_TRACE_ID);
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain(expect.stringContaining('Text input contains 10001 words'));
        });

        it('should log warnings for issues', () => {
            const inputs = new Map<string, InputValue>([
                ['large_string', { inputName: 'large_string', value: 'a'.repeat(1000001), valueType: PluginParameterType.STRING, args: {} }],
            ]);
            performPreExecutionChecks(inputs, 'ANY_VERB', MOCK_TRACE_ID);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Found 1 potential issues'), expect.any(Array));
        });
    });
});
