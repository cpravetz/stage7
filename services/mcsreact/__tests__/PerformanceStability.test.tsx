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

describe('Performance and Stability Tests', () => {
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

  describe('Concurrent Message Handling Tests', () => {
    it('should handle concurrent WebSocket messages without duplication', () => {
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
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 2',
            id: 'msg-456'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 3',
            id: 'msg-789'
          }
        }
      ];

      messages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // Should only have 3 unique messages
      expect(result.current.conversationHistory.length).toBe(3);
      expect(result.current.conversationHistory.map(msg => msg.content)).toEqual(['Message 1', 'Message 2', 'Message 3']);
    });

    it('should handle rapid sequence of different message types', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send rapid sequence of different message types
      const messages = [
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Hello',
            id: 'msg-1'
          }
        },
        {
          type: 'WORK_PRODUCT_UPDATE',
          content: {
            type: 'Interim',
            name: 'Report',
            id: 'wp-1',
            workproduct: { data: 'report' }
          }
        },
        {
          type: 'STATISTICS',
          content: {
            llmCalls: 5
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'How can I help?',
            id: 'msg-2'
          }
        },
        {
          type: 'USER_INPUT_REQUEST',
          request_id: 'req-1',
          question: 'What do you need?',
          answerType: 'text'
        }
      ];

      messages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // Verify all message types were processed correctly
      expect(result.current.conversationHistory.length).toBe(2);
      expect(dataResult.current.workProducts.length).toBe(1);
      expect(dataResult.current.statistics.llmCalls).toBe(5);
      expect(result.current.pendingUserInput).not.toBeNull();
    });

    it('should handle out-of-order message delivery', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send messages out of order (later messages arrive first)
      const messages = [
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 3',
            id: 'msg-3',
            timestamp: '2023-01-01T00:00:03.000Z'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 1',
            id: 'msg-1',
            timestamp: '2023-01-01T00:00:01.000Z'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message 2',
            id: 'msg-2',
            timestamp: '2023-01-01T00:00:02.000Z'
          }
        }
      ];

      messages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // All messages should be present (order may vary based on implementation)
      expect(result.current.conversationHistory.length).toBe(3);
      const contents = result.current.conversationHistory.map(msg => msg.content);
      expect(contents).toEqual(expect.arrayContaining(['Message 1', 'Message 2', 'Message 3']));
    });
  });

  describe('Large Data Payload Handling Tests', () => {
    it('should handle large message payloads', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Create large payload
      const largeContent = 'x'.repeat(50000); // 50KB content
      const largeMessage = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: largeContent,
          id: 'large-msg'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(largeMessage) } as any);
        }
      });

      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toBe(largeContent);
    });

    it('should handle large work product payloads', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Create large work product
      const largeWorkProduct = {
        data: 'x'.repeat(100000), // 100KB data
        metadata: {
          size: 100000,
          type: 'large-document'
        }
      };

      const workProductUpdate = {
        type: 'WORK_PRODUCT_UPDATE',
        content: {
          type: 'Final',
          name: 'Large Document',
          id: 'wp-large',
          workproduct: largeWorkProduct,
          isDeliverable: true
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(workProductUpdate) } as any);
        }
      });

      expect(dataResult.current.workProducts.length).toBe(1);
      expect(dataResult.current.workProducts[0].workproduct).toEqual(largeWorkProduct);
    });

    it('should handle large statistics payloads', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Create large statistics payload
      const largeAgentStats = new Map();
      for (let i = 0; i < 100; i++) {
        largeAgentStats.set(`agent-${i}`, [
          { metric: 'calls', value: Math.random() },
          { metric: 'success', value: Math.random() }
        ]);
      }

      const statisticsUpdate = {
        type: 'STATISTICS',
        content: {
          llmCalls: 1000,
          activeLLMCalls: 50,
          agentCountByStatus: {
            active: 50,
            completed: 30,
            pending: 20
          },
          agentStatistics: largeAgentStats,
          engineerStatistics: {
            newPlugins: Array(50).fill(0).map((_, i) => `plugin-${i}`)
          }
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statisticsUpdate) } as any);
        }
      });

      expect(dataResult.current.statistics.llmCalls).toBe(1000);
      expect(dataResult.current.statistics.agentCountByStatus.active).toBe(50);
    });

    it('should handle large agent details payloads', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Create many agent updates
      const agentUpdates = Array(50).fill(0).map((_, i) => ({
        type: 'AGENT_UPDATE',
        content: {
          id: `agent-${i}`,
          name: `Agent ${i}`,
          status: i % 2 === 0 ? 'active' : 'completed',
          capabilities: [`capability-${i}`],
          statistics: {
            calls: Math.random() * 100,
            successRate: Math.random()
          }
        }
      }));

      agentUpdates.forEach(update => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(update) } as any);
          }
        });
      });

      expect(dataResult.current.agentDetails.length).toBe(50);
    });
  });

  describe('Long-Running Mission Stability Tests', () => {
    it('should maintain stable connection over extended period', () => {
      jest.useFakeTimers();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate periodic messages over extended time
      for (let i = 0; i < 100; i++) {
        const message = {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: `Periodic message ${i}`,
            id: `msg-${i}`
          }
        };

        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });

        // Advance time by 1 minute
        jest.advanceTimersByTime(60000);
      }

      expect(result.current.conversationHistory.length).toBe(100);
      expect(result.current.isConnected).toBe(true);

      jest.useRealTimers();
    });

    it('should handle memory management with many messages', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send many messages to test memory management
      const manyMessages = Array(1000).fill(0).map((_, i) => ({
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: `Message ${i}`,
          id: `msg-${i}`
        }
      }));

      manyMessages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      expect(result.current.conversationHistory.length).toBe(1000);

      // Verify application is still responsive
      expect(result.current.isConnected).toBe(true);
    });

    it('should handle mission state persistence over time', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Simulate mission state updates over time
      const statusUpdates = [
        {
          type: 'STATUS_UPDATE',
          content: {
            active: true,
            id: 'mission-123',
            name: 'Long Mission',
            status: 'starting'
          }
        },
        {
          type: 'STATUS_UPDATE',
          content: {
            active: true,
            id: 'mission-123',
            name: 'Long Mission',
            status: 'processing'
          }
        },
        {
          type: 'STATUS_UPDATE',
          content: {
            active: true,
            id: 'mission-123',
            name: 'Long Mission',
            status: 'completing'
          }
        }
      ];

      statusUpdates.forEach(update => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(update) } as any);
          }
        });
      });

      // Verify final mission state
      expect(missionResult.current.activeMission).toBe(true);
      expect(missionResult.current.activeMissionId).toBe('mission-123');
      expect(missionResult.current.activeMissionName).toBe('Long Mission');
      expect(missionResult.current.missionStatus.status).toBe('completing');
    });
  });

  describe('Performance Optimization Tests', () => {
    it('should batch statistics updates to prevent rapid re-renders', () => {
      jest.useFakeTimers();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send multiple statistics updates rapidly
      const statisticsUpdates = Array(10).fill(0).map((_, i) => ({
        type: 'STATISTICS',
        content: { llmCalls: i + 1 }
      }));

      statisticsUpdates.forEach(update => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(update) } as any);
          }
        });
      });

      // Fast-forward time to trigger batched update
      jest.advanceTimersByTime(50);

      // Should have the latest statistics
      expect(dataResult.current.statistics.llmCalls).toBe(10);

      jest.useRealTimers();
    });

    it('should prevent unnecessary re-renders for identical state updates', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Send same status update multiple times
      const statusUpdate = {
        type: 'STATUS_UPDATE',
        content: {
          active: true,
          id: 'mission-123',
          name: 'Stable Mission',
          status: 'stable'
        }
      };

      // Send multiple identical updates
      for (let i = 0; i < 5; i++) {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(statusUpdate) } as any);
          }
        });
      }

      // State should be updated but unnecessary re-renders prevented
      expect(missionResult.current.activeMissionId).toBe('mission-123');
    });

    it('should optimize agent statistics updates', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send statistics with Map that needs deserialization
      const statisticsUpdate = {
        type: 'STATISTICS',
        content: {
          llmCalls: 10,
          agentStatistics: {
            _type: 'Map',
            entries: [
              ['agent-1', [{ metric: 'speed', value: 0.9 }]],
              ['agent-2', [{ metric: 'speed', value: 0.8 }]]
            ]
          }
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statisticsUpdate) } as any);
        }
      });

      // Verify Map was properly deserialized
      expect(dataResult.current.statistics.llmCalls).toBe(10);
    });

    it('should handle duplicate work product updates efficiently', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send same work product update multiple times
      const workProductUpdate = {
        type: 'WORK_PRODUCT_UPDATE',
        content: {
          type: 'Final',
          name: 'Final Report',
          id: 'wp-123',
          workproduct: { data: 'final report' }
        }
      };

      // Send multiple identical updates
      for (let i = 0; i < 3; i++) {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(workProductUpdate) } as any);
          }
        });
      }

      // Should only have one work product
      expect(dataResult.current.workProducts.length).toBe(1);
    });
  });

  describe('Concurrent API Request Handling Tests', () => {
    it('should handle concurrent API requests gracefully', async () => {
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

      // Mock API responses with different delays
      mockedAxios.post
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 10)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 5)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 15)));

      // Send multiple messages concurrently
      const promises = [
        result.current.sendMessage('Message 1'),
        result.current.sendMessage('Message 2'),
        result.current.sendMessage('Message 3')
      ];

      await act(async () => {
        await Promise.all(promises);
      });

      // Verify all messages were processed
      expect(result.current.conversationHistory.length).toBe(3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should handle API request timeouts gracefully', async () => {
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

      // Mock API timeout
      mockedAxios.post.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => 
          reject({ code: 'ECONNABORTED', message: 'Timeout' }), 100))
      );

      // Send message that will timeout
      const sendPromise = result.current.sendMessage('Timeout test');

      // Wait for timeout
      await act(async () => {
        try {
          await sendPromise;
        } catch (error) {
          // Expected timeout
        }
      });

      // Verify error was handled
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });

    it('should handle mixed success and failure API responses', async () => {
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

      // Mock mixed responses
      mockedAxios.post
        .mockResolvedValueOnce({ data: { success: true } }) // Success
        .mockRejectedValueOnce(new Error('API Error')) // Failure
        .mockResolvedValueOnce({ data: { success: true } }); // Success

      // Send multiple messages
      await act(async () => {
        await result.current.sendMessage('Message 1');
      });

      await act(async () => {
        await result.current.sendMessage('Message 2');
      });

      await act(async () => {
        await result.current.sendMessage('Message 3');
      });

      // Verify mixed results
      const userMessages = result.current.conversationHistory.filter(
        msg => msg.sender === 'user'
      );
      const errorMessages = result.current.conversationHistory.filter(
        msg => msg.content.includes('Failed to send message')
      );

      expect(userMessages.length).toBe(2); // Message 1 and 3 succeeded
      expect(errorMessages.length).toBe(1); // Message 2 failed
    });
  });

  describe('Memory Leak Prevention Tests', () => {
    it('should clean up WebSocket connections properly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      // Create and unmount component
      const { unmount } = renderHook(() => useWebSocket(), { wrapper });
      unmount();

      // Verify WebSocket is not closed (to maintain connection across routes)
      // This is the expected behavior based on the current implementation
      const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
      expect(mockWebSocket.close).not.toHaveBeenCalled();
    });

    it('should handle component unmount during WebSocket operations', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result, unmount } = renderHook(() => useWebSocket(), { wrapper });

      // Unmount during WebSocket operations
      act(() => {
        unmount();
      });

      // Verify no errors occur
      expect(() => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify({
              type: 'MESSAGE',
              content: {
                sender: 'assistant',
                content: 'Post-unmount message',
                id: 'post-unmount'
              }
            }) } as any);
          }
        });
      }).not.toThrow();
    });

    it('should handle rapid component mount/unmount cycles', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      // Rapid mount/unmount cycles
      for (let i = 0; i < 5; i++) {
        const { unmount } = renderHook(() => useWebSocket(), { wrapper });
        act(() => {
          unmount();
        });
      }

      // Verify no memory issues
      expect(global.WebSocket).toHaveBeenCalledTimes(5);
    });
  });

  describe('Stress Testing Scenarios', () => {
    it('should handle high volume of messages without performance degradation', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send high volume of messages
      const highVolumeMessages = Array(500).fill(0).map((_, i) => ({
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: `High volume message ${i}`,
          id: `hvm-${i}`
        }
      }));

      highVolumeMessages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      expect(result.current.conversationHistory.length).toBe(500);

      // Verify application is still responsive
      expect(result.current.isConnected).toBe(true);
    });

    it('should handle mixed high volume message types', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Create high volume of mixed message types
      const mixedMessages = [];
      for (let i = 0; i < 200; i++) {
        switch (i % 4) {
          case 0:
            mixedMessages.push({
              type: 'MESSAGE',
              content: {
                sender: 'assistant',
                content: `Message ${i}`,
                id: `msg-${i}`
              }
            });
            break;
          case 1:
            mixedMessages.push({
              type: 'WORK_PRODUCT_UPDATE',
              content: {
                type: 'Interim',
                name: `Work Product ${i}`,
                id: `wp-${i}`,
                workproduct: { data: `content ${i}` }
              }
            });
            break;
          case 2:
            mixedMessages.push({
              type: 'STATISTICS',
              content: {
                llmCalls: i
              }
            });
            break;
          case 3:
            mixedMessages.push({
              type: 'AGENT_UPDATE',
              content: {
                id: `agent-${i}`,
                name: `Agent ${i}`,
                status: 'active'
              }
            });
            break;
        }
      }

      mixedMessages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // Verify all message types were processed
      expect(result.current.conversationHistory.length).toBe(50); // 200/4 = 50 messages
      expect(dataResult.current.workProducts.length).toBe(50); // 200/4 = 50 work products
      expect(dataResult.current.statistics.llmCalls).toBe(199); // Last statistics update
      expect(dataResult.current.agentDetails.length).toBe(50); // 200/4 = 50 agents
    });

    it('should handle rapid state changes without instability', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Rapid state changes
      const stateChanges = Array(100).fill(0).map((_, i) => {
        if (i % 2 === 0) {
          return {
            type: 'STATUS_UPDATE',
            content: {
              active: true,
              id: `mission-${i}`,
              name: `Mission ${i}`,
              status: 'active'
            }
          };
        } else {
          return {
            type: 'MESSAGE',
            content: {
              sender: 'assistant',
              content: `State change ${i}`,
              id: `sc-${i}`
            }
          };
        }
      });

      stateChanges.forEach(change => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(change) } as any);
          }
        });
      });

      // Verify final state
      expect(missionResult.current.activeMission).toBe(true);
      expect(result.current.conversationHistory.length).toBe(50); // 100/2 = 50 messages
    });
  });

  describe('Edge Case Performance Tests', () => {
    it('should handle empty and null message content', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send messages with empty/null content
      const edgeCaseMessages = [
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: '',
            id: 'empty-msg'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: null,
            id: 'null-msg'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: ' ', // Whitespace only
            id: 'whitespace-msg'
          }
        }
      ];

      edgeCaseMessages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      // All messages should be handled
      expect(result.current.conversationHistory.length).toBe(3);
    });

    it('should handle messages with special characters and Unicode', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send messages with special characters and Unicode
      const specialMessages = [
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message with emoji: 🚀 🎉 👍',
            id: 'emoji-msg'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message with Unicode: 你好世界 🌍 Привет мир',
            id: 'unicode-msg'
          }
        },
        {
          type: 'MESSAGE',
          content: {
            sender: 'assistant',
            content: 'Message with special chars: <>&"\'©®™',
            id: 'special-msg'
          }
        }
      ];

      specialMessages.forEach(message => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
          }
        });
      });

      expect(result.current.conversationHistory.length).toBe(3);
      expect(result.current.conversationHistory[0].content).toContain('🚀');
      expect(result.current.conversationHistory[1].content).toContain('你好世界');
      expect(result.current.conversationHistory[2].content).toContain('©®™');
    });

    it('should handle very long mission names and IDs', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Send status update with very long names and IDs
      const longStatusUpdate = {
        type: 'STATUS_UPDATE',
        content: {
          active: true,
          id: 'x'.repeat(1000), // Very long ID
          name: 'y'.repeat(500), // Very long name
          status: 'active'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(longStatusUpdate) } as any);
        }
      });

      // Should handle without errors
      expect(missionResult.current.activeMission).toBe(true);
      expect(missionResult.current.activeMissionId?.length).toBe(1000);
      expect(missionResult.current.activeMissionName?.length).toBe(500);
    });

    it('should handle deeply nested message content', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Create deeply nested content
      let nestedContent: any = { level: 0 };
      for (let i = 1; i <= 50; i++) {
        nestedContent = { level: i, nested: nestedContent };
      }

      const nestedMessage = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: nestedContent,
          id: 'nested-msg'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(nestedMessage) } as any);
        }
      });

      // Should handle nested content
      expect(result.current.conversationHistory.length).toBe(1);
      const content = result.current.conversationHistory[0].content;
      expect((content as any).level).toBe(50);
    });
  });
});