import axios from 'axios';
import { Engineer } from '../src/Engineer';
import { InputValue, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Engineer', () => {
  let engineer: Engineer;

  beforeEach(() => {
    engineer = new Engineer();
    process.env.BRAIN_URL = 'mock-brain:5070';
    process.env.LIBRARIAN_URL = 'mock-librarian:5040';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPlugin', () => {
    it('should create a plugin successfully', async () => {
      const verb = 'TEST_VERB';
      const context = new Map<string, InputValue>();
      context.set('testInput', { value: 'test', valueType: PluginParameterType.STRING, args: {}, inputName: 'testInput' });

      const mockExplanation = 'Test explanation';
      const mockPluginStructure: Plugin = {
        id: 'plugin-TEST_VERB',
        verb: 'TEST_VERB',
        description: 'Test description',
        inputs: [{ name: 'testInput', type: 'string', description: 'Test input' }],
        outputs: [{ name: 'testOutput', type: 'string', description: 'Test output' }],
        entryPoint: {
          main: 'index.js',
          files: [{ 'index.js': 'console.log("Test plugin")' }]
        },
        language: 'javascript'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: { result: mockExplanation } });
      mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify(mockPluginStructure) } });
      mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success' } });

      const result = await engineer.createPlugin(verb, context);

      expect(result).toEqual(expect.objectContaining({
        id: 'plugin-TEST_VERB',
        verb: 'TEST_VERB',
        description: 'Test description',
        explanation: mockExplanation
      }));
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should throw an error if plugin structure generation fails', async () => {
      const verb = 'FAIL_VERB';
      const context = new Map<string, InputValue>();

      mockedAxios.post.mockResolvedValueOnce({ data: { result: 'Test explanation' } });
      mockedAxios.post.mockRejectedValueOnce(new Error('Failed to generate plugin structure'));

      await expect(engineer.createPlugin(verb, context)).rejects.toThrow('Failed to generate plugin structure');
    });
  });

  describe('handleMessage', () => {
    it('should handle a message successfully', async () => {
      const mockReq = {
        body: { type: 'TEST_MESSAGE', content: 'Test content' }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await engineer['handleMessage'](mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message received and processed' });
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      const mockReq = {};
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      engineer['newPlugins'] = ['TEST_PLUGIN1', 'TEST_PLUGIN2'];

      engineer['getStatistics'](mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ newPlugins: ['TEST_PLUGIN1', 'TEST_PLUGIN2'] });
    });
  });
});