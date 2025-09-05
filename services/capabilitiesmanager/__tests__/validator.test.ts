import { validateAndStandardizeInputs } from '../src/utils/validator';
import { InputValue, PluginDefinition, PluginParameterType, createAuthenticatedAxios } from '@cktmcs/shared';
import { sanitizeInputValue, performPreExecutionChecks } from '../src/utils/inputSanitizer';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('uuid');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    createAuthenticatedAxios: jest.fn(() => ({
        post: jest.fn(),
    })),
}));
jest.mock('../src/utils/inputSanitizer');

// Cast mocked functions
const mockUuidv4 = uuidv4 as jest.Mock;
const mockCreateAuthenticatedAxios = createAuthenticatedAxios as jest.Mock;
const mockSanitizeInputValue = sanitizeInputValue as jest.Mock;
const mockPerformPreExecutionChecks = performPreExecutionChecks as jest.Mock;

describe('validateAndStandardizeInputs', () => {
    let mockBrainPost: jest.Mock;

    const mockPlugin: PluginDefinition = {
        id: 'test-plugin',
        verb: 'TEST_VERB',
        language: 'javascript',
        entryPoint: { main: 'index.js' },
        inputDefinitions: [
            { name: 'requiredString', type: PluginParameterType.STRING, required: true },
            { name: 'optionalNumber', type: PluginParameterType.NUMBER, required: false, defaultValue: 0 },
            { name: 'objectInput', type: PluginParameterType.OBJECT, required: true },
            { name: 'arrayInput', type: PluginParameterType.ARRAY, required: false },
        ],
        outputDefinitions: [],
        repository: { type: 'local' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default mocks for dependencies
        mockSanitizeInputValue.mockImplementation((input) => ({ ...input, value: input.value }));
        mockPerformPreExecutionChecks.mockReturnValue({ isValid: true, issues: [] });

        mockBrainPost = jest.fn().mockResolvedValue({ data: { result: '{}' } });
        mockCreateAuthenticatedAxios.mockReturnValue({ post: mockBrainPost });

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Clear the internal cache for transformInputsWithBrain
        (validateAndStandardizeInputs as any).__clearTransformCache();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should successfully validate and standardize inputs', async () => {
        const inputs = new Map<string, InputValue>([
            ['requiredString', { inputName: 'requiredString', value: 'hello', valueType: PluginParameterType.STRING, args: {} }],
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(true);
        expect(result.inputs?.get('requiredString')?.value).toBe('hello');
        expect(result.inputs?.get('optionalNumber')?.value).toBe(0); // Default value applied
        expect(result.inputs?.get('objectInput')?.value).toEqual({ a: 1 });
        expect(mockSanitizeInputValue).toHaveBeenCalledTimes(2); // requiredString, objectInput
        expect(mockPerformPreExecutionChecks).toHaveBeenCalledTimes(1);
        expect(mockBrainPost).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive input matching', async () => {
        const inputs = new Map<string, InputValue>([
            ['RequiredString', { inputName: 'RequiredString', value: 'hello', valueType: PluginParameterType.STRING, args: {} }],
            ['OBJECTINPUT', { inputName: 'OBJECTINPUT', value: { b: 2 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(true);
        expect(result.inputs?.get('requiredString')?.value).toBe('hello');
        expect(result.inputs?.get('objectInput')?.value).toEqual({ b: 2 });
    });

    it('should handle pluralization in input matching', async () => {
        const pluginWithPlural: PluginDefinition = {
            ...mockPlugin,
            inputDefinitions: [
                { name: 'items', type: PluginParameterType.ARRAY, required: true },
            ]
        };
        const inputs = new Map<string, InputValue>([
            ['item', { inputName: 'item', value: [1, 2], valueType: PluginParameterType.ARRAY, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(pluginWithPlural, inputs);
        expect(result.success).toBe(true);
        expect(result.inputs?.get('items')?.value).toEqual([1, 2]);
    });

    it('should return error for missing required input', async () => {
        const inputs = new Map<string, InputValue>([
            ['optionalNumber', { inputName: 'optionalNumber', value: 1, valueType: PluginParameterType.NUMBER, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Missing required input: requiredString');
        expect(result.validationType).toBe('MissingRequiredInput');
        expect(mockBrainPost).toHaveBeenCalledTimes(1); // First attempt fails, tries Brain
    });

    it('should return error for empty required input', async () => {
        const inputs = new Map<string, InputValue>([
            ['requiredString', { inputName: 'requiredString', value: '', valueType: PluginParameterType.STRING, args: {} }],
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Empty value for required input: requiredString');
        expect(result.validationType).toBe('EmptyRequiredInput');
        expect(mockBrainPost).toHaveBeenCalledTimes(1); // First attempt fails, tries Brain
    });

    it('should parse JSON string for OBJECT type input', async () => {
        const inputs = new Map<string, InputValue>([
            ['requiredString', { inputName: 'requiredString', value: 'abc', valueType: PluginParameterType.STRING, args: {} }],
            ['objectInput', { inputName: 'objectInput', value: '{"key":"value"}', valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(true);
        expect(result.inputs?.get('objectInput')?.value).toEqual({ key: 'value' });
    });

    it('should return error for invalid JSON string for OBJECT type', async () => {
        const inputs = new Map<string, InputValue>([
            ['requiredString', { inputName: 'requiredString', value: 'abc', valueType: PluginParameterType.STRING, args: {} }],
            ['objectInput', { inputName: 'objectInput', value: 'invalid json', valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid JSON for input "objectInput"');
        expect(result.validationType).toBe('InvalidJSONFormat');
        expect(mockBrainPost).toHaveBeenCalledTimes(1); // First attempt fails, tries Brain
    });

    it('should use Brain to transform inputs on first validation failure', async () => {
        // Simulate initial failure (missing requiredString)
        const initialInputs = new Map<string, InputValue>([
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        // Simulate Brain returning valid inputs
        mockBrainPost.mockResolvedValueOnce({
            data: { result: JSON.stringify({
                requiredString: 'transformed_string',
                objectInput: { a: 1 },
                optionalNumber: 0 // Brain might include defaults
            }) }
        });

        const result = await validateAndStandardizeInputs(mockPlugin, initialInputs);

        expect(result.success).toBe(true);
        expect(result.inputs?.get('requiredString')?.value).toBe('transformed_string');
        expect(mockBrainPost).toHaveBeenCalledTimes(1);
    });

    it('should retry Brain transformation if first Brain attempt fails', async () => {
        // Simulate initial failure
        const initialInputs = new Map<string, InputValue>([
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        // First Brain attempt fails (e.g., invalid JSON from Brain)
        mockBrainPost.mockResolvedValueOnce({ data: { result: 'invalid json from brain' } });

        // Second Brain attempt succeeds
        mockBrainPost.mockResolvedValueOnce({
            data: { result: JSON.stringify({
                requiredString: 'transformed_string_2',
                objectInput: { a: 1 },
            }) }
        });

        const result = await validateAndStandardizeInputs(mockPlugin, initialInputs);

        expect(result.success).toBe(true);
        expect(result.inputs?.get('requiredString')?.value).toBe('transformed_string_2');
        expect(mockBrainPost).toHaveBeenCalledTimes(2);
    });

    it('should fail after all attempts if Brain transformation consistently fails', async () => {
        // Simulate initial failure
        const initialInputs = new Map<string, InputValue>([
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        // Brain consistently returns invalid JSON
        mockBrainPost.mockResolvedValue({ data: { result: 'invalid json from brain' } });

        const result = await validateAndStandardizeInputs(mockPlugin, initialInputs);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Validation failed after multiple attempts');
        expect(mockBrainPost).toHaveBeenCalledTimes(3); // 1 initial validation + 2 Brain retries
    });

    it('should include pre-execution check warnings in inputs', async () => {
        mockPerformPreExecutionChecks.mockReturnValueOnce({ isValid: false, issues: ['Issue 1', 'Issue 2'] });

        const inputs = new Map<string, InputValue>([
            ['requiredString', { inputName: 'requiredString', value: 'hello', valueType: PluginParameterType.STRING, args: {} }],
            ['objectInput', { inputName: 'objectInput', value: { a: 1 }, valueType: PluginParameterType.OBJECT, args: {} }],
        ]);

        const result = await validateAndStandardizeInputs(mockPlugin, inputs);

        expect(result.success).toBe(true); // Warnings don't fail validation
        expect(result.inputs?.get('__validation_warnings')?.value).toEqual(['Issue 1', 'Issue 2']);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Pre-execution check warnings'), expect.any(String));
    });

    it('should handle invalid plugin inputDefinitions', async () => {
        const invalidPlugin: PluginDefinition = {
            ...mockPlugin,
            inputDefinitions: null as any, // Simulate invalid inputDefinitions
        };
        const inputs = new Map<string, InputValue>();

        const result = await validateAndStandardizeInputs(invalidPlugin, inputs);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Plugin TEST_VERB has invalid inputDefinitions');
        expect(result.validationType).toBe('InvalidPluginDefinition');
    });
});
