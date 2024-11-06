import { PostOffice } from '../src/PostOffice';
import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';
import jwt from 'jsonwebtoken';

jest.mock('express');
jest.mock('ws');
jest.mock('axios');
jest.mock('jsonwebtoken');

describe('PostOffice', () => {
  let postOffice: PostOffice;
  let mockExpress: jest.Mocked<typeof express>;
  let mockApp: any;
  let mockServer: any;
  let mockWss: jest.Mocked<WebSocket.Server>;

  beforeEach(() => {
    mockApp = {
      use: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      options: jest.fn(),
    };
    mockServer = {
      listen: jest.fn(),
    };
    mockWss = {
      on: jest.fn(),
    } as any;

    mockExpress = express as jest.Mocked<typeof express>;
    (mockExpress as jest.MockedFunction<typeof express>).mockReturnValue(mockApp);

    jest.mocked(WebSocket.Server).mockImplementation(() => mockWss);

    postOffice = new PostOffice();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('constructor initializes correctly', () => {
    expect(mockApp.use).toHaveBeenCalledTimes(3);
    expect(mockApp.get).toHaveBeenCalledWith('/', expect.any(Function));
    expect(mockApp.post).toHaveBeenCalledWith('/message', expect.any(Function));
    expect(mockApp.post).toHaveBeenCalledWith('/sendMessage', expect.any(Function));
    expect(mockServer.listen).toHaveBeenCalled();
  });

  test('registerComponent adds component correctly', async () => {
    const mockReq = {
      body: { id: 'testId', type: 'testType', url: 'testUrl' },
    } as express.Request;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    await (postOffice as any).registerComponent(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ message: 'Component registered successfully' });
  });

  test('requestComponent returns component correctly', () => {
    const mockReq = {
      query: { id: 'testId' },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    (postOffice as any).components.set('testId', { id: 'testId', type: 'testType', url: 'testUrl' });

    (postOffice as any).requestComponent(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ component: { id: 'testId', type: 'testType', url: 'testUrl' } });
  });

  test('handleIncomingMessage routes message correctly', async () => {
    const mockReq = {
      body: { recipient: 'testRecipient', content: {} },
      headers: { authorization: 'testToken' },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    (postOffice as any).discoverService = jest.fn().mockResolvedValue('testUrl');
    (postOffice as any).sendToComponent = jest.fn().mockResolvedValue(undefined);

    await (postOffice as any).handleIncomingMessage(mockReq, mockRes);

    expect((postOffice as any).sendToComponent).toHaveBeenCalledWith('testUrl/message', expect.any(Object), 'testToken');
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message sent' });
  });

  test('getSavedMissions returns missions correctly', async () => {
    const mockReq = {
      headers: { authorization: 'Bearer testToken' },
    } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    (postOffice as any).getComponentUrl = jest.fn().mockReturnValue('testLibrarianUrl');
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'testUserId' });
    (axios.get as jest.Mock).mockResolvedValue({ data: 'testMissions' });

    await (postOffice as any).getSavedMissions(mockReq, mockRes);

    expect(axios.get).toHaveBeenCalledWith('http://testLibrarianUrl/getSavedMissions', {
      params: { userId: 'testUserId' }
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith('testMissions');
  });
});