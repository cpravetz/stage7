import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import axios from 'axios';
import { App } from '../src/App';

jest.mock('axios');
jest.mock('./SecurityClient');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders login component when not authenticated', () => {
    render(<App />);
    expect(screen.getByText(/Login/i)).toBeInTheDocument();
  });

  it('renders main app when authenticated', () => {
    localStorage.setItem('authToken', 'fake-token');
    render(<App />);
    expect(screen.getByText(/Send/i)).toBeInTheDocument();
  });

  it('handles sending a message', async () => {
    localStorage.setItem('authToken', 'fake-token');
    mockedAxios.post.mockResolvedValue({ data: {} });

    render(<App />);
    
    const input = screen.getByPlaceholderText(/Type your message/i);
    const sendButton = screen.getByText(/Send/i);

    fireEvent.change(input, { target: { value: 'Hello, AI!' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/User: Hello, AI!/i)).toBeInTheDocument();
    });

    expect(mockedAxios.post).toHaveBeenCalledWith('/sendMessage', expect.any(Object));
  });

  it('handles mission control actions', async () => {
    localStorage.setItem('authToken', 'fake-token');
    mockedAxios.post.mockResolvedValue({ data: {} });

    render(<App />);
    
    const pauseButton = screen.getByText(/Pause/i);
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith('/sendMessage', expect.objectContaining({
        content: expect.objectContaining({ action: 'pause' })
      }));
    });
  });

  it('displays statistics', () => {
    localStorage.setItem('authToken', 'fake-token');
    const mockStatistics = {
      llmCalls: 10,
      agentCountByStatus: { active: 2, completed: 1 },
      runningAgents: ['agent1', 'agent2'],
      engineerStatistics: { newPlugins: ['plugin1'] }
    };

    render(<App />);
    act(() => {
      // Simulate WebSocket message
      const message = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'STATISTICS',
          content: mockStatistics
        })
      });
      (global as any).dispatchEvent(message);
    });

    expect(screen.getByText(/LLM Calls: 10/i)).toBeInTheDocument();
  });
});