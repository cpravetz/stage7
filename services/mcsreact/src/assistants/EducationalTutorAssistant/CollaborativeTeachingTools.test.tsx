import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@mui/material', () => ({
  Box: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'box', ...props }, children),
  Typography: ({ children, ...props }: any) => React.createElement('span', { 'data-testid': 'typography', ...props }, children),
  Paper: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'paper', ...props }, children),
  Button: ({ children, onClick, ...props }: any) => React.createElement('button', { 'data-testid': 'button', onClick, ...props }, children),
  Grid: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'grid', ...props }, children),
  List: ({ children, ...props }: any) => React.createElement('ul', { 'data-testid': 'list', ...props }, children),
  ListItem: ({ children, ...props }: any) => React.createElement('li', { 'data-testid': 'list-item', ...props }, children),
  ListItemText: ({ primary, secondary, ...props }: any) => React.createElement('div', { 'data-testid': 'list-item-text', ...props }, primary, '\n', secondary),
  ListItemIcon: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'list-item-icon', ...props }, children),
  CircularProgress: (props: any) => React.createElement('div', { 'data-testid': 'circular-progress', ...props }),
  Alert: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'alert', ...props }, children),
}));

jest.mock('@mui/icons-material', () => ({
  Dashboard: () => React.createElement('span', { 'data-testid': 'icon-dashboard' }),
  Forum: () => React.createElement('span', { 'data-testid': 'icon-forum' }),
  Share: () => React.createElement('span', { 'data-testid': 'icon-share' }),
}));

import CollaborativeTeachingTools from './CollaborativeTeachingTools';

const mockClient = {
  getContext: jest.fn(),
  sendMessage: jest.fn(),
};

const defaultProps = {
  conversationId: 'test-conversation-id',
  client: mockClient,
  setError: jest.fn(),
};

describe('CollaborativeTeachingTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.getContext.mockResolvedValue({
      contextItems: [],
    });
    mockClient.sendMessage.mockResolvedValue(undefined);
  });

  test('renders loading state initially', () => {
    render(<CollaborativeTeachingTools {...defaultProps} />);
    expect(screen.getByTestId('circular-progress')).toBeInTheDocument();
  });

  test('renders no collaborations message when context is empty', async () => {
    render(<CollaborativeTeachingTools {...defaultProps} />);
    await act(async () => {
      await Promise.resolve();
    });
    const listItemText = screen.getByTestId('list-item-text');
    expect(listItemText.textContent).toContain('No recent collaborations found.');
  });

  test('renders collaborations when context items exist', async () => {
    mockClient.getContext.mockResolvedValue({
      contextItems: [
        {
          id: '1',
          type: 'collaboration_log',
          title: 'Launch Shared Whiteboard',
          preview: 'User requested a whiteboard.',
          link: '/whiteboard',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
    });

    render(<CollaborativeTeachingTools {...defaultProps} />);
    await act(async () => {
      await Promise.resolve();
    });
    const listItemTexts = screen.getAllByTestId('list-item-text');
    expect(listItemTexts[0].textContent).toContain('Launch Shared Whiteboard');
    expect(listItemTexts[0].textContent).toContain('User requested a whiteboard.');
  });

  test('adds a collaboration post when Launch Shared Whiteboard is clicked', async () => {
    render(<CollaborativeTeachingTools {...defaultProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = screen.getAllByTestId('button');
    await act(async () => {
      fireEvent.click(buttons[0]);
    });

    const listItemTexts = screen.getAllByTestId('list-item-text');
    expect(listItemTexts[0].textContent).toContain('Launch Shared Whiteboard');
    expect(listItemTexts[0].textContent).toContain('User requested to launch a shared whiteboard for collaboration.');
    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      'test-conversation-id',
      'User requested to launch a shared whiteboard for collaboration.'
    );
  });

  test('adds a collaboration post when Open Discussion Forum is clicked', async () => {
    render(<CollaborativeTeachingTools {...defaultProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = screen.getAllByTestId('button');
    await act(async () => {
      fireEvent.click(buttons[1]);
    });

    const listItemTexts = screen.getAllByTestId('list-item-text');
    expect(listItemTexts[0].textContent).toContain('Open Discussion Forum');
    expect(listItemTexts[0].textContent).toContain('User requested to open a discussion forum for collaboration.');
    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      'test-conversation-id',
      'User requested to open a discussion forum for collaboration.'
    );
  });

  test('adds a collaboration post when Share Educational Resource is clicked', async () => {
    render(<CollaborativeTeachingTools {...defaultProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = screen.getAllByTestId('button');
    await act(async () => {
      fireEvent.click(buttons[2]);
    });

    const listItemTexts = screen.getAllByTestId('list-item-text');
    expect(listItemTexts[0].textContent).toContain('Share Educational Resource');
    expect(listItemTexts[0].textContent).toContain('User requested to share an educational resource with collaborators.');
    expect(mockClient.sendMessage).toHaveBeenCalledWith(
      'test-conversation-id',
      'User requested to share an educational resource with collaborators.'
    );
  });

  test('shows error when getContext fails', async () => {
    const mockSetError = jest.fn();
    mockClient.getContext.mockRejectedValue(new Error('API Error'));

    render(<CollaborativeTeachingTools {...defaultProps} setError={mockSetError} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSetError).toHaveBeenCalledWith('Failed to load recent collaborations.');
    const listItemText = screen.getByTestId('list-item-text');
    expect(listItemText.textContent).toContain('No recent collaborations found.');
  });

  test('does nothing when conversationId is null', async () => {
    render(<CollaborativeTeachingTools {...defaultProps} conversationId={null} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('circular-progress')).toBeInTheDocument();
    expect(mockClient.sendMessage).not.toHaveBeenCalled();
  });
});
