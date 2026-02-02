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

describe('Error Handling and Recovery Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    
    // Mock SecurityClient
    mockedSecurityClient.getInstance.mockReturnValue({
      getAccessToken: () => 'test-token'
    } as any);
    
    // Mock WebSocket
    const mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null
    };
    
    global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication Error Handling Tests', () => {
    it('should handle missing authentication token gracefully', async () => {
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

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Authentication failed. Please log in again.',
          sender: 'system',
          persistent: false
        })
      );

      // Verify no API call was made
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle expired authentication token', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API to return 401 Unauthorized
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Token expired' }
        }
      });

      // Try to send message with expired token
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle invalid authentication token', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API to return 403 Forbidden
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 403,
          data: { error: 'Invalid token' }
        }
      });

      // Try to send message with invalid token
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('WebSocket Connection Recovery Tests', () => {
    it('should handle WebSocket connection drop and reconnect', () => {
      jest.useFakeTimers();

      // Create mock WebSocket that will close
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: jest.fn(),
        onclose: jest.fn()
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Verify initial connection
      expect(result.current.isConnected).toBe(true);

      // Simulate connection drop with abnormal closure
      act(() => {
        if (mockWebSocket.onclose) {
          mockWebSocket.onclose({ code: 1006, reason: 'Connection dropped' } as any);
        }
      });

      // Verify connection state
      expect(result.current.isConnected).toBe(false);

      // Fast-forward time to trigger reconnect
      jest.advanceTimersByTime(5000);

      // Verify reconnection attempt
      expect(global.WebSocket).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle WebSocket connection errors', () => {
      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: jest.fn(),
        onclose: null
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate WebSocket error
      act(() => {
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror(new Event('error'));
        }
      });

      // Verify connection state
      expect(result.current.isConnected).toBe(false);
    });

    it('should handle WebSocket reconnection with exponential backoff', () => {
      jest.useFakeTimers();

      // Create mock WebSocket that will fail multiple times
      let callCount = 0;
      const mockWebSocketFactory = () => {
        callCount++;
        return {
          readyState: WebSocket.CLOSED,
          send: jest.fn(),
          close: jest.fn(),
          onopen: null,
          onmessage: null,
          onerror: jest.fn(),
          onclose: function(this: any, event: any) {
            if (callCount < 3 && this.onclose) {
              // Simulate repeated failures
              setTimeout(() => {
                this.onclose({ code: 1006, reason: 'Connection failed' });
              }, 10);
            }
          }
        };
      };

      global.WebSocket = jest.fn().mockImplementation(mockWebSocketFactory) as any;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Trigger initial connection failure
      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onclose) {
          mockWebSocket.onclose({ code: 1006, reason: 'Connection failed' });
        }
      });

      // Fast-forward time for multiple reconnection attempts
      jest.advanceTimersByTime(5000); // First attempt
      jest.advanceTimersByTime(7500); // Second attempt (1.5x delay)

      // Verify multiple reconnection attempts with increasing delays
      expect(global.WebSocket).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    it('should restore mission state after WebSocket reconnection', () => {
      // Mock localStorage to have mission ID
      localStorage.setItem('missionId', 'mission-123');

      const mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null
      };

      global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Verify RECONNECT_MISSION message was sent
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'RECONNECT_MISSION',
          content: {
            missionId: 'mission-123'
          }
        })
      );
    });
  });

  describe('API Error Handling Tests', () => {
    it('should handle API network errors gracefully', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock network error
      mockedAxios.post.mockRejectedValue(new Error('Network Error'));

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system',
          persistent: false
        })
      );
    });

    it('should handle API server errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock server error (500)
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal Server Error' }
        }
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle API validation errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock validation error (400)
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Invalid request parameters' }
        }
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle API rate limiting errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock rate limiting error (429)
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 429,
          data: { error: 'Too Many Requests' }
        }
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle API timeout errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock timeout error
      mockedAxios.post.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'Timeout error'
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error message is shown to user
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('Mission State Recovery Tests', () => {
    it('should handle mission creation failure gracefully', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Mock mission creation failure
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Failed to create mission' }
        }
      });

      // Try to send first message (should trigger mission creation)
      await act(async () => {
        await result.current.sendMessage('Create mission');
      });

      // Verify mission state is not activated
      expect(missionResult.current.activeMission).toBe(false);

      // Verify error message is shown
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle mission loading failure gracefully', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock mission loading failure
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Mission not found' }
        }
      });

      // Try to load mission
      await act(async () => {
        await result.current.handleLoadMission('nonexistent-mission');
      });

      // Verify error message is shown
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to load mission. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle mission control action failures gracefully', async () => {
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

      // Mock control action failure
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Failed to pause mission' }
        }
      });

      // Try to send pause action
      await act(async () => {
        await result.current.handleControlAction('pause');
      });

      // Verify error message is shown
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send pause request to MissionControl. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('User Input Error Handling Tests', () => {
    it('should handle USER_INPUT_RESPONSE failure gracefully', async () => {
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

      // Mock USER_INPUT_RESPONSE failure
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Failed to process user input' }
        }
      });

      // Try to send response
      await act(async () => {
        await result.current.sendMessage('Test answer');
      });

      // Verify error message is shown
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );

      // Verify pending input is still cleared
      expect(result.current.pendingUserInput).toBeNull();
    });

    it('should handle answer to question failure gracefully', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission and current question
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
        result.current.currentQuestion = {
          guid: 'question-123',
          sender: 'assistant',
          content: 'Test question',
          asker: 'assistant-1'
        };
      });

      // Mock answer failure
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Failed to process answer' }
        }
      });

      // Try to send answer
      await act(async () => {
        await result.current.sendMessage('Test answer');
      });

      // Verify error message is shown
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );

      // Verify current question is still cleared
      expect(result.current.currentQuestion).toBeNull();
    });
  });

  describe('WebSocket Message Error Handling Tests', () => {
    it('should handle malformed WebSocket messages gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Simulate invalid JSON message
      const invalidJson = '{ "type": "MESSAGE", "content": { "sender": "assistant", ';

      // Should not throw error
      expect(() => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: invalidJson } as any);
          }
        });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Error processing WebSocket message:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle WebSocket messages with missing type field', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate message without type
      const messageWithoutType = {
        content: {
          data: 'test'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(messageWithoutType) } as any);
        }
      });

      // Should not cause errors
      expect(result.current.conversationHistory.length).toBe(0);
    });

    it('should handle WebSocket messages with unknown type', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      renderHook(() => useWebSocket(), { wrapper });

      // Simulate unknown message type
      const unknownMessage = {
        type: 'UNKNOWN_TYPE',
        content: {
          data: 'unknown'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(unknownMessage) } as any);
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith('Unknown message type:', 'UNKNOWN_TYPE');

      consoleSpy.mockRestore();
    });
  });

  describe('Recovery and Resilience Tests', () => {
    it('should maintain application state during errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set some initial state
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
        result.current.conversationHistory = [
          { content: 'Initial message', sender: 'user', persistent: true }
        ];
      });

      // Mock API error
      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      // Try to send message (should fail)
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify application state is maintained
      expect(missionResult.current.activeMission).toBe(true);
      expect(missionResult.current.activeMissionId).toBe('mission-123');
      expect(result.current.conversationHistory.length).toBe(2); // Initial + error message
    });

    it('should allow retry after error', async () => {
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

      // Mock first API call to fail, second to succeed
      mockedAxios.post
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({ data: { success: true } });

      // First attempt (should fail)
      await act(async () => {
        await result.current.sendMessage('First attempt');
      });

      // Verify error message
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );

      // Second attempt (should succeed)
      await act(async () => {
        await result.current.sendMessage('Second attempt');
      });

      // Verify successful message
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Second attempt',
          sender: 'user'
        })
      );
    });

    it('should handle concurrent errors gracefully', async () => {
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

      // Mock all API calls to fail
      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      // Send multiple messages concurrently
      const promises = [
        result.current.sendMessage('Message 1'),
        result.current.sendMessage('Message 2'),
        result.current.sendMessage('Message 3')
      ];

      await act(async () => {
        await Promise.all(promises);
      });

      // Verify all errors are handled
      const errorMessages = result.current.conversationHistory.filter(
        msg => msg.content.includes('Failed to send message')
      );

      expect(errorMessages.length).toBe(3);

      // Verify application is still responsive
      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Edge Case Error Handling Tests', () => {
    it('should handle empty message content', async () => {
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

      // Mock API to succeed
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      // Send empty message
      await act(async () => {
        await result.current.sendMessage('');
      });

      // Verify empty message is handled
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: '',
          sender: 'user'
        })
      );
    });

    it('should handle very long message content', async () => {
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

      // Mock API to succeed
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      // Send very long message
      const longMessage = 'x'.repeat(10000); // 10KB message
      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      // Verify long message is handled
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: longMessage,
          sender: 'user'
        })
      );
    });

    it('should handle special characters in message content', async () => {
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

      // Mock API to succeed
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      // Send message with special characters
      const specialMessage = 'Test message with special chars: <>&"\'©®™';
      await act(async () => {
        await result.current.sendMessage(specialMessage);
      });

      // Verify special characters are handled
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: specialMessage,
          sender: 'user'
        })
      );
    });
  });
});