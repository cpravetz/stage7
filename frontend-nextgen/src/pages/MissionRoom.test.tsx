import '@testing-library/jest-dom';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedStore } from '../stores/feedStore';
import { useMissionsStore, type MissionDetail } from '../stores/missionsStore';
import MissionRoom from './MissionRoom';

const workflowId = 'mission-test';
const originalMissionsState = useMissionsStore.getState();
const originalFeedState = useFeedStore.getState();

function renderRoom(detail: MissionDetail) {
  useMissionsStore.setState({ details: { [workflowId]: detail } });
  return render(
    <MemoryRouter initialEntries={[`/missions/${workflowId}`]}>
      <Routes>
        <Route path="/missions/:workflowId" element={<MissionRoom />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Mission Room review card', () => {
  beforeEach(() => {
    useMissionsStore.setState({ fetchMissionDetail: vi.fn(), details: {}, detailLoading: {}, detailError: {} });
    useFeedStore.setState({ events: [], ensureConnected: vi.fn() });
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    useMissionsStore.setState(originalMissionsState, true);
    useFeedStore.setState(originalFeedState, true);
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows saved review issues at the top when there is no pending interaction', () => {
    renderRoom({
      missionId: 'test',
      status: 'awaiting_review',
      output: { outputs: { status: 'awaiting_review', reason: 'Recovery stopped', gaps: ['A deliverable is missing.'] } },
    });

    const card = screen.getByRole('region', { name: 'Mission review' });
    expect(within(card).getByText(/Recovery stopped/)).toHaveTextContent('A deliverable is missing.');
    expect(card).toHaveTextContent('send guidance or select Resume');
    act(() => {
      useMissionsStore.setState({ details: { [workflowId]: { missionId: 'test', status: 'running' } } });
    });
    expect(screen.queryByRole('region', { name: 'Mission review' })).not.toBeInTheDocument();
  });

  it('keeps the existing input card instead of showing a generic review card', () => {
    const detail: MissionDetail = {
      missionId: 'test',
      status: 'awaiting_review',
      output: { outputs: {
        pendingInteraction: {
          kind: 'user_input', phaseId: 'phase-1', taskId: 'task-1', taskTitle: 'Configure', agentRole: 'executor',
          question: 'Which account?',
        },
      } },
    };
    renderRoom(detail);
    expect(screen.queryByRole('region', { name: 'Mission review' })).not.toBeInTheDocument();
    expect(screen.getByText('Which account?')).toBeInTheDocument();
  });

  it('keeps the clarification form instead of showing a generic review card', () => {
    renderRoom({
      missionId: 'test',
      status: 'awaiting_review',
      output: {
        plan: { phases: [], requiresClarification: true, clarificationQuestions: ['What scope?'] },
        outputs: { status: 'awaiting_clarification' },
      },
    });
    expect(screen.queryByRole('region', { name: 'Mission review' })).not.toBeInTheDocument();
    expect(screen.getByText('What scope?')).toBeInTheDocument();
  });
});
