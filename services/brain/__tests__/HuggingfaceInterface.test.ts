
import { HuggingfaceInterface } from '../src/interfaces/HuggingfaceInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import { HfInference } from '@huggingface/inference';
import fs from 'fs';

// Mock dependencies
jest.mock('@huggingface/inference');
jest.mock('fs');

describe('HuggingfaceInterface', () => {
  let hfInterface: HuggingfaceInterface;
  let mockService: BaseService;
  let mockHfInference: jest.Mocked<HfInference>;

  beforeEach(() => {
    hfInterface = new HuggingfaceInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['huggingface']);

    mockHfInference = {
      chatCompletionStream: jest.fn(),
      textGeneration: jest.fn(),
      textToImage: jest.fn(),
      textToSpeech: jest.fn(),
      automaticSpeechRecognition: jest.fn(),
      imageToText: jest.fn(),
    } as any;
    (HfInference as jest.Mock).mockImplementation(() => mockHfInference);
  });

  describe('chat', () => {
    it('should make a chat request to the Huggingface API and return the response', async () => {
      mockHfInference.chatCompletionStream.mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] };
        yield { choices: [{ delta: { content: ' from Huggingface!' } }] };
      });

      const response = await hfInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(mockHfInference.chatCompletionStream).toHaveBeenCalled();
      expect(response).toBe('Hello from Huggingface!');
    });
  });

  describe('convertTextToImage', () => {
    it('should generate an image from text prompt', async () => {
      mockHfInference.textToImage.mockResolvedValue('image-blob' as any);

      const response = await hfInterface.convertTextToImage(mockService, { prompt: 'test prompt' });

      expect(mockHfInference.textToImage).toHaveBeenCalled();
      expect(response).toBe('image-blob');
    });
  });

  describe('convertAudioToText', () => {
    it('should convert audio to text', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('dummy audio data'));
      mockHfInference.automaticSpeechRecognition.mockResolvedValue({ text: 'audio transcription' });

      const response = await hfInterface.convertAudioToText(mockService, { audio: 'test.wav' });

      expect(mockHfInference.automaticSpeechRecognition).toHaveBeenCalled();
      expect(response).toBe('audio transcription');
    });
  });
});
