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

describe('Message Handling Validation Tests', () => {
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

  describe('MESSAGE Type Handling Tests', () => {
    it('should handle MESSAGE type WebSocket messages correctly', () => {
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
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(messageData) } as any);
        }
      });

      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toBe('Hello from assistant');
      expect(result.current.conversationHistory[0].sender).toBe('assistant');
      expect(result.current.conversationHistory[0].persistent).toBe(true);
    });

    it('should handle MESSAGE type with different content formats', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Test with object content
      const objectMessage = {
        type: 'MESSAGE',
        content: {
          sender: 'system',
          content: { type: 'status', value: 'processing' },
          id: 'msg-456'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(objectMessage) } as any);
        }
      });

      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toEqual({ type: 'status', value: 'processing' });
    });

    it('should handle duplicate MESSAGE type messages', () => {
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
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
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
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(message2) } as any);
        }
      });

      // Should only have one message in history
      expect(result.current.conversationHistory.length).toBe(1);
    });

    it('should handle MESSAGE type with missing ID', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send message without ID
      const message = {
        type: 'MESSAGE',
        content: {
          sender: 'assistant',
          content: 'Message without ID'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(message) } as any);
        }
      });

      // Should still be added to history
      expect(result.current.conversationHistory.length).toBe(1);
      expect(result.current.conversationHistory[0].content).toBe('Message without ID');
    });

    it('should handle malformed MESSAGE type messages', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send malformed message
      const malformedMessage = {
        type: 'MESSAGE',
        content: null
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(malformedMessage) } as any);
        }
      });

      // Should not add malformed message to history
      expect(result.current.conversationHistory.length).toBe(0);
    });
  });

  describe('USER_INPUT_REQUEST Handling Tests', () => {
    it('should handle USER_INPUT_REQUEST messages correctly', () => {
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
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
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

    it('should queue multiple USER_INPUT_REQUEST messages', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send first input request
      const inputRequest1 = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-123',
        question: 'First question?',
        answerType: 'text'
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(inputRequest1) } as any);
        }
      });

      // Send second input request (should be queued)
      const inputRequest2 = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-456',
        question: 'Second question?',
        answerType: 'text'
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(inputRequest2) } as any);
        }
      });

      // First request should be active, second should be queued
      expect(result.current.pendingUserInput).toEqual({
        request_id: 'req-123',
        question: 'First question?',
        answerType: 'text'
      });
    });

    it('should process queued USER_INPUT_REQUEST messages', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Send first input request
      const inputRequest1 = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-123',
        question: 'First question?',
        answerType: 'text'
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(inputRequest1) } as any);
        }
      });

      // Send second input request (should be queued)
      const inputRequest2 = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-456',
        question: 'Second question?',
        answerType: 'text'
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(inputRequest2) } as any);
        }
      });

      // Clear current input (simulate user response)
      act(() => {
        if (result.current.setPendingUserInput) {
          result.current.setPendingUserInput(null);
        }
      });

      // Second request should now be active
      expect(result.current.pendingUserInput).toEqual({
        request_id: 'req-456',
        question: 'Second question?',
        answerType: 'text'
      });
    });

    it('should handle USER_INPUT_REQUEST with different answer types', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Test with multiple choice
      const multiChoiceRequest = {
        type: 'USER_INPUT_REQUEST',
        request_id: 'req-789',
        question: 'Choose an option:',
        answerType: 'multiple-choice',
        choices: ['Option A', 'Option B', 'Option C']
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(multiChoiceRequest) } as any);
        }
      });

      expect(result.current.pendingUserInput).toEqual({
        request_id: 'req-789',
        question: 'Choose an option:',
        answerType: 'multiple-choice',
        choices: ['Option A', 'Option B', 'Option C']
      });
    });
  });

  describe('WORK_PRODUCT_UPDATE Handling Tests', () => {
    it('should handle WORK_PRODUCT_UPDATE messages correctly', () => {
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
          workproduct: { data: 'test content' },
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
      expect(dataResult.current.workProducts[0]).toEqual({
        type: 'Final',
        name: 'Test Report',
        url: expect.stringContaining('/librarian/retrieve/wp-123'),
        workproduct: { data: 'test content' },
        isDeliverable: true
      });
    });

    it('should handle duplicate WORK_PRODUCT_UPDATE messages', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send first work product update
      const workProduct1 = {
        type: 'WORK_PRODUCT_UPDATE',
        content: {
          type: 'Interim',
          name: 'Draft Report',
          id: 'wp-123',
          workproduct: { data: 'draft content' }
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(workProduct1) } as any);
        }
      });

      // Send updated work product with same name and type
      const workProduct2 = {
        type: 'WORK_PRODUCT_UPDATE',
        content: {
          type: 'Interim',
          name: 'Draft Report',
          id: 'wp-456',
          workproduct: { data: 'updated content' }
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(workProduct2) } as any);
        }
      });

      // Should only have one work product (updated)
      expect(dataResult.current.workProducts.length).toBe(1);
      expect(dataResult.current.workProducts[0].workproduct).toEqual({ data: 'updated content' });
    });

    it('should handle different WORK_PRODUCT_UPDATE types', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send different types of work products
      const workProducts = [
        {
          type: 'WORK_PRODUCT_UPDATE',
          content: {
            type: 'Plan',
            name: 'Project Plan',
            id: 'wp-plan-1',
            workproduct: { steps: ['step1', 'step2'] }
          }
        },
        {
          type: 'WORK_PRODUCT_UPDATE',
          content: {
            type: 'Interim',
            name: 'Progress Report',
            id: 'wp-interim-1',
            workproduct: { progress: 50 }
          }
        },
        {
          type: 'WORK_PRODUCT_UPDATE',
          content: {
            type: 'Final',
            name: 'Final Report',
            id: 'wp-final-1',
            workproduct: { results: 'complete' },
            isDeliverable: true
          }
        }
      ];

      workProducts.forEach(workProduct => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(workProduct) } as any);
          }
        });
      });

      expect(dataResult.current.workProducts.length).toBe(3);
      expect(dataResult.current.workProducts.map(wp => wp.type)).toEqual(['Plan', 'Interim', 'Final']);
    });
  });

  describe('STATISTICS Handling Tests', () => {
    it('should handle STATISTICS messages correctly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message
      const statisticsUpdate = {
        type: 'STATISTICS',
        content: {
          llmCalls: 10,
          activeLLMCalls: 2,
          agentCountByStatus: { active: 3, completed: 2 },
          agentStatistics: new Map([
            ['agent-1', [{ metric: 'speed', value: 0.9 }]]
          ]),
          engineerStatistics: { newPlugins: ['plugin1', 'plugin2'] }
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statisticsUpdate) } as any);
        }
      });

      expect(dataResult.current.statistics.llmCalls).toBe(10);
      expect(dataResult.current.statistics.activeLLMCalls).toBe(2);
      expect(dataResult.current.statistics.agentCountByStatus).toEqual({ active: 3, completed: 2 });
    });

    it('should handle STATISTICS messages with Map serialization', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message with serialized Map
      const statisticsUpdate = {
        type: 'STATISTICS',
        content: {
          llmCalls: 5,
          agentStatistics: {
            _type: 'Map',
            entries: [
              ['agent-1', [{ metric: 'accuracy', value: 0.95 }]]
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

      expect(dataResult.current.statistics.llmCalls).toBe(5);
    });

    it('should batch STATISTICS updates to prevent rapid re-renders', () => {
      jest.useFakeTimers();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Send multiple statistics updates rapidly
      const statisticsUpdates = [
        {
          type: 'STATISTICS',
          content: { llmCalls: 1 }
        },
        {
          type: 'STATISTICS',
          content: { llmCalls: 2 }
        },
        {
          type: 'STATISTICS',
          content: { llmCalls: 3 }
        }
      ];

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

      expect(dataResult.current.statistics.llmCalls).toBe(3);

      jest.useRealTimers();
    });
  });

  describe('STATUS_UPDATE Handling Tests', () => {
    it('should handle STATUS_UPDATE messages correctly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Simulate WebSocket message
      const statusUpdate = {
        type: 'STATUS_UPDATE',
        content: {
          active: true,
          id: 'mission-123',
          name: 'Test Mission',
          status: 'processing'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statusUpdate) } as any);
        }
      });

      expect(missionResult.current.activeMission).toBe(true);
      expect(missionResult.current.activeMissionId).toBe('mission-123');
      expect(missionResult.current.activeMissionName).toBe('Test Mission');
      expect(missionResult.current.missionStatus).toEqual({
        active: true,
        id: 'mission-123',
        name: 'Test Mission',
        status: 'processing'
      });
    });

    it('should handle STATUS_UPDATE with mission persistence', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Simulate WebSocket message
      const statusUpdate = {
        type: 'STATUS_UPDATE',
        content: {
          active: true,
          id: 'mission-456',
          name: 'Persistent Mission',
          status: 'active'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statusUpdate) } as any);
        }
      });

      // Verify mission ID is stored in localStorage
      expect(localStorage.getItem('missionId')).toBe('mission-456');
    });

    it('should batch STATUS_UPDATE to prevent unnecessary re-renders', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Send same status update twice
      const statusUpdate = {
        type: 'STATUS_UPDATE',
        content: {
          active: true,
          id: 'mission-789',
          name: 'Stable Mission',
          status: 'stable'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statusUpdate) } as any);
        }
      });

      // Send same status again
      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(statusUpdate) } as any);
        }
      });

      // Should not cause unnecessary re-renders for identical content
      expect(missionResult.current.activeMissionId).toBe('mission-789');
    });
  });

  describe('AGENT_UPDATE Handling Tests', () => {
    it('should handle AGENT_UPDATE messages correctly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message
      const agentUpdate = {
        type: 'AGENT_UPDATE',
        content: {
          id: 'agent-123',
          name: 'Test Agent',
          status: 'active',
          capabilities: ['task1', 'task2']
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(agentUpdate) } as any);
        }
      });

      expect(dataResult.current.agentDetails.length).toBe(1);
      expect(dataResult.current.agentDetails[0]).toEqual({
        id: 'agent-123',
        name: 'Test Agent',
        status: 'active',
        capabilities: ['task1', 'task2']
      });
    });

    it('should update existing agent details', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Add initial agent
      const agentUpdate1 = {
        type: 'AGENT_UPDATE',
        content: {
          id: 'agent-123',
          name: 'Test Agent',
          status: 'active'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(agentUpdate1) } as any);
        }
      });

      // Update agent status
      const agentUpdate2 = {
        type: 'AGENT_UPDATE',
        content: {
          id: 'agent-123',
          name: 'Test Agent',
          status: 'completed'
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(agentUpdate2) } as any);
        }
      });

      // Should have one agent with updated status
      expect(dataResult.current.agentDetails.length).toBe(1);
      expect(dataResult.current.agentDetails[0].status).toBe('completed');
    });

    it('should handle multiple agent updates', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Add multiple agents
      const agentUpdates = [
        {
          type: 'AGENT_UPDATE',
          content: {
            id: 'agent-1',
            name: 'Agent 1',
            status: 'active'
          }
        },
        {
          type: 'AGENT_UPDATE',
          content: {
            id: 'agent-2',
            name: 'Agent 2',
            status: 'active'
          }
        },
        {
          type: 'AGENT_UPDATE',
          content: {
            id: 'agent-3',
            name: 'Agent 3',
            status: 'pending'
          }
        }
      ];

      agentUpdates.forEach(update => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(update) } as any);
          }
        });
      });

      expect(dataResult.current.agentDetails.length).toBe(3);
    });
  });

  describe('SHARED_FILES_UPDATE Handling Tests', () => {
    it('should handle SHARED_FILES_UPDATE messages correctly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message
      const sharedFilesUpdate = {
        type: 'SHARED_FILES_UPDATE',
        content: {
          files: [
            {
              id: 'file-1',
              originalName: 'document.pdf',
              size: 1024,
              mimeType: 'application/pdf',
              uploadedAt: '2023-01-01',
              uploadedBy: 'user-1',
              isDeliverable: true
            },
            {
              id: 'file-2',
              originalName: 'image.jpg',
              size: 2048,
              mimeType: 'image/jpeg',
              uploadedAt: '2023-01-02',
              uploadedBy: 'user-1',
              isDeliverable: false
            }
          ]
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(sharedFilesUpdate) } as any);
        }
      });

      expect(dataResult.current.sharedFiles.length).toBe(2);
      expect(dataResult.current.sharedFiles[0].originalName).toBe('document.pdf');
      expect(dataResult.current.sharedFiles[1].originalName).toBe('image.jpg');
    });

    it('should filter shared files based on deliverable status', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate WebSocket message with mixed deliverable status
      const sharedFilesUpdate = {
        type: 'SHARED_FILES_UPDATE',
        content: {
          files: [
            {
              id: 'file-1',
              originalName: 'deliverable.pdf',
              isDeliverable: true,
              stepId: 'step-1'
            },
            {
              id: 'file-2',
              originalName: 'non-deliverable.txt',
              isDeliverable: false,
              stepId: 'step-2'
            },
            {
              id: 'file-3',
              originalName: 'no-step-file.pdf',
              isDeliverable: false
            }
          ]
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(sharedFilesUpdate) } as any);
        }
      });

      // Should include deliverable files and files without stepId
      expect(dataResult.current.sharedFiles.length).toBe(2);
      expect(dataResult.current.sharedFiles.map(f => f.originalName)).toContain('deliverable.pdf');
      expect(dataResult.current.sharedFiles.map(f => f.originalName)).toContain('no-step-file.pdf');
    });

    it('should handle legacy snake_case SHARED_FILES_UPDATE', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result: dataResult } = renderHook(() => useData(), { wrapper });

      // Simulate legacy WebSocket message
      const legacyUpdate = {
        type: 'shared_files_update',
        content: {
          files: [
            {
              id: 'file-legacy',
              originalName: 'legacy.pdf',
              size: 1024,
              mimeType: 'application/pdf'
            }
          ]
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(legacyUpdate) } as any);
        }
      });

      expect(dataResult.current.sharedFiles.length).toBe(1);
      expect(dataResult.current.sharedFiles[0].originalName).toBe('legacy.pdf');
    });
  });

  describe('LIST_MISSIONS Handling Tests', () => {
    it('should handle LIST_MISSIONS messages correctly', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate WebSocket message
      const listMissions = {
        type: 'LIST_MISSIONS',
        content: {
          missions: [
            {
              id: 'mission-1',
              name: 'Mission 1',
              status: 'completed',
              createdAt: '2023-01-01'
            },
            {
              id: 'mission-2',
              name: 'Mission 2',
              status: 'active',
              createdAt: '2023-01-02'
            }
          ]
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(listMissions) } as any);
        }
      });

      expect(result.current.missions.length).toBe(2);
      expect(result.current.missions[0].name).toBe('Mission 1');
      expect(result.current.missions[1].name).toBe('Mission 2');
    });

    it('should handle empty LIST_MISSIONS response', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate empty missions list
      const emptyList = {
        type: 'LIST_MISSIONS',
        content: {
          missions: []
        }
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(emptyList) } as any);
        }
      });

      expect(result.current.missions.length).toBe(0);
    });
  });

  describe('Unknown Message Type Handling Tests', () => {
    it('should handle unknown message types gracefully', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate unknown message type
      const unknownMessage = {
        type: 'UNKNOWN_TYPE',
        content: {
          data: 'unknown'
        }
      };

      // Should not throw error
      expect(() => {
        act(() => {
          const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
          if (mockWebSocket.onmessage) {
            mockWebSocket.onmessage({ data: JSON.stringify(unknownMessage) } as any);
          }
        });
      }).not.toThrow();
    });

    it('should log unknown message types', () => {
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

  describe('Message Parsing Error Handling Tests', () => {
    it('should handle JSON parsing errors gracefully', () => {
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

    it('should handle malformed message structure', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Simulate message with missing required fields
      const malformedMessage = {
        type: 'MESSAGE'
        // Missing content field
      };

      act(() => {
        const mockWebSocket = (global.WebSocket as any).mock.results[0].value;
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(malformedMessage) } as any);
        }
      });

      // Should not add malformed message to history
      expect(result.current.conversationHistory.length).toBe(0);
    });
  });
});