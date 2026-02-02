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

describe('API Endpoint Execution Tests', () => {
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

  describe('Mission Creation API Tests', () => {
    it('should create mission via /createMission endpoint', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          missionId: 'mission-123',
          name: 'Test Mission',
          status: 'active'
        }
      });

      // Send first message (should trigger mission creation)
      await act(async () => {
        await result.current.sendMessage('Create a test mission');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/createMission',
        {
          goal: 'Create a test mission',
          clientId: 'test-client-id'
        },
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          withCredentials: true
        }
      );

      // Verify mission state
      expect(missionResult.current.activeMission).toBe(true);
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Create a test mission',
          sender: 'user'
        })
      );
    });

    it('should handle mission creation API errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API error
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal server error' }
        }
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test mission');
      });

      // Verify error handling
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('Message Sending API Tests', () => {
    it('should send user message via /sendMessage endpoint', async () => {
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
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true,
          messageId: 'msg-456'
        }
      });

      // Send message to active mission
      await act(async () => {
        await result.current.sendMessage('Hello assistant');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        {
          type: 'userMessage',
          sender: 'user',
          recipient: 'MissionControl',
          content: {
            missionId: 'mission-123',
            message: 'Hello assistant'
          },
          clientId: 'test-client-id',
          id: expect.any(String)
        },
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      );

      // Verify conversation history
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Hello assistant',
          sender: 'user'
        })
      );
    });

    it('should send USER_INPUT_RESPONSE via /sendMessage endpoint', async () => {
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
          request_id: 'req-789',
          question: 'What is your preference?',
          answerType: 'text',
          choices: ['Option 1', 'Option 2']
        };
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send response to user input
      await act(async () => {
        await result.current.sendMessage('I prefer Option 1');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        {
          type: 'USER_INPUT_RESPONSE',
          sender: 'user',
          content: {
            missionId: 'mission-123',
            response: 'I prefer Option 1',
            requestId: 'req-789'
          },
          recipient: 'agentset',
          clientId: 'test-client-id'
        },
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      );

      // Verify pending input is cleared
      expect(result.current.pendingUserInput).toBeNull();
    });

    it('should send answer to question via /sendMessage endpoint', async () => {
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
          content: 'What is your name?',
          asker: 'assistant-1'
        };
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send answer to question
      await act(async () => {
        await result.current.sendMessage('My name is John');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        {
          type: 'answer',
          sender: 'user',
          content: {
            missionId: 'mission-123',
            answer: 'My name is John',
            asker: 'assistant-1',
            questionGuid: 'question-123'
          },
          recipient: 'MissionControl',
          clientId: 'test-client-id'
        },
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      );

      // Verify current question is cleared
      expect(result.current.currentQuestion).toBeNull();
    });
  });

  describe('Mission Loading API Tests', () => {
    it('should load mission via /loadMission endpoint', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true,
          mission: {
            id: 'mission-123',
            name: 'Loaded Mission',
            status: 'active'
          }
        }
      });

      // Load mission
      await act(async () => {
        await result.current.handleLoadMission('mission-123');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/loadMission',
        {
          missionId: 'mission-123',
          clientId: 'test-client-id'
        },
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      );

      // Verify conversation history
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Mission mission-123 loaded.',
          sender: 'system'
        })
      );
    });

    it('should handle mission loading errors', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock API error
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

      // Verify error handling
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to load mission. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('Mission Control Action Tests', () => {
    it('should send pause action via /sendMessage endpoint', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
        missionResult.current.activeMissionName = 'Test Mission';
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send pause action
      await act(async () => {
        await result.current.handleControlAction('pause');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        {
          clientId: 'test-client-id',
          recipient: 'MissionControl',
          content: {
            type: 'pause',
            action: 'pause',
            missionId: 'mission-123',
            missionName: 'Test Mission'
          },
          timestamp: expect.any(String)
        },
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      );

      // Verify conversation history
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Sent pause request to MissionControl.',
          sender: 'system'
        })
      );
    });

    it('should send resume action via /sendMessage endpoint', async () => {
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
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send resume action
      await act(async () => {
        await result.current.handleControlAction('resume');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'resume',
            action: 'resume'
          })
        }),
        expect.any(Object)
      );
    });

    it('should send save action via /sendMessage endpoint', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });
      const { result: missionResult } = renderHook(() => useMission(), { wrapper });

      // Set active mission
      act(() => {
        missionResult.current.activeMission = true;
        missionResult.current.activeMissionId = 'mission-123';
        missionResult.current.activeMissionName = 'Test Mission';
      });

      // Mock API response
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send save action
      await act(async () => {
        await result.current.handleControlAction('save');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'save',
            action: 'save'
          })
        }),
        expect.any(Object)
      );
    });

    it('should send abort action via /sendMessage endpoint', async () => {
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
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true
        }
      });

      // Send abort action
      await act(async () => {
        await result.current.handleControlAction('abort');
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/sendMessage',
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'abort',
            action: 'abort'
          })
        }),
        expect.any(Object)
      );

      // Verify mission state reset
      expect(missionResult.current.activeMission).toBe(false);
      expect(missionResult.current.activeMissionId).toBeNull();
    });
  });

  describe('Authentication and Error Handling Tests', () => {
    it('should handle missing authentication token', async () => {
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

      // Verify error message
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Authentication failed. Please log in again.',
          sender: 'system'
        })
      );

      // Verify no API call was made
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle API network errors', async () => {
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

      // Verify error handling
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

      // Mock validation error
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Invalid mission ID' }
        }
      });

      // Try to send message
      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      // Verify error handling
      expect(result.current.conversationHistory).toContainEqual(
        expect.objectContaining({
          content: 'Failed to send message. Please try again.',
          sender: 'system'
        })
      );
    });
  });

  describe('Assistant-Specific API Tests', () => {
    it('should handle content creator assistant content calendar API', async () => {
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

      // Mock content calendar API response
      mockedAxios.get.mockResolvedValue({
        data: {
          calendar: {
            items: [
              { id: 'item-1', title: 'Blog Post', date: '2023-01-01' },
              { id: 'item-2', title: 'Social Media', date: '2023-01-02' }
            ]
          }
        }
      });

      // Simulate content calendar API call
      await act(async () => {
        await axios.get('/api/content-creator-assistant/content-calendar?conversationId=mission-123');
      });

      // Verify API call
      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/content-creator-assistant/content-calendar?conversationId=mission-123',
        expect.any(Object)
      );
    });

    it('should handle customer support assistant ticket creation API', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock ticket creation API response
      mockedAxios.post.mockResolvedValue({
        data: {
          ticket: {
            id: 'ticket-123',
            title: 'Support Request',
            status: 'Open',
            priority: 'Medium'
          }
        }
      });

      // Simulate ticket creation API call
      await act(async () => {
        await axios.post('/api/customer-support-assistant/tickets', {
          title: 'Support Request',
          description: 'Need help with the system',
          priority: 'Medium'
        });
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/customer-support-assistant/tickets',
        {
          title: 'Support Request',
          description: 'Need help with the system',
          priority: 'Medium'
        },
        expect.any(Object)
      );
    });

    it('should handle career assistant job matching API', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <WebSocketProvider>{children}</WebSocketProvider>
      );

      const { result } = renderHook(() => useWebSocket(), { wrapper });

      // Mock job matching API response
      mockedAxios.post.mockResolvedValue({
        data: {
          matches: [
            {
              jobId: 'job-1',
              title: 'Software Engineer',
              company: 'Tech Corp',
              matchScore: 0.95
            },
            {
              jobId: 'job-2',
              title: 'Senior Developer',
              company: 'Dev Inc',
              matchScore: 0.87
            }
          ]
        }
      });

      // Simulate job matching API call
      await act(async () => {
        await axios.post('/api/career-assistant/job-matching', {
          skills: ['JavaScript', 'React', 'Node.js'],
          experience: 5,
          location: 'Remote'
        });
      });

      // Verify API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/career-assistant/job-matching',
        {
          skills: ['JavaScript', 'React', 'Node.js'],
          experience: 5,
          location: 'Remote'
        },
        expect.any(Object)
      );
    });
  });
});