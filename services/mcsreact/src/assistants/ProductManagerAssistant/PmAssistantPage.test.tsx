import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PmAssistantPage from './PmAssistantPage';
import { PmAssistantClient } from './PmAssistantClient';

// Mock the PmAssistantClient
jest.mock('./PmAssistantClient');

describe('PmAssistantPage', () => {
  const mockClient = {
    startConversation: jest.fn(),
    sendMessage: jest.fn(),
    submitHumanInput: jest.fn(),
    getHistory: jest.fn(),
    getSuggestedActions: jest.fn(),
    getContext: jest.fn(),
    triggerAction: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(() => {
    (PmAssistantClient as jest.Mock).mockImplementation(() => mockClient);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  test('renders without crashing', () => {
    render(<PmAssistantPage />);
    expect(screen.getByText('Product Manager Assistant')).toBeInTheDocument();
  });

  test('shows quick start buttons when no conversation is active', () => {
    render(<PmAssistantPage />);
    expect(screen.getByText('Quick Start Actions:')).toBeInTheDocument();
    expect(screen.getByText('Draft Product Spec')).toBeInTheDocument();
    expect(screen.getByText('Analyze Feedback')).toBeInTheDocument();
  });

  test('starts conversation when input is submitted', async () => {
    mockClient.startConversation.mockResolvedValue('test-conversation-id');
    
    render(<PmAssistantPage />);
    const input = screen.getByPlaceholderText(/Start a new conversation/);
    const button = screen.getByText('Start');
    
    fireEvent.change(input, { target: { value: 'Test prompt' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockClient.startConversation).toHaveBeenCalledWith('Test prompt', 'current-user-id');
    });
  });

  test('fetches suggested actions when conversation starts', async () => {
    mockClient.startConversation.mockResolvedValue('test-conversation-id');
    mockClient.getSuggestedActions.mockResolvedValue({
      actions: [
        { id: '1', title: 'Test Action', description: 'Test Description', type: 'test' }
      ]
    });
    
    render(<PmAssistantPage />);
    const input = screen.getByPlaceholderText(/Start a new conversation/);
    const button = screen.getByText('Start');
    
    fireEvent.change(input, { target: { value: 'Test prompt' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockClient.getSuggestedActions).toHaveBeenCalledWith('test-conversation-id');
    });
  });

  test('fetches context when conversation starts', async () => {
    mockClient.startConversation.mockResolvedValue('test-conversation-id');
    mockClient.getContext.mockResolvedValue({
      contextItems: [],
      mission: { id: '1', name: 'Test Mission', status: 'active', startDate: '2023-01-01', targetDate: '2023-12-31' }
    });
    
    render(<PmAssistantPage />);
    const input = screen.getByPlaceholderText(/Start a new conversation/);
    const button = screen.getByText('Start');
    
    fireEvent.change(input, { target: { value: 'Test prompt' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockClient.getContext).toHaveBeenCalledWith('test-conversation-id');
    });
  });

  test('shows error when conversation start fails', async () => {
    mockClient.startConversation.mockRejectedValue(new Error('Failed to start'));
    
    render(<PmAssistantPage />);
    const input = screen.getByPlaceholderText(/Start a new conversation/);
    const button = screen.getByText('Start');
    
    fireEvent.change(input, { target: { value: 'Test prompt' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/Error:.*Failed to start/)).toBeInTheDocument();
    });
  });

  test('handles quick start action click', async () => {
    mockClient.startConversation.mockResolvedValue('test-conversation-id');
    mockClient.triggerAction.mockResolvedValue(undefined);
    
    render(<PmAssistantPage />);
    const input = screen.getByPlaceholderText(/Start a new conversation/);
    const button = screen.getByText('Start');
    
    fireEvent.change(input, { target: { value: 'Test prompt' } });
    fireEvent.click(button);
    
    await waitFor(() => {
      const quickStartButton = screen.getByText('Draft Product Spec');
      fireEvent.click(quickStartButton);
      expect(mockClient.triggerAction).toHaveBeenCalledWith('test-conversation-id', 'draft-product-spec');
    });
  });
});

