import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import AgentDetails from './AgentDetails';

describe('AgentDetails', () => {
  it('renders "No agents currently active" when agents array is empty', () => {
    render(<AgentDetails agents={[]} />);
    expect(screen.getByText('No agents currently active.')).toBeInTheDocument();
  });

  it('renders agent details when agents are provided', () => {
    const agents = [
      { id: '1', name: 'Agent 1', status: 'ACTIVE', currentTask: 'Task 1' },
      { id: '2', name: 'Agent 2', status: 'IDLE', currentTask: '' },
    ];

    render(<AgentDetails agents={agents} />);

    expect(screen.getByText('Agent Details')).toBeInTheDocument();
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Status: ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Current Task: Task 1')).toBeInTheDocument();
    expect(screen.getByText('Agent 2')).toBeInTheDocument();
    expect(screen.getByText('Status: IDLE')).toBeInTheDocument();
    expect(screen.getByText('Current Task: None')).toBeInTheDocument();
  });

  it('applies correct CSS classes based on agent status', () => {
    const agents = [
      { id: '1', name: 'Agent 1', status: 'ACTIVE', currentTask: 'Task 1' },
      { id: '2', name: 'Agent 2', status: 'IDLE', currentTask: '' },
    ];

    render(<AgentDetails agents={agents} />);

    expect(screen.getByText('Agent 1').closest('li')).toHaveClass('agent-item status-active');
    expect(screen.getByText('Agent 2').closest('li')).toHaveClass('agent-item status-idle');
  });
});