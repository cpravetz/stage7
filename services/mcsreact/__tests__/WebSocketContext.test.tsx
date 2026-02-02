import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { WebSocketProvider, useWebSocket, useMission, useData } from '../src/context/WebSocketContext';
import axios from 'axios';
import { SecurityClient } from '../src/SecurityClient';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/SecurityClient');
jest.mock('uuid', () => ({ v4: () => 'test-client-id' }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedSecurityClient = SecurityClient as jest.Mocked<typeof SecurityClient>;

describe('WebSocketContext - WebSocket Communication Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    
    // Mock SecurityClient
    mockedSecurityClient.getInstance.mockReturnValue({
      getAccessToken: () => 'test-token'
    } as any);
    
    // Mock WebSocket
    global.WebSocket = jest.fn() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('WebSocket Connection Tests', () => {
    it('should establish WebSocket connection with authentication', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('token=test-token')
      );
    });

    it('should handle CONNECTION_CONFIRMED message', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Simulate WebSocket message
      const connectionConfirmedMessage = {
        type: 'CONNECTION_CONFIRMED',
        clientId: 'test-client-id'
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(connectionConfirmedMessage) } as any);
        }
      });
    });

    it('should handle WebSocket reconnection on failure', () => {
      jest.useFakeTimers();
      
      const mockWebSocket = {
        readyState: WebSocket.CLOSED,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: jest.fn(),
        onclose: jest.fn(),
        close: jest.fn()
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Simulate connection close with error code
      act(() => {
        if (mockWebSocket.onclose) {
          mockWebSocket.onclose({ code: 1006, reason: 'Connection failed' } as any);
        }
      });

      // Fast-forward time to trigger reconnect
      jest.advanceTimersByTime(5000);

      expect(global.WebSocket).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });
  });

  describe('Message Handling Tests', () => {
    it('should handle MESSAGE type WebSocket messages', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message
      const messageData = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: 'Hello from assistant',
          timestamp: new Date().toISOString(),
          persistent: true,
          id: 'msg-123'
        }
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(messageData) } as any);
        }
      });

      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toBe('Hello from assistant');
    });

    it('should handle USER_INPUT_REQUEST messages', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate WebSocket message
      const inputRequest = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-123',
        question: 'What is your preference?',
        answerType: 'text',
        choices: ['Option 1', 'Option 2']
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(inputRequest) } as any);
        }
      });

      expect(result.current.pendingUserInput).toEqual({
        request_id: 'req-123',
        question: 'What is your preference?',
        answerType: 'text',
        choices: ['Option 1', 'Option 2']
      });
    });

    it('should handle WORK_PRODUCT_UPDATE messages', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message
      const workProductUpdate = {
        type: 'WORK_PRODUCT_UPDATE',
        content: {
          type: 'Final',
          name: 'Test Report',
          id: 'wp-123',
          workproduct: { data: 'test' },
          isDeliverable: true
        }
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(workProductUpdate) } as any);
        }
      });

      expect(dataResult.current.workProducts.length).toBe(1);
      expect(dataResult.current.workProducts[0].name).toBe('Test Report');
    });

    it('should handle duplicate message detection', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send first message
      const message1 = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: 'First message',
          id: 'msg-123'
        }
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(message1) } as any);
        }
      });

      // Send duplicate message
      const message2 = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: 'First message',
          id: 'msg-123'
        }
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(message2) } as any);
        }
      });

      // Should only have one message in history
      expect(result.current.conversationHistory.length).toBe(1);
    });
  });

  describe('API Endpoint Execution Tests', () => {
    it('should create mission via API when sending first message', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Mock API response
      mockedAxios.post.mockResolvedValue({ data: {} });

      // Send first message (should trigger mission creation)
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/createMission',
        expect.objectContaining({
          goal: 'Test message',
          clientId: 'test-client-id'
        }),
        expect.any(Object)
      );

      expect(missionResult.current.activeMission).toBe(true);
    });

    it('should send message to active mission via API', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({ data: {} });

      // Send message to active mission
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          type: 'userMessage',
          content: expect.objectContaining({
            missionId: 'mission-123',
            message: 'Test message'
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle USER_INPUT_RESPONSE', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission and pending user input
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
        result.current.pendingUserInput = {
          request_id: 'req-123',
          question: 'Test question',
          answerType: 'text'
        };
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({ data: {} });

      // Send response to user input
      await act(async () => {
        await result.current.sendMessage('Test answer');
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          type: 'USER_INPUT_RESPONSE',
          content: expect.objectContaining({
            missionId: 'mission-123',
            response: 'Test answer',
            requestId: 'req-123'
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle mission control actions', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({ data: {} });

      // Send pause action
      await act(async () => {
        await result.current.handleControlAction('pause');
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'pause',
            action: 'pause',
            missionId: 'mission-123'
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle load mission action', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API response
      mockedAxios.post.mockResolvedValue({ data: {} });

      // Load mission
      await act(async () => {
        await result.current.handleLoadMission('mission-123');
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/loadMission',
        expect.objectContaining({
          missionId: 'mission-123',
          clientId: 'test-client-id'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle authentication errors', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock SecurityClient to return no token
      mockedSecurityClient.getInstance.mockReturnValue({
        getAccessToken: () => null
      } as any);

      // Try to send message without authentication
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Authentication failed. Please log in again.',
          sender: 'system'
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API error
      mockedAxios.post.mockRejectedValue(new Error('API failure'));

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle WebSocket errors', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: jest.fn(),
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Simulate WebSocket error
      act(() => {
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror(new Event('error'));
        }
      });

      // Connection should be marked as disconnected
      const { result } = renderHook(() => useWebSocket(), { wrapper });
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Performance and Stability Tests', () => {
    it('should handle concurrent messages without duplication', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send multiple messages with same ID (simulating concurrent delivery)
      const messages = [
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 1',
            id: 'msg-123'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 1',
            id: 'msg-123'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 2',
            id: 'msg-456'
          }
        }
      ];

      messages.forEach(message => {
        act(() => {
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // Should only have 2 unique messages
      expect(result.current.conversationHistory.length).toBe(2);
    });

    it('should handle large payload messages', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Create large payload
      const largeContent = 'x'.repeat(10000); // 10KB content
      const largeMessage = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: largeContent,
          id: 'large-msg'
        }
      };

      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(largeMessage) } as any);
        }
      });

      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toBe(largeContent);
    });

    it('should maintain stable connection over time', () => {
      jest.useFakeTimers();
      
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };
      
      (global.WebSocket as jest.Mock).mockImplementation(() => mockWebSocket);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate periodic messages over time
      for (let i = 0; i < 10; i++) {
        const message = {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: `Periodic message ${i}`,
            id: `msg-${i}`
          }
        };

        act(() => {
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });

        // Advance time
        jest.advanceTimersByTime(1000);
      }

      expect(result.current.conversationHistory.length).toBe(10);
      expect(result.current.isConnected).toBe(true);
      
      jest.useRealTimers();
    });
  });
});