import axios from 'axios';
import WebSocket from 'ws';
import { PostOffice } from '../src/PostOffice';
import { Message, MessageType } from '@cktmcs/shared';

jest.mock('axios');
jest.mock('ws');

describe('PostOffice', () => {
  let postOffice: PostOffice;

  beforeEach(() => {
    jest.clearAllMocks();
    postOffice = new PostOffice();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('constructor initializes correctly', () => {
    expect(postOffice).toBeDefined();
  });

  test('registerComponent registers a component successfully', async () => {
    const mockReq = {
      body: { name: 'TestComponent', type: 'TestType', url: 'http://test.com' },
      headers: { 'x-registered-by': 'system' }
    };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { guid: 'test-guid', registrationToken: 'test-token' } });

    await postOffice['registerComponent'](mockReq as any, mockRes as any);

    expect(axios.post).toHaveBeenCalledWith('http://securitymanager:5010/component/register', {
      name: 'TestComponent',
      type: 'TestType',
      url: 'http://test.com',
      registeredBy: 'system'
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ guid: 'test-guid', registrationToken: 'test-token' });
  });

  test('requestComponent returns a component by guid', () => {
    const mockReq = { query: { guid: 'test-guid' } };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    postOffice['components'].set('test-guid', { guid: 'test-guid', name: 'TestComponent', type: 'TestType', url: 'http://test.com' });

    postOffice['requestComponent'](mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({
      component: { guid: 'test-guid', name: 'TestComponent', type: 'TestType', url: 'http://test.com' }
    });
  });

  test('sendMessage routes message correctly', async () => {
    const mockMessage: Message = {
      type: MessageType.ABORT,
      sender: 'TestSender',
      recipient: 'TestRecipient',
      content: 'Test content'
    };
    const mockReq = { body: mockMessage };
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    postOffice['components'].set('TestRecipient', { guid: 'TestRecipient', name: 'TestComponent', type: 'TestType', url: 'http://test.com' });
    (axios.post as jest.Mock).mockResolvedValueOnce({});

    await postOffice['sendMessage'](mockReq as any, mockRes as any);

    expect(axios.post).toHaveBeenCalledWith('http://test.com/message', mockMessage);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message sent' });
  });

  test('handleWebSocketMessage processes message correctly', async () => {
    const mockMessage: Message = {
      type: MessageType.ABORT,
      sender: 'TestSender',
      recipient: 'TestRecipient',
      content: 'Test content'
    };

    postOffice['components'].set('TestRecipient', { guid: 'TestRecipient', name: 'TestComponent', type: 'TestType', url: 'http://test.com' });
    (axios.post as jest.Mock).mockResolvedValueOnce({});

    await postOffice['handleWebSocketMessage'](JSON.stringify(mockMessage));

    expect(axios.post).toHaveBeenCalledWith('http://test.com', mockMessage);
  });
});