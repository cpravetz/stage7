import axios from 'axios';
import { HuggingfaceModel } from '../src/models/Huggingface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HuggingfaceModel', () => {
  let model: HuggingfaceModel;
  const mockEnv = { HUGGINGFACE_API_KEY: 'test-api-key' };

  beforeEach(() => {
    model = new HuggingfaceModel(mockEnv);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('constructor sets API key from environment', () => {
    expect((model as any).apiKey).toBe('test-api-key');
  });

  test('generate method calls Huggingface API and returns generated text', async () => {
    const messages = ['Hello', 'How are you?'];
    const options = { max_length: 100, temperature: 0.5 };
    const mockResponse = { data: [{ generated_text: 'Generated response' }] };
    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await model.generate(messages, options);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api-inference.huggingface.co/models/gpt2',
      {
        inputs: 'Hello How are you?',
        parameters: {
          max_length: 100,
          temperature: 0.5,
        },
      },
      {
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toBe('Generated response');
  });

  test('generate method uses default options when not provided', async () => {
    const messages = ['Test message'];
    const mockResponse = { data: [{ generated_text: 'Default response' }] };
    mockedAxios.post.mockResolvedValue(mockResponse);

    await model.generate(messages);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        parameters: {
          max_length: 2000,
          temperature: 0.7,
        },
      }),
      expect.any(Object)
    );
  });

  test('generate method throws error when API call fails', async () => {
    const messages = ['Test message'];
    mockedAxios.post.mockRejectedValue(new Error('API Error'));

    await expect(model.generate(messages)).rejects.toThrow('Failed to generate response from Huggingface');
  });
});