import { validateAndStandardizeInputs } from '../src/utils/validator';
import { InputValue, PluginDefinition, PluginParameterType } from '@cktmcs/shared';

describe('Enhanced Validation Logic', () => {
    const mockPlugin: PluginDefinition = {
        id: 'test-plugin',
        verb: 'TEST_PLUGIN',
        description: 'Test plugin for validation',
        inputDefinitions: [
            { name: 'requiredField', description: '', required: true, type: PluginParameterType.STRING },
            { name: 'optionalField', description: '', required: false, type: PluginParameterType.NUMBER },
            { name: 'jsonField', description: '', required: true, type: PluginParameterType.OBJECT }
        ],
        outputDefinitions: [],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: {} }
    };

    const mockNovelVerbPlugin: PluginDefinition = {
        id: 'dynamic-test',
        verb: 'DYNAMIC_TEST_VERB',
        description: 'Novel verb plugin for validation',
        inputDefinitions: [
            { name: 'dynamicInput', description: '', required: true, type: PluginParameterType.STRING }
        ],
        outputDefinitions: [],
        language: 'javascript',
        entryPoint: { main: 'index.js', files: {} }
    };

    describe('Field Name Preservation', () => {
        it('should preserve exact field names without normalization', async () => {
            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: 'test', valueType: PluginParameterType.STRING, args: {} }],
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: '{"key": "value"}', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(true);
            expect(result.inputs).toBeDefined();
            expect(result.inputs?.get('requiredField')).toBeDefined();
            expect(result.inputs?.get('optionalField')).toBeDefined();
            expect(result.inputs?.get('jsonField')).toBeDefined();
        });

        it('should handle camelCase vs snake_case field names', async () => {
            const inputs = new Map<string, InputValue>([
                ['required_field', { inputName: 'required_field', value: 'test', valueType: PluginParameterType.STRING, args: {} }],
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: '{"key": "value"}', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(true);
            expect(result.inputs?.get('requiredField')).toBeDefined();
            // Should map required_field to requiredField
        });
    });

    describe('Enhanced Error Messages', () => {
        it('should provide detailed error messages for missing required fields', async () => {
            const inputs = new Map<string, InputValue>([
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required input field');
            expect(result.error).toContain('requiredField');
            expect(result.error).toContain('TEST_PLUGIN');
            expect(result.error).toContain('Available fields');
        });

        it('should provide detailed error messages for empty required fields', async () => {
            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: '', valueType: PluginParameterType.STRING, args: {} }],
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: '{"key": "value"}', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Empty value for required input field');
            expect(result.error).toContain('requiredField');
            expect(result.error).toContain('TEST_PLUGIN');
        });

        it('should provide detailed error messages for invalid JSON', async () => {
            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: 'test', valueType: PluginParameterType.STRING, args: {} }],
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: 'invalid json', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid JSON format');
            expect(result.error).toContain('jsonField');
            expect(result.error).toContain('Please provide valid JSON');
        });

        it('should provide detailed error messages for type mismatches', async () => {
            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: 'test', valueType: PluginParameterType.STRING, args: {} }],
                ['optionalField', { inputName: 'optionalField', value: 'not a number', valueType: PluginParameterType.NUMBER, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: '{"key": "value"}', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Type mismatch');
            expect(result.error).toContain('optionalField');
            expect(result.error).toContain('Expected: number');
        });
    });

    describe('Novel Verb Handling', () => {
        it('should handle novel verbs appropriately', async () => {
            const inputs = new Map<string, InputValue>([
                ['someField', { inputName: 'someField', value: 'test', valueType: PluginParameterType.STRING, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockNovelVerbPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required input field');
            expect(result.error).toContain('dynamicInput');
            expect(result.error).toContain('DYNAMIC_TEST_VERB');
            expect(result.error).toContain('Novel verbs may require explicit field mapping');
        });

        it('should work with novel verbs when correct fields are provided', async () => {
            const inputs = new Map<string, InputValue>([
                ['dynamicInput', { inputName: 'dynamicInput', value: 'test', valueType: PluginParameterType.STRING, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockNovelVerbPlugin, inputs);
            
            expect(result.success).toBe(true);
            expect(result.inputs?.get('dynamicInput')).toBeDefined();
        });
    });

    describe('Required Field Validation', () => {
        it('should validate required fields based on plugin definitions', async () => {
            const inputs = new Map<string, InputValue>([
                ['optionalField', { inputName: 'optionalField', value: 42, valueType: PluginParameterType.NUMBER, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('requiredField');
            expect(result.error).toContain('jsonField');
        });

        it('should allow missing optional fields', async () => {
            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: 'test', valueType: PluginParameterType.STRING, args: {} }],
                ['jsonField', { inputName: 'jsonField', value: '{"key": "value"}', valueType: PluginParameterType.OBJECT, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(mockPlugin, inputs);
            
            expect(result.success).toBe(true);
            expect(result.inputs?.get('requiredField')).toBeDefined();
            expect(result.inputs?.get('jsonField')).toBeDefined();
            expect(result.inputs?.get('optionalField')).toBeUndefined();
        });
    });

    describe('Invalid Plugin Definition Handling', () => {
        it('should handle invalid inputDefinitions gracefully', async () => {
            const invalidPlugin = {
                ...mockPlugin,
                inputDefinitions: 'invalid' as any
            };

            const inputs = new Map<string, InputValue>([
                ['requiredField', { inputName: 'requiredField', value: 'test', valueType: PluginParameterType.STRING, args: {} }]
            ]);

            const result = await validateAndStandardizeInputs(invalidPlugin, inputs);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('has invalid inputDefinitions');
            expect(result.validationType).toBe('InvalidPluginDefinition');
        });
    });
});