import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useFeedStore, type FeedEvent } from '../stores/feedStore';
import { useMissionsStore } from '../stores/missionsStore';
import MissionInputAlert from './MissionInputAlert';

function event(
  id: string,
  type: string,
  timestamp: number,
  metadata: Record<string, unknown> = {},
): FeedEvent {
  return {
    id,
    type,
    source: 'orchestrator',
    message: type,
    timestamp,
    missionId: 'mission-need-config',
    metadata,
  };
}

describe('MissionInputAlert', () => {
  afterEach(() => {
    useFeedStore.setState({ events: [] });
    useMissionsStore.setState({ details: {} });
  });

  it('shows secret-safe user questions globally with a link to the mission room', () => {
    useFeedStore.setState({
      events: [event('question-1', 'question_asked', 1, {
        taskId: 'task-1',
        question: '[secret:service-token] Enter the API token.',
      })],
    });

    render(
      <MemoryRouter>
        <MissionInputAlert />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Mission needs your input');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the API token.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('[secret:service-token]');
    expect(screen.getByRole('link', { name: 'Open mission conversation' }))
      .toHaveAttribute('href', '/missions/mission-need-config');
  });

  it('clears the alert when the mission records that the question was answered', () => {
    useFeedStore.setState({
      events: [
        event('resolved-2', 'user_input_resolved', 2, { taskId: 'task-1' }),
        event('question-1', 'question_asked', 1, { taskId: 'task-1', question: 'Which account?' }),
      ],
    });

    render(
      <MemoryRouter>
        <MissionInputAlert />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
