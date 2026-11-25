import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewPanel } from './OverviewPanel';
import SpendLimitNotice from '../components/SpendLimitNotice';
import { useSpendLimitStore } from '../stores/spendLimitStore';
import { useAssistantViewStore } from '../stores/assistantViewStore';
import type { Entity } from '../stores/entityStore';
import type { ToolBinding } from '../types/workspace';

const contractBody = {
  error: 'SPEND_LIMIT_REACHED',
  userId: 'usr_123',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

let entityCounter = 0;

function makeEntity(): Entity {
  entityCounter += 1;
  return {
    id: `asst-${entityCounter}`,
    tenantId: 'tenant',
    name: 'Assistant',
    description: '',
    type: 'assistant',
    status: 'ready',
    systemPrompt: '',
    tools: [],
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Entity;
}

const userTool = {
  name: 'echo',
  enabled: true,
} as unknown as ToolBinding;

const userSkill = {
  id: 'echo',
  key: 'echo',
  name: 'Echo',
  description: 'echoes',
  triggers: [{ kind: 'user' }],
};

function renderPanel(entity: Entity) {
  return render(
    <MemoryRouter>
      <OverviewPanel
        entity={entity}
        toolBindings={[userTool]}
        availableSkills={[userSkill]}
        knowledgeEntries={[]}
        transactionGuidanceEntries={[]}
        memoryContext={{}}
        missionInput=""
        setMissionInput={vi.fn()}
        recurrence={null}
        setRecurrence={vi.fn()}
        recurringMissions={[]}
        stopRecurringMission={vi.fn()}
        running={false}
        runMission={vi.fn()}
      />
      {/* The notice renders globally from Layout; mounted here to prove the
          tool-run refusal reaches the visible alert. */}
      <SpendLimitNotice />
    </MemoryRouter>,
  );
}

function mockFetch(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
}

describe('OverviewPanel tool-run spend refusals', () => {
  afterEach(() => {
    cleanup();
    useSpendLimitStore.setState({ refusal: null });
    vi.unstubAllGlobals();
  });

  it('a refused run (429 contract body) sets the notice store and renders the alert', async () => {
    const entity = makeEntity();
    mockFetch(429, JSON.stringify(contractBody));
    renderPanel(entity);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(useSpendLimitStore.getState().refusal).toEqual({
        error: 'SPEND_LIMIT_REACHED',
        period: 'month',
        limit: 25,
        spent: 25.03,
        periodEnd: '2026-12-01T00:00:00.000Z',
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Model activity is paused');
    await waitFor(() => {
      expect(useAssistantViewStore.getState().assistantViews[entity.id]?.runResults.echo)
        .toBe(JSON.stringify(contractBody));
    });
  });

  it('a 429 with a malformed body does not set the notice', async () => {
    const entity = makeEntity();
    mockFetch(429, 'gateway exploded');
    renderPanel(entity);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(useAssistantViewStore.getState().assistantViews[entity.id]?.runResults.echo)
        .toBe('gateway exploded');
    });
    expect(useSpendLimitStore.getState().refusal).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('non-429 statuses behave as before: result text shown, no notice', async () => {
    const entity = makeEntity();
    mockFetch(400, JSON.stringify({ error: 'BAD_REQUEST' }));
    renderPanel(entity);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(useAssistantViewStore.getState().assistantViews[entity.id]?.runResults.echo)
        .toBe(JSON.stringify({ error: 'BAD_REQUEST' }));
    });
    expect(useSpendLimitStore.getState().refusal).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
