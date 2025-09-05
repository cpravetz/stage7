import { InputResolver } from '../src/utils/InputResolver';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('InputResolver', () => {
    let resolver: InputResolver;
    const MOCK_BRAIN_URL = 'http://mock-brain:5070';

    const mockContext = {
        pluginName: 'TestPlugin',
        actionVerb: 'TEST_ACTION',
        missingInputs: ['input1', 'input2'],
        availableInputs: { existingInput: 'existingValue' },
        stepContext: {
            goal: 'Test Goal',
            previousSteps: [
                { actionVerb: 'PREV_ACTION', description: 'Previous step', outputs: { output1: 'value1', url: 'http://example.com' } },
            ],
            currentStepDescription: 'Current step',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.BRAIN_URL = MOCK_BRAIN_URL;
        resolver = new InputResolver();
    });

    describe('constructor', () => {
        it('should set brainUrl from process.env', () => {
            expect((resolver as any).brainUrl).toBe(MOCK_BRAIN_URL);
        });

        it('should use default brainUrl if process.env.BRAIN_URL is not set', () => {
            delete process.env.BRAIN_URL;
            resolver = new InputResolver();
            expect((resolver as any).brainUrl).toBe('http://brain:5070');
        });
    });

    describe('resolveMissingInputs', () => {
        it('should resolve all missing inputs', async () => {
            const resolveInputSpy = jest.spyOn(resolver as any, 'resolveInput')
                .mockResolvedValueOnce({ inputName: 'input1', value: 'resolved1', valueType: 'string', source: 'brain' })
                .mockResolvedValueOnce({ inputName: 'input2', value: 'resolved2', valueType: 'string', source: 'default' });

            const result = await resolver.resolveMissingInputs(mockContext);

            expect(resolveInputSpy).toHaveBeenCalledTimes(2);
            expect(resolveInputSpy).toHaveBeenCalledWith('input1', mockContext);
            expect(resolveInputSpy).toHaveBeenCalledWith('input2', mockContext);
            expect(result).toEqual([
                { inputName: 'input1', value: 'resolved1', valueType: 'string', source: 'brain' },
                { inputName: 'input2', value: 'resolved2', valueType: 'string', source: 'default' },
            ]);
        });

        it('should handle errors for individual input resolutions', async () => {
            const resolveInputSpy = jest.spyOn(resolver as any, 'resolveInput')
                .mockRejectedValueOnce(new Error('Failed to resolve'))
                .mockResolvedValueOnce({ inputName: 'input2', value: 'resolved2', valueType: 'string', source: 'default' });
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await resolver.resolveMissingInputs(mockContext);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve input input1'), expect.any(Error));
            expect(result).toEqual([
                { inputName: 'input2', value: 'resolved2', valueType: 'string', source: 'default' },
            ]);
            consoleWarnSpy.mockRestore();
        });
    });

    describe('resolveInput', () => {
        let findInputFromPreviousStepsSpy: jest.SpyInstance;
        let generateInputWithBrainSpy: jest.SpyInstance;
        let getDefaultValueSpy: jest.SpyInstance;

        beforeEach(() => {
            findInputFromPreviousStepsSpy = jest.spyOn(resolver as any, 'findInputFromPreviousSteps').mockReturnValue(null);
            generateInputWithBrainSpy = jest.spyOn(resolver as any, 'generateInputWithBrain').mockResolvedValue(null);
            getDefaultValueSpy = jest.spyOn(resolver as any, 'getDefaultValue').mockReturnValue(null);
        });

        it('should prioritize previous steps', async () => {
            findInputFromPreviousStepsSpy.mockReturnValueOnce({ inputName: 'input1', value: 'prev_step_value', valueType: 'string', source: 'previous_step' });

            const result = await (resolver as any).resolveInput('input1', mockContext);
            expect(result?.value).toBe('prev_step_value');
            expect(findInputFromPreviousStepsSpy).toHaveBeenCalledTimes(1);
            expect(generateInputWithBrainSpy).not.toHaveBeenCalled();
            expect(getDefaultValueSpy).not.toHaveBeenCalled();
        });

        it('should try Brain if previous steps fail', async () => {
            generateInputWithBrainSpy.mockResolvedValueOnce({ inputName: 'input1', value: 'brain_value', valueType: 'string', source: 'brain' });

            const result = await (resolver as any).resolveInput('input1', mockContext);
            expect(result?.value).toBe('brain_value');
            expect(findInputFromPreviousStepsSpy).toHaveBeenCalledTimes(1);
            expect(generateInputWithBrainSpy).toHaveBeenCalledTimes(1);
            expect(getDefaultValueSpy).not.toHaveBeenCalled();
        });

        it('should try default value if Brain fails', async () => {
            getDefaultValueSpy.mockReturnValueOnce('default_value');

            const result = await (resolver as any).resolveInput('input1', mockContext);
            expect(result?.value).toBe('default_value');
            expect(findInputFromPreviousStepsSpy).toHaveBeenCalledTimes(1);
            expect(generateInputWithBrainSpy).toHaveBeenCalledTimes(1);
            expect(getDefaultValueSpy).toHaveBeenCalledTimes(1);
        });

        it('should return null if no strategy works', async () => {
            const result = await (resolver as any).resolveInput('input1', mockContext);
            expect(result).toBeNull();
        });
    });

    describe('findInputFromPreviousSteps', () => {
        it('should find direct match in previous step outputs', () => {
            const context = { ...mockContext, stepContext: { ...mockContext.stepContext, previousSteps: [{ outputs: { targetInput: 'foundValue' } }] } };
            const result = (resolver as any).findInputFromPreviousSteps('targetInput', context);
            expect(result).toEqual({
                inputName: 'targetInput',
                outputName: 'targetInput',
                valueType: 'string',
                source: 'previous_step'
            });
        });

        it('should find semantic match in previous step outputs', () => {
            const context = { ...mockContext, stepContext: { ...mockContext.stepContext, previousSteps: [{ outputs: { website: 'http://semantic.com' } }] } };
            const result = (resolver as any).findInputFromPreviousSteps('url', context);
            expect(result).toEqual({
                inputName: 'url',
                outputName: 'website',
                valueType: 'string',
                source: 'previous_step'
            });
        });

        it('should return null if no match found', () => {
            const result = (resolver as any).findInputFromPreviousSteps('nonExistentInput', mockContext);
            expect(result).toBeNull();
        });
    });

    describe('findSemanticMatch', () => {
        it('should find direct semantic mapping', () => {
            const outputs = { link: 'value' };
            expect((resolver as any).findSemanticMatch('url', outputs)).toBe('link');
        });

        it('should find fuzzy match', () => {
            const outputs = { file_name: 'value' };
            expect((resolver as any).findSemanticMatch('filename', outputs)).toBe('file_name');
        });

        it('should return null if no semantic match', () => {
            const outputs = { other: 'value' };
            expect((resolver as any).findSemanticMatch('nonexistent', outputs)).toBeNull();
        });
    });

    describe('calculateSimilarity', () => {
        it('should calculate similarity correctly', () => {
            expect((resolver as any).calculateSimilarity('kitten', 'sitting')).toBeCloseTo(0.571);
            expect((resolver as any).calculateSimilarity('flaw', 'lawn')).toBeCloseTo(0.5);
            expect((resolver as any).calculateSimilarity('hello', 'hello')).toBe(1);
            expect((resolver as any).calculateSimilarity('a', 'b')).toBe(0);
            expect((resolver as any).calculateSimilarity('', '')).toBe(1);
        });
    });

    describe('generateInputWithBrain', () => {
        let buildBrainPromptSpy: jest.SpyInstance;
        let validateGeneratedInputSpy: jest.SpyInstance;
        let inferValueTypeSpy: jest.SpyInstance;

        beforeEach(() => {
            buildBrainPromptSpy = jest.spyOn(resolver as any, 'buildBrainPrompt');
            validateGeneratedInputSpy = jest.spyOn(resolver as any, 'validateGeneratedInput').mockReturnValue(true);
            inferValueTypeSpy = jest.spyOn(resolver as any, 'inferValueType').mockReturnValue('string');
        });

        it('should generate input with Brain successfully', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { response: 'generated_value' } });

            const result = await (resolver as any).generateInputWithBrain('input1', mockContext);
            expect(result).toEqual({
                inputName: 'input1',
                value: 'generated_value',
                valueType: 'string',
                source: 'brain'
            });
            expect(buildBrainPromptSpy).toHaveBeenCalledWith('input1', mockContext);
            expect(validateGeneratedInputSpy).toHaveBeenCalledWith('input1', 'generated_value', mockContext.actionVerb);
            expect(inferValueTypeSpy).toHaveBeenCalledWith('input1', 'generated_value');
        });

        it('should return null if Brain response is empty', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { response: '' } });
            const result = await (resolver as any).generateInputWithBrain('input1', mockContext);
            expect(result).toBeNull();
        });

        it('should return null if generated input is invalid', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { response: 'generated_value' } });
            validateGeneratedInputSpy.mockReturnValueOnce(false);

            const result = await (resolver as any).generateInputWithBrain('input1', mockContext);
            expect(result).toBeNull();
        });

        it('should log warning if Brain call fails', async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error('Brain error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await (resolver as any).generateInputWithBrain('input1', mockContext);
            expect(result).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Brain failed to generate input'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('buildBrainPrompt', () => {
        it('should build a correct prompt for the Brain', () => {
            const prompt = (resolver as any).buildBrainPrompt('missingInput', mockContext);
            expect(prompt).toContain('Plugin: TestPlugin (TEST_ACTION)');
            expect(prompt).toContain('Missing Input: missingInput');
            expect(prompt).toContain('Goal: Test Goal');
            expect(prompt).toContain('Current Step: Current step');
            expect(prompt).toContain('PREVIOUS STEPS:\nStep 1: PREV_ACTION - Previous step');
            expect(prompt).toContain('Return ONLY the value, no explanation:');
        });
    });

    describe('validateGeneratedInput', () => {
        it('should return true for valid input', () => {
            expect((resolver as any).validateGeneratedInput('name', 'valid_name', 'ACTION')).toBe(true);
        });

        it('should return false for short input', () => {
            expect((resolver as any).validateGeneratedInput('name', 'a', 'ACTION')).toBe(false);
        });

        it('should return false for placeholder text', () => {
            expect((resolver as any).validateGeneratedInput('name', '[TODO]', 'ACTION')).toBe(false);
            expect((resolver as any).validateGeneratedInput('name', 'example', 'ACTION')).toBe(false);
        });

        it('should validate URL format', () => {
            expect((resolver as any).validateGeneratedInput('url', 'http://valid.com', 'ACTION')).toBe(true);
            expect((resolver as any).validateGeneratedInput('url', 'invalid-url', 'ACTION')).toBe(false);
        });

        it('should validate email format', () => {
            expect((resolver as any).validateGeneratedInput('email', 'test@example.com', 'ACTION')).toBe(true);
            expect((resolver as any).validateGeneratedInput('email', 'invalid-email', 'ACTION')).toBe(false);
        });
    });

    describe('inferValueType', () => {
        it('should infer number type', () => {
            expect((resolver as any).inferValueType('count', '123')).toBe('number');
            expect((resolver as any).inferValueType('limit', '456')).toBe('number');
        });

        it('should infer boolean type', () => {
            expect((resolver as any).inferValueType('flag', 'true')).toBe('boolean');
            expect((resolver as any).inferValueType('flag', 'false')).toBe('boolean');
        });

        it('should infer array type', () => {
            expect((resolver as any).inferValueType('list', '[1,2,3]')).toBe('array');
        });

        it('should infer object type', () => {
            expect((resolver as any).inferValueType('data', '{"key":"value"}')).toBe('object');
        });

        it('should default to string type', () => {
            expect((resolver as any).inferValueType('name', 'some_text')).toBe('string');
        });
    });

    describe('getDefaultValue', () => {
        it('should return default value for SCRAPE action', () => {
            expect((resolver as any).getDefaultValue('selector', 'SCRAPE')).toBe('body');
            expect((resolver as any).getDefaultValue('limit', 'SCRAPE')).toBe('10');
        });

        it('should return default value for SEARCH action', () => {
            expect((resolver as any).getDefaultValue('limit', 'SEARCH')).toBe('10');
        });

        it('should return default value for TEXT_ANALYSIS action', () => {
            expect((resolver as any).getDefaultValue('analysisType', 'TEXT_ANALYSIS')).toBe('summary');
        });

        it('should return null for non-existent default', () => {
            expect((resolver as any).getDefaultValue('nonexistent', 'ACTION')).toBeNull();
        });
    });
});
