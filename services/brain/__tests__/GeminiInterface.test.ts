
import { GeminiInterface } from '../src/interfaces/GeminiInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Mock dependencies
jest.mock('@google/generative-ai');
jest.mock('fs');

describe('GeminiInterface', () => {
  let geminiInterface: GeminiInterface;
  let mockService: BaseService;
  let mockGenerativeModel: any;

  beforeEach(() => {
    geminiInterface = new GeminiInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['gemini']);

    mockGenerativeModel = {
      generateContent: jest.fn(),
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn(),
      }),
    };
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockGenerativeModel),
    }));
  });

  describe('chat', () => {
    it('should make a chat request to the Gemini API and return the response', async () => {
      mockGenerativeModel.generateContent.mockResolvedValue({
        response: { text: () => 'Hello from Gemini!' },
      });

      const response = await geminiInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(mockGenerativeModel.generateContent).toHaveBeenCalled();
      expect(response).toBe('Hello from Gemini!');
    });
  });

  describe('convertTextToImage', () => {
    it('should generate an image from text prompt', async () => {
      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: 'base64image', mimeType: 'image/png' } }],
              },
            },
          ],
        },
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const response = await geminiInterface.convertTextToImage(mockService, { prompt: 'test prompt' });

      expect(mockGenerativeModel.generateContent).toHaveBeenCalled();
      expect(response).toContain('gemini-image-');
    });
  });

  describe('convertImageToText', () => {
    it('should analyze an image and return text', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('dummy image data'));
      mockGenerativeModel.generateContent.mockResolvedValue({
        response: { text: () => 'Description of image' },
      });

      const response = await geminiInterface.convertImageToText(mockService, { image: 'test.png', prompt: 'describe' });

      expect(mockGenerativeModel.generateContent).toHaveBeenCalled();
      expect(response).toBe('Description of image');
    });
  });
});
