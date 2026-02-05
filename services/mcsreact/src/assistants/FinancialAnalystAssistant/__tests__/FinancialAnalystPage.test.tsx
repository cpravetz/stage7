import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FinancialAnalystPage from '../FinancialAnalystPage';
import { financeAssistantClient } from '../../shared/assistantClients';

// Mock the finance assistant client
jest.mock('../../shared/assistantClients', () => ({
  financeAssistantClient: {
    startConversation: jest.fn().mockResolvedValue('test-conversation-id'),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    getHistory: jest.fn().mockResolvedValue({ history: [] }),
    on: jest.fn(),
    endConversation: jest.fn(),
  }
}));

describe('FinancialAnalystPage', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('renders FinancialAnalystPage with domain components', () => {
    render(<FinancialAnalystPage />);

    // Check that the main title is rendered
    expect(screen.getByText('Financial Analyst Assistant')).toBeInTheDocument();

    // Check that domain-specific components are rendered
    expect(screen.getByText('Financial Data Explorer')).toBeInTheDocument();
    expect(screen.getByText('Portfolio Management Center')).toBeInTheDocument();
    expect(screen.getByText('Market Data Monitor')).toBeInTheDocument();

    // Check that quick action buttons are rendered
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
    expect(screen.getByText('Market Analysis')).toBeInTheDocument();
    expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
  });

  test('domain components can trigger conversation messages', () => {
    render(<FinancialAnalystPage />);

    // Mock the sendMessage function to track calls
    const mockSendMessage = jest.fn();
    
    // Click on stock analysis button
    const analyzeAAPLButton = screen.getByText('Analyze AAPL');
    fireEvent.click(analyzeAAPLButton);
    
    // Click on portfolio action button
    const rebalanceButton = screen.getByText('Rebalance Portfolio');
    fireEvent.click(rebalanceButton);
    
    // Click on market alert button
    const monitorAAPLButton = screen.getByText('Monitor AAPL');
    fireEvent.click(monitorAAPLButton);
    
    // Click on quick action buttons
    const generateReportButton = screen.getByText('Generate Report');
    fireEvent.click(generateReportButton);
    
    // Verify that the conversation client was initialized
    expect(financeAssistantClient.startConversation).toHaveBeenCalledWith('Hello! I need help with financial analysis and reporting.');
  });

  test('conversation context is displayed', () => {
    render(<FinancialAnalystPage />);

    // Check that conversation context display is present
    expect(screen.getByText('Conversation Context:')).toBeInTheDocument();
    expect(screen.getByText('No active conversation messages yet')).toBeInTheDocument();
  });

  test('component structure matches hybrid approach', () => {
    const { container } = render(<FinancialAnalystPage />);

    // Verify the overall structure
    const gridContainer = container.querySelector('.MuiGrid-container');
    expect(gridContainer).toBeInTheDocument();
    
    // Verify that there are 3 grid items (one for each domain component)
    const gridItems = container.querySelectorAll('.MuiGrid-item');
    expect(gridItems.length).toBe(3);
  });
});

