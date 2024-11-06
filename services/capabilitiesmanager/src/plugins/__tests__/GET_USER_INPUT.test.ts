import axios from 'axios';
import { execute } from '../GET_USER_INPUT/GET_USER_INPUT';
import { PluginInput, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GET_USER_INPUT plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute successfully with valid inputs', async () => {
    const mockInputs = new Map<string, PluginInput>();
    mockInputs.set('question', { inputName: 'question', inputValue: 'Test question?', args: {} });
    mockInputs.set('choices', { inputName: 'choices', inputValue: ['Option 1', 'Option 2'], args: {} });
    mockInputs.set('answerType', { inputName: 'answerType', inputValue: 'multipleChoice', args: {} });

    mockedAxios.post.mockResolvedValueOnce({ data: { result: 'Option 1' } });

    const result = await execute(mockInputs);

    expect(result).toEqual({
      success: true,
      resultType: PluginParameterType.STRING,
      resultDescription: 'User response',
      result: 'Option 1'
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://postoffice:5020/sendUserInputRequest',
      { question: 'Test question?', choices: ['Option 1', 'Option 2'], answerType: 'multipleChoice' }
    );
  });

  it('should throw an error when question is empty', async () => {
    const mockInputs = new Map<string, PluginInput>();
    mockInputs.set('question', { inputName: 'question', inputValue: '', args: {} });

    const result = await execute(mockInputs);

    expect(result).toEqual({
      success: false,
      resultType: PluginParameterType.ERROR,
      resultDescription: 'Error',
      result: null,
      error: 'Question is required for GET_USER_INPUT plugin'
    });
  });

  it('should use default values when optional inputs are not provided', async () => {
    const mockInputs = new Map<string, PluginInput>();
    mockInputs.set('question', { inputName: 'question', inputValue: 'Test question?', args: {} });

    mockedAxios.post.mockResolvedValueOnce({ data: { result: 'User response' } });

    await execute(mockInputs);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://postoffice:5020/sendUserInputRequest',
      { question: 'Test question?', choices: [], answerType: 'text' }
    );
  });

  it('should handle axios errors', async () => {
    const mockInputs = new Map<string, PluginInput>();
    mockInputs.set('question', { inputName: 'question', inputValue: 'Test question?', args: {} });

    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    const result = await execute(mockInputs);

    expect(result).toEqual({
      success: false,
      resultType: PluginParameterType.ERROR,
      resultDescription: 'Error',
      result: null,
      error: 'Failed to get user input'
    });
  });

  it('should use custom POSTOFFICE_URL when provided', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, POSTOFFICE_URL: 'custom-postoffice:8080' };

    const mockInputs = new Map<string, PluginInput>();
    mockInputs.set('question', { inputName: 'question', inputValue: 'Test question?', args: {} });

    mockedAxios.post.mockResolvedValueOnce({ data: { result: 'User response' } });

    await execute(mockInputs);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://custom-postoffice:8080/sendUserInputRequest',
      expect.any(Object)
    );

    process.env = originalEnv;
  });
});