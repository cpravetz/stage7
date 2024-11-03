import axios from 'axios';
import express from 'express';
import { Engineer } from '../src/Engineer';
import { Plugin } from '../src/types/Plugin';

jest.mock('axios');
jest.mock('express');

describe('Engineer', () => {
  let engineer: Engineer;
  let mockExpress: jest.Mocked<typeof express>;
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApp = {
      use: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      listen: jest.fn(),
    };
    mockExpress = express as jest.Mocked<typeof express>;
    (mockExpress as any).mockReturnValue(mockApp);
    (mockExpress.json as jest.Mock).mockReturnValue(() => {});

    engineer = new Engineer();
  });

  it('should initialize with correct properties', () => {
    expect(engineer['brainUrl']).toBe('brain:5070');
    expect(engineer['newPlugins']).toEqual([]);
  });

  it('should set up the server correctly', () => {
    expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function));
    expect(mockApp.post).toHaveBeenCalledWith('/createPlugin', expect.any(Function));
    expect(mockApp.post).toHaveBeenCalledWith('/message', expect.any(Function));
    expect(mockApp.get).toHaveBeenCalledWith('/statistics', expect.any(Function));
    expect(mockApp.listen).toHaveBeenCalledWith('5050', expect.any(Function));
  });

  it('should handle createPlugin request', async () => {
    const mockReq = { body: { verb: 'TEST', context: 'Test context' } };
    const mockRes = { json: jest.fn() };
    const mockPlugin: Plugin = {
      id: 'plugin-TEST',
      verb: 'TEST',
      explanation: 'Test explanation',
      execute: 'function execute() {}',
    };

    jest.spyOn(engineer as any, 'createPlugin').mockResolvedValue(mockPlugin);

    await mockApp.post.mock.calls.find(call => call[0] === '/createPlugin')[1](mockReq, mockRes);

    expect(engineer['createPlugin']).toHaveBeenCalledWith('TEST', 'Test context');
    expect(mockRes.json).toHaveBeenCalledWith(mockPlugin);
  });

  it('should handle message request', async () => {
    const mockReq = { body: { type: 'TEST_MESSAGE' } };
    const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    jest.spyOn(engineer as any, 'handleBaseMessage').mockResolvedValue(undefined);

    await mockApp.post.mock.calls.find(call => call[0] === '/message')[1](mockReq, mockRes);

    expect(engineer['handleBaseMessage']).toHaveBeenCalledWith({ type: 'TEST_MESSAGE' });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message received and processed' });
  });

  it('should handle statistics request', () => {
    const mockReq = {};
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    engineer['newPlugins'] = ['TEST1', 'TEST2'];

    mockApp.get.mock.calls.find(call => call[0] === '/statistics')[1](mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({ newPlugins: ['TEST1', 'TEST2'] });
  });

  it('should create a plugin', async () => {
    const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;
    mockAxiosPost.mockResolvedValueOnce({ data: { result: 'Test explanation' } });
    mockAxiosPost.mockResolvedValueOnce({ data: { result: 'function execute() {}' } });

    const result = await engineer['createPlugin']('TEST', 'Test context');

    expect(result).toEqual({
      id: 'plugin-TEST',
      verb: 'TEST',
      explanation: 'Test explanation',
      execute: 'function execute() {}',
    });
    expect(engineer['newPlugins']).toContain('TEST');
  });

  it('should generate an explanation', async () => {
    const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;
    mockAxiosPost.mockResolvedValue({ data: { result: 'Test explanation' } });

    const result = await engineer['generateExplanation']('TEST', 'Test context');

    expect(result).toBe('Test explanation');
    expect(mockAxiosPost).toHaveBeenCalledWith('http://brain:5070/chat', {
      exchanges: [{ sender: 'user', message: expect.any(String) }],
      optimization: 'accuracy',
    });
  });
});