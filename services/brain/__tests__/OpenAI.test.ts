import { OpenAIModel } from '../src/models/OpenAI';
import OpenAI from 'openai';

jest.mock('openai');

describe('OpenAIModel', () => {
  let model: OpenAIModel;
  const mockEnv = { OPENAI_API_KEY: 'test-api-key' };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new OpenAIModel(mockEnv);
  });

  test('constructor throws error when API key is not set', () => {
    expect(() => new OpenAIModel({})).toThrow('OPENAI_API_KEY is not set in the environment variables');
  });

  test('generate method calls OpenAI API and returns generated text', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Generated response' } }],
    });
    (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
      completions: { create: mockCreate },
    } as any;

    const messages = ['Hello', 'How are you?'];
    const options = { max_length: 100, temperature: 0.5 };

    const result = await model.generate(messages, options);

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'How are you?' },
      ],
      temperature: 0.5,
      max_tokens: 100,
    });
    expect(result).toBe('Generated response');
  });

  test('generate method uses default options when not provided', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Default response' } }],
    });
    (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
      completions: { create: mockCreate },
    } as any;

    const messages = ['Test message'];

    await model.generate(messages, {});

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        max_tokens: 2000,
      })
    );
  });

  test('generate method throws error when API call fails', async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error('API Error'));
    (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
      completions: { create: mockCreate },
    } as any;

    const messages = ['Test message'];

    await expect(model.generate(messages, {})).rejects.toThrow('Failed to generate response from OpenAI: API Error');
  });

  test('generate method throws error when response has no content', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
    });
    (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
      completions: { create: mockCreate },
    } as any;

    const messages = ['Test message'];

    await expect(model.generate(messages, {})).rejects.toThrow('Failed to generate response from OpenAI: No content in OpenAI response');
  });
});