import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import '@testing-library/jest-dom';
import ConversationHistory from '../src/components/ConversationHistory';

describe('ConversationHistory', () => {
  it('renders the component with a title', () => {
    render(<ConversationHistory history={[]} />);
    expect(screen.getByText('Conversation History')).toBeInTheDocument();
  });

  it('renders an empty list when history is empty', () => {
    render(<ConversationHistory history={[]} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renders history items correctly', () => {
    const mockHistory = [
      'User: Hello',
      'AI: Hi there!',
      'User: How are you?',
      "AI: I'm doing well, thank you for asking!"
    ];

    render(<ConversationHistory history={mockHistory} />);

    mockHistory.forEach(message => {
      expect(screen.getByText(message)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(mockHistory.length);
  });

  it('renders history items in the correct order', () => {
    const mockHistory = [
      'First message',
      'Second message',
      'Third message'
    ];

    render(<ConversationHistory history={mockHistory} />);

    const historyItems = screen.getAllByRole('listitem');
    expect(historyItems).toHaveLength(mockHistory.length);

    historyItems.forEach((item, index) => {
      expect(item).toHaveTextContent(mockHistory[index]);
    });
  });
});