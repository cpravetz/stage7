import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedStore } from '../stores/feedStore';
import { useMissionsStore, type MissionDetail } from '../stores/missionsStore';
import MissionRoom from './MissionRoom';
import Missions from './Missions';

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
    vi.unstubAllGlobals();
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

describe('Mission Room message attention', () => {
  beforeEach(() => {
    useFeedStore.setState({ events: [], ensureConnected: vi.fn() });
    useMissionsStore.setState({
      missions: [
        { workflowId, missionId: 'test', status: 'awaiting_review' },
        { workflowId: 'mission-other', missionId: 'other', status: 'running' },
      ],
      details: { [workflowId]: { missionId: 'test', status: 'awaiting_review' } },
      detailLoading: {}, detailError: {}, missionsLoaded: true,
      pendingApprovals: [{ missionId: 'other', phaseId: 'phase-1', question: 'Approve?' }],
      fetchMissionDetail: vi.fn(), refreshDetail: vi.fn(),
      fetchRecurringSchedules: vi.fn(), fetchPendingApprovals: vi.fn(),
    });
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    useMissionsStore.setState(originalMissionsState, true);
    useFeedStore.setState(originalFeedState, true);
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears attention for a resumed mission while retaining another pending approval', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/messages')) {
        return { ok: true, json: async () => ({ status: 'resuming' }) };
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ missions: [
          { workflowId, missionId: 'test', status: 'running' },
          { workflowId: 'mission-other', missionId: 'other', status: 'running' },
        ] }),
      };
    }));

    render(
      <MemoryRouter initialEntries={[`/missions/${workflowId}`]}>
        <Routes>
          <Route path="/missions/:workflowId" element={<MissionRoom />} />
          <Route path="/missions" element={<Missions />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText(/Send messages to the mission/), { target: { value: 'Please continue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(useMissionsStore.getState().missions[0].status).toBe('running'));
    fireEvent.click(screen.getByRole('link', { name: /All Missions/ }));
    expect(within(screen.getByRole('link', { name: 'test' })).queryByTitle('Needs attention')).not.toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /other/ })).getByTitle('Needs attention')).toBeInTheDocument();
  });

  it('does not refresh or clear attention if sending fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, statusText: 'Conflict' })));
    renderRoom({ missionId: 'test', status: 'awaiting_review' });
    fireEvent.change(screen.getByPlaceholderText(/Send messages to the mission/), { target: { value: 'Please continue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/API error: 409/)).toBeInTheDocument();
    expect(useMissionsStore.getState().missions[0].status).toBe('awaiting_review');
    expect(useMissionsStore.getState().refreshDetail).not.toHaveBeenCalled();
  });

  it('does not dismiss a permission request when chat is accepted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'accepted' }) })));
    const detail: MissionDetail = {
      missionId: 'test', status: 'awaiting_review',
      output: { outputs: { pendingInteraction: {
        kind: 'mcp_permission', phaseId: 'phase-1', taskId: 'task-1', taskTitle: 'Use tool',
        agentRole: 'executor', requestId: 'permission-1',
      } } },
    };
    const room = renderRoom(detail);
    fireEvent.change(screen.getByPlaceholderText(/Send messages to the mission/), { target: { value: 'Please continue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByPlaceholderText(/Send messages to the mission/)).toHaveValue(''));
    room.unmount();
    renderRoom(detail);
    expect(screen.getByText('The Agent requests permission to use a discovered tool.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant and continue' })).toBeEnabled();
  });

  it.each([
    ['Approve phase', 'approve'],
    ['Reject phase', 'reject'],
  ])('refreshes pending approvals after %s', async (button, action) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    useFeedStore.setState({ events: [{
      id: 'approval', type: 'approval_requested', source: 'mission', message: 'Approve?',
      timestamp: 2, missionId: 'test', metadata: { phaseId: 'phase-1', question: 'Approve?' },
    }] });
    renderRoom({
      missionId: 'test', status: 'running',
      output: {
        plan: { phases: [{ id: 'phase-1', name: 'Phase', tasks: [{ id: 'task-1', title: 'Task' }] }] },
        outputs: { phases: [{ phaseId: 'phase-1', tasks: [{ taskId: 'task-1', status: 'completed' }] }] },
      },
    });
    fireEvent.click(screen.getAllByRole('button', { name: button })[0]);
    await waitFor(() => expect(useMissionsStore.getState().fetchPendingApprovals).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/phase-1/${action}`),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
