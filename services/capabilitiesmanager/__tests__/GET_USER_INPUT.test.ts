import axios from 'axios';
import { GetUserInputPlugin } from '../src/plugins/GET_USER_INPUT';
import { PluginInput } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GetUserInputPlugin', () => {
  let plugin: GetUserInputPlugin;

  beforeEach(() => {
    plugin = new GetUserInputPlugin();
    process.env.POSTOFFICE_URL = 'test-postoffice:5020';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with correct properties', () => {
    expect(plugin.id).toBe('plugin-GET_USER_INPUT');
    expect(plugin.verb).toBe('GET_USER_INPUT');
    expect(plugin.description).toBe('Requests input from the user');
    expect(plugin.explanation).toBe('This plugin sends a question to the user and returns their response');
  });

  it('should throw an error if question is not provided', async () => {
    const input: PluginInput = { inputValue: '', args: {}, dependencyOutputs: {} };
    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Question is required for GET_USER_INPUT plugin'
    });
  });

  it('should successfully get user input', async () => {
    const mockResponse = { data: { result: 'User response' } };
    mockedAxios.post.mockResolvedValue(mockResponse);

    const input: PluginInput = {
      inputValue: '',
      args: {
        question: 'Test question?',
        choices: ['Option 1', 'Option 2'],
        answerType: 'multipleChoice'
      },
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://test-postoffice:5020/sendUserInputRequest',
      {
        question: 'Test question?',
        choices: ['Option 1', 'Option 2'],
        answerType: 'multipleChoice'
      }
    );

    expect(result).toEqual({
      success: true,
      resultType: 'string',
      result: 'User response'
    });
  });

  it('should handle errors when sending user input request', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    const input: PluginInput = {
      inputValue: '',
      args: { question: 'Test question?' },
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Failed to get user input'
    });
  });
});