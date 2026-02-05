// services/mcsreact/src/pm-assistant/__tests__/PmAssistantComponents.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import JiraTicketCard from '../rich-output/JiraTicketCard';
import DataAnalysisChart from '../rich-output/DataAnalysisChart';
import ConfluencePreview from '../rich-output/ConfluencePreview';
import SuggestedActionsPanel from '../components/SuggestedActionsPanel';
import CurrentContextPanel from '../components/CurrentContextPanel';

describe('PM Assistant UI Components', () => {
  // Mock data for testing
  const mockJiraData = {
    ticketKey: 'DM-1234',
    title: 'Dark Mode Implementation',
    status: 'In Progress',
    type: 'Epic',
    assignee: {
      name: 'Sarah Johnson',
      avatarUrl: 'https://example.com/avatar.jpg'
    },
    summary: 'Implement dark mode across all platforms and components',
    priority: 'High',
    dueDate: new Date('2025-12-15'),
    createdDate: new Date('2025-11-01'),
    link: 'https://jira.example.com/browse/DM-1234'
  };

  const mockChartData = {
    title: 'User Feedback Analysis',
    data: [
      { label: 'Positive', value: 85 },
      { label: 'Negative', value: 15 }
    ],
    chartType: 'pie' as const,
    xAxisLabel: 'Sentiment',
    yAxisLabel: 'Percentage',
    insights: ['85% positive feedback', 'Top themes: Eye strain reduction, Battery saving']
  };

  const mockConfluenceData = {
    title: 'Dark Mode Technical Specification',
    space: 'Product Development',
    author: 'Michael Chen',
    lastUpdated: new Date('2025-11-10'),
    content: '# Overview\nThis document outlines the technical implementation of dark mode...\n\n## Requirements\n- CSS variable support\n- Theme switching without page reload\n- Accessibility compliance',
    link: 'https://confluence.example.com/display/PD/Dark+Mode+Technical+Specification'
  };

  const mockSuggestedActions = [
    {
      id: '1',
      title: 'Draft new product spec',
      description: 'Draft a comprehensive product specification document based on requirements',
      onClick: jest.fn()
    },
    {
      id: '2',
      title: 'Analyze user feedback',
      description: 'Process and summarize user feedback data from various sources',
      onClick: jest.fn()
    }
  ];

  const mockContextItems = [
    {
      id: '1',
      type: 'file',
      title: 'Dark Mode Spec Draft',
      preview: 'Initial draft of dark mode technical specification',
      link: '#',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
    },
    {
      id: '2',
      type: 'ticket',
      title: 'DM-1234: Dark Mode Implementation',
      preview: 'Epic for implementing dark mode across all platforms',
      link: '#',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    }
  ];

  test('JiraTicketCard renders correctly', () => {
    render(<JiraTicketCard {...mockJiraData} />);
    
    expect(screen.getByText('DM-1234: Dark Mode Implementation')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('Implement dark mode across all platforms and components')).toBeInTheDocument();
    expect(screen.getByText('View in Jira')).toBeInTheDocument();
  });

  test('DataAnalysisChart renders correctly', () => {
    render(<DataAnalysisChart {...mockChartData} />);
    
    expect(screen.getByText('User Feedback Analysis')).toBeInTheDocument();
    expect(screen.getByText('85% positive feedback')).toBeInTheDocument();
    expect(screen.getByText('Top themes: Eye strain reduction, Battery saving')).toBeInTheDocument();
  });

  test('ConfluencePreview renders correctly', () => {
    render(<ConfluencePreview {...mockConfluenceData} />);
    
    expect(screen.getByText('Dark Mode Technical Specification')).toBeInTheDocument();
    expect(screen.getByText('Product Development')).toBeInTheDocument();
    expect(screen.getByText('Michael Chen')).toBeInTheDocument();
    expect(screen.getByText('View Full Document')).toBeInTheDocument();
  });

  test('SuggestedActionsPanel renders correctly', () => {
    render(<SuggestedActionsPanel actions={mockSuggestedActions} />);
    
    expect(screen.getByText('Suggested Actions')).toBeInTheDocument();
    expect(screen.getByText('Draft new product spec')).toBeInTheDocument();
    expect(screen.getByText('Analyze user feedback')).toBeInTheDocument();
    
    const buttons = screen.getAllByText('Start');
    expect(buttons.length).toBe(2);
    
    fireEvent.click(buttons[0]);
    expect(mockSuggestedActions[0].onClick).toHaveBeenCalled();
  });

  test('CurrentContextPanel renders correctly', () => {
    render(<CurrentContextPanel 
      contextItems={mockContextItems}
      missionName="Dark Mode Implementation"
      missionStatus="In Progress"
    />);
    
    expect(screen.getByText('Current Context')).toBeInTheDocument();
    expect(screen.getByText('Dark Mode Implementation')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Dark Mode Spec Draft')).toBeInTheDocument();
    expect(screen.getByText('DM-1234: Dark Mode Implementation')).toBeInTheDocument();
  });

  test('JiraTicketCard handles missing data gracefully', () => {
    const minimalData = {
      ticketKey: 'TEST-1',
      title: 'Test Ticket',
      status: 'To Do',
      type: 'Task',
      assignee: { name: 'Unassigned' },
      summary: 'Test summary',
      priority: 'Medium',
      dueDate: undefined,
      createdDate: new Date(),
      link: '#'
    };
    
    render(<JiraTicketCard {...minimalData} />);
    
    expect(screen.getByText('TEST-1: Test Ticket')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  test('DataAnalysisChart handles empty data', () => {
    const emptyChartData = {
      title: 'Empty Chart',
      data: [],
      chartType: 'bar' as const,
      xAxisLabel: 'Items',
      yAxisLabel: 'Values',
      insights: []
    };
    
    render(<DataAnalysisChart {...emptyChartData} />);
    
    expect(screen.getByText('Empty Chart')).toBeInTheDocument();
  });

  test('ConfluencePreview handles long content with truncation', () => {
    const longContentData = {
      ...mockConfluenceData,
      content: '# Very Long Document\n'.repeat(100) + 'End of document'
    };
    
    render(<ConfluencePreview {...longContentData} />);
    
    expect(screen.getByText('Read More')).toBeInTheDocument();
  });
});

