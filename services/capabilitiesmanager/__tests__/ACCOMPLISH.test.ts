import axios from 'axios';
import AccomplishPlugin from '../src/plugins/ACCOMPLISH';
import { PluginInput } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AccomplishPlugin', () => {
  let plugin: AccomplishPlugin;

  beforeEach(() => {
    plugin = new AccomplishPlugin();
    process.env.BRAIN_URL = 'test-brain:5070';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with the correct properties', () => {
    expect(plugin.id).toBe('plugin-ACCOMPLISH');
    expect(plugin.verb).toBe('ACCOMPLISH');
    expect(plugin.description).toBe('Accomplishes a given goal or creates a plan to achieve it');
    expect(plugin.explanation).toBe('This plugin takes a goal statement and either returns the result of accomplishing the goal or a plan of tasks to achieve it');
    expect(plugin.requiredInputs).toEqual(['goal']);
  });

  it('should throw an error if no goal is provided', async () => {
    const input: PluginInput = { inputValue: '', args: {}, dependencyOutputs: {} };
    await expect(plugin.execute(input)).resolves.toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Goal is required for ACCOMPLISH plugin'
    });
  });

  it('should return a direct answer when Brain responds with DIRECT_ANSWER', async () => {
    const input: PluginInput = { inputValue: 'Calculate 2 + 2', args: {} , dependencyOutputs: {} };
    mockedAxios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ type: 'DIRECT_ANSWER', answer: '4' }) } });

    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: true,
      resultType: 'string',
      result: '4'
    });
  });

  it('should return a plan when Brain responds with PLAN', async () => {
    const input: PluginInput = { inputValue: 'Make a sandwich', args: {}, dependencyOutputs: {} };
    const mockPlan = [
      {
        number: 1,
        verb: 'GET_INGREDIENTS',
        description: 'Gather bread, cheese, and ham',
        args: { ingredients: ['bread', 'cheese', 'ham'] },
        dependencies: [0],
        outputs: { ingredients: 'List of gathered ingredients' }
      },
      {
        number: 2,
        verb: 'ASSEMBLE_SANDWICH',
        description: 'Put ingredients together',
        args: { order: ['bread', 'cheese', 'ham', 'bread'] },
        dependencies: [1],
        outputs: { sandwich: 'Assembled sandwich' }
      }
    ];
    mockedAxios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ type: 'PLAN', plan: mockPlan }) } });

    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: true,
      resultType: 'plan',
      result: [
        {
          verb: 'GET_INGREDIENTS',
          args: {
            ingredients: ['bread', 'cheese', 'ham'],
            description: 'Gather bread, cheese, and ham',
            expectedOutputs: { ingredients: 'List of gathered ingredients' }
          },
          dependencies: [0]
        },
        {
          verb: 'ASSEMBLE_SANDWICH',
          args: {
            order: ['bread', 'cheese', 'ham', 'bread'],
            description: 'Put ingredients together',
            expectedOutputs: { sandwich: 'Assembled sandwich' }
          },
          dependencies: [1]
        }
      ]
    });
  });

  it('should handle errors when querying Brain', async () => {
    const input: PluginInput = { inputValue: 'Invalid goal', args: {}, dependencyOutputs: {} };
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Failed to query Brain'
    });
  });

  it('should handle invalid JSON responses from Brain', async () => {
    const input: PluginInput = { inputValue: 'Parse error goal', args: {}, dependencyOutputs: {} };
    mockedAxios.post.mockResolvedValueOnce({ data: { response: 'Invalid JSON' } });

    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Failed to parse Brain response: Unexpected token I in JSON at position 0'
    });
  });

  it('should handle invalid response format from Brain', async () => {
    const input: PluginInput = { inputValue: 'Invalid format goal', args: {}, dependencyOutputs: {} };
    mockedAxios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ type: 'INVALID_TYPE' }) } });

    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Invalid response format from Brain'
    });
  });
});