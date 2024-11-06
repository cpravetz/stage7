import axios from 'axios';
import { execute, generatePrompt } from '../ACCOMPLISH/ACCOMPLISH';
import { PluginInput, PluginParameterType, MapSerializer } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ACCOMPLISH plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePrompt', () => {
    it('should generate a prompt with the given goal', () => {
      const goal = 'Test goal';
      const prompt = generatePrompt(goal);
      expect(prompt).toContain(`Accomplish the following goal: ${goal}`);
    });
  });

  describe('execute', () => {
    it('should return a plan when Brain responds with a plan', async () => {
      const inputs = new Map<string, PluginInput>();
      inputs.set('goal', { inputName: 'goal', inputValue: 'Test goal', args: {} });

      const mockPlan = {
        type: 'PLAN',
        plan: [
          {
            number: 1,
            verb: 'TEST_ACTION',
            description: 'Test description',
            inputs: { input1: 'value1' },
            dependencies: {},
            outputs: { output1: 'Test output' },
          },
        ],
      };

      mockedAxios.post.mockResolvedValueOnce({ data: { response: JSON.stringify(mockPlan) } });

      const result = await execute(inputs);

      expect(result.success).toBe(true);
      expect(result.resultType).toBe(PluginParameterType.PLAN);
      expect(result.resultDescription).toContain('Test goal');
      expect(Array.isArray(result.result)).toBe(true);
      expect(result.result[0].verb).toBe('TEST_ACTION');
    });

    it('should return a direct answer when Brain responds with a direct answer', async () => {
      const inputs = new Map<string, PluginInput>();
      inputs.set('goal', { inputName: 'goal', inputValue: 'Test goal', args: {} });

      const mockDirectAnswer = {
        type: 'DIRECT_ANSWER',
        answer: 'This is a direct answer',
      };

      mockedAxios.post.mockResolvedValueOnce({ data: { response: JSON.stringify(mockDirectAnswer) } });

      const result = await execute(inputs);

      expect(result.success).toBe(true);
      expect(result.resultType).toBe(PluginParameterType.STRING);
      expect(result.resultDescription).toBe('LLM Response');
      expect(result.result).toBe('This is a direct answer');
    });

    it('should handle errors when Brain query fails', async () => {
      const inputs = new Map<string, PluginInput>();
      inputs.set('goal', { inputName: 'goal', inputValue: 'Test goal', args: {} });

      mockedAxios.post.mockRejectedValueOnce(new Error('Brain query failed'));

      const result = await execute(inputs);

      expect(result.success).toBe(false);
      expect(result.resultType).toBe(PluginParameterType.ERROR);
      expect(result.error).toContain('Failed to query Brain');
    });
  });
});