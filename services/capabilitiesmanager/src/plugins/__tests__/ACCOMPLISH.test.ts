import axios from 'axios';
import { execute } from '../ACCOMPLISH/ACCOMPLISH';
import { PluginInput, PluginParameterType, MapSerializer } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ACCOMPLISH plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      expect(result[0].success).toBe(true);
      expect(result[0].resultType).toBe(PluginParameterType.PLAN);
      expect(result[0].resultDescription).toContain('Test goal');
      expect(Array.isArray(result[0].result)).toBe(true);
      expect(result[0].result[0].verb).toBe('TEST_ACTION');
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

      expect(result[0].success).toBe(true);
      expect(result[0].resultType).toBe(PluginParameterType.STRING);
      expect(result[0].resultDescription).toBe('LLM Response');
      expect(result[0].result).toBe('This is a direct answer');
    });

    it('should handle errors when Brain query fails', async () => {
      const inputs = new Map<string, PluginInput>();
      inputs.set('goal', { inputName: 'goal', inputValue: 'Test goal', args: {} });

      mockedAxios.post.mockRejectedValueOnce(new Error('Brain query failed'));

      const result = await execute(inputs);

      expect(result[0].success).toBe(false);
      expect(result[0].resultType).toBe(PluginParameterType.ERROR);
      expect(result[0].error).toContain('Failed to query Brain');
    });
  });
});