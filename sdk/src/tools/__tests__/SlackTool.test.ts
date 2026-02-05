import { SlackTool } from '../SlackTool';
import { ICoreEngineClient } from '../../types';

// Mock Core Engine Client
const mockCoreEngineClient: ICoreEngineClient = {
  startMission: jest.fn(),
  sendMessageToMission: jest.fn(),
  submitHumanInputToMission: jest.fn(),
  getMissionHistory: jest.fn(),
  onMissionEvent: jest.fn(),
  requestHumanInput: jest.fn(),
};

describe('SlackTool', () => {
  let slackTool: SlackTool;

  beforeEach(() => {
    slackTool = new SlackTool(mockCoreEngineClient);
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const result = await slackTool.sendMessage('C123456', 'Hello world!');
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.channelId).toBe('C123456');
      expect(result.text).toBe('Hello world!');
      expect(result.timestamp).toBeDefined();
      expect(result.user).toBe('mockuser');
    });

    it('should send a message in a thread', async () => {
      const result = await slackTool.sendMessage('C123456', 'Reply message', '1234567890.123456');
      
      expect(result).toBeDefined();
      expect(result.threadTs).toBe('1234567890.123456');
    });

    it('should throw error for invalid channelId', async () => {
      await expect(slackTool.sendMessage('', 'Hello world!')).rejects.toThrow('Invalid channelId');
    });

    it('should throw error for invalid text', async () => {
      await expect(slackTool.sendMessage('C123456', '')).rejects.toThrow('Invalid text');
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages successfully', async () => {
      const result = await slackTool.getMessages('C123456');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      result.forEach(message => {
        expect(message.channelId).toBe('C123456');
        expect(message.text).toContain('Mock message');
        expect(message.timestamp).toBeDefined();
      });
    });

    it('should retrieve limited number of messages', async () => {
      const limit = 2;
      const result = await slackTool.getMessages('C123456', limit);
      
      expect(result.length).toBe(limit);
    });

    it('should throw error for invalid channelId', async () => {
      await expect(slackTool.getMessages('')).rejects.toThrow('Invalid channelId');
    });

    it('should throw error for invalid limit', async () => {
      await expect(slackTool.getMessages('C123456', 0)).rejects.toThrow('Invalid limit');
      await expect(slackTool.getMessages('C123456', 1001)).rejects.toThrow('Invalid limit');
    });
  });

  describe('uploadFile', () => {
    it('should upload a file successfully', async () => {
      const result = await slackTool.uploadFile('C123456', 'test.txt', 'Hello file content', 'text/plain');
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('test.txt');
      expect(result.filetype).toBe('text/plain');
      expect(result.url).toBeDefined();
      expect(result.permalink).toBeDefined();
      expect(result.size).toBe('Hello file content'.length);
    });

    it('should upload a file without fileType', async () => {
      const result = await slackTool.uploadFile('C123456', 'test.txt', 'Hello file content');
      
      expect(result.filetype).toBe('text/plain');
    });

    it('should throw error for invalid channelId', async () => {
      await expect(slackTool.uploadFile('', 'test.txt', 'content')).rejects.toThrow('Invalid channelId');
    });

    it('should throw error for invalid fileName', async () => {
      await expect(slackTool.uploadFile('C123456', '', 'content')).rejects.toThrow('Invalid fileName');
    });

    it('should throw error for invalid fileContent', async () => {
      await expect(slackTool.uploadFile('C123456', 'test.txt', '')).rejects.toThrow('Invalid fileContent');
    });
  });

  describe('createChannel', () => {
    it('should create a public channel successfully', async () => {
      const result = await slackTool.createChannel('general', false, 'Main discussion', 'Company topics');
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('general');
      expect(result.isPrivate).toBe(false);
      expect(result.purpose).toBe('Main discussion');
      expect(result.topic).toBe('Company topics');
    });

    it('should create a private channel successfully', async () => {
      const result = await slackTool.createChannel('private-team', true);
      
      expect(result).toBeDefined();
      expect(result.isPrivate).toBe(true);
      expect(result.purpose).toBeDefined();
      expect(result.topic).toBeDefined();
    });

    it('should throw error for invalid name', async () => {
      await expect(slackTool.createChannel('', false)).rejects.toThrow('Invalid name');
    });

    it('should throw error for invalid isPrivate', async () => {
      // This would be a type error in TypeScript, but testing the runtime validation
      await expect(slackTool.createChannel('test', 'invalid' as any)).rejects.toThrow('Invalid isPrivate');
    });
  });
});