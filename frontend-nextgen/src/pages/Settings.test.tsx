import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';

vi.mock('../services/api', () => ({ default: { post: vi.fn() } }));

const postMock = api.post as unknown as ReturnType<typeof vi.fn>;

const SettingsPage = () => import('./Settings').then((m) => m.default);

async function renderSettings() {
  const Component = await SettingsPage();
  return render(<Component />);
}

const loadResponse = (data: Record<string, unknown> | null) => ({
  data: { documents: data === null ? [] : [{ id: 'llm-config', data }] },
});

describe('Settings page', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders saved values from the llm-config document', async () => {
    postMock.mockResolvedValueOnce(
      loadResponse({
        freeModelsOnly: true,
        providerTimeoutMs: 123456,
        preferredModelIds: ['openai:gpt-4o'],
        forbiddenModelIds: ['evil:model'],
      })
    );
    renderSettings();

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect((screen.getByLabelText(/provider timeout/i) as HTMLInputElement).value).toBe('123456');
    expect(screen.getByLabelText(/preferred models/i)).toHaveValue('openai:gpt-4o');
    expect(screen.getByLabelText(/forbidden models/i)).toHaveValue('evil:model');
    expect(postMock).toHaveBeenCalledWith('/artifacts/documents/search', { collection: 'settings' });
  });

  it('renders defaults for fields missing from the document', async () => {
    postMock.mockResolvedValueOnce(loadResponse({ freeModelsOnly: true }));
    renderSettings();

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect((screen.getByLabelText(/completion deadline/i) as HTMLInputElement).value).toBe('900000');
    expect((screen.getByLabelText(/approval timeout/i) as HTMLInputElement).value).toBe('86400000');
    expect((screen.getByLabelText(/watch scheduler/i) as HTMLInputElement).value).toBe('60000');
    expect(screen.getByLabelText(/preferred models/i)).toHaveValue('');
  });

  it('saves a payload containing every field, including untouched ones', async () => {
    postMock.mockResolvedValueOnce(loadResponse({ freeModelsOnly: true, providerTimeoutMs: 111 }));
    postMock.mockResolvedValueOnce({ data: {} });
    renderSettings();

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    fireEvent.change(screen.getByLabelText(/approval poll interval/i), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(screen.getByText(/~30 seconds/i)).toBeInTheDocument());
    const saveCall = postMock.mock.calls.find((call) => call[0] === '/artifacts/documents');
    expect(saveCall).toBeTruthy();
    const body = saveCall![1];
    expect(body).toMatchObject({ id: 'llm-config', tenantId: 'system', collection: 'settings' });
    expect(body.data).toEqual({
      freeModelsOnly: true,
      providerTimeoutMs: 111, // untouched loaded value
      providerAttemptTimeoutMs: 310000, // default
      completionDeadlineMs: 900000,
      circuitThreshold: 8,
      circuitCooldownMs: 60000,
      preferredModelIds: [],
      forbiddenModelIds: [],
      approvalTimeoutMs: 86400000,
      approvalPollIntervalMs: 4500, // edited
      watchSchedulerPollMs: 60000,
    });
  });

  it('sends edited preferred and forbidden model lists as arrays', async () => {
    postMock.mockResolvedValueOnce(loadResponse(null));
    postMock.mockResolvedValueOnce({ data: {} });
    renderSettings();

    await waitFor(() => expect(screen.getByLabelText(/preferred models/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/preferred models/i), {
      target: { value: 'openai:gpt-4o, anthropic:claude-3' },
    });
    fireEvent.change(screen.getByLabelText(/forbidden models/i), {
      target: { value: 'evil:model' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      const saveCall = postMock.mock.calls.find((call) => call[0] === '/artifacts/documents');
      expect(saveCall?.[1].data.preferredModelIds).toEqual(['openai:gpt-4o', 'anthropic:claude-3']);
      expect(saveCall?.[1].data.forbiddenModelIds).toEqual(['evil:model']);
    });
  });

  it('shows an error banner when loading fails', async () => {
    postMock.mockRejectedValueOnce(new Error('network down'));
    renderSettings();

    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
  });

  it('shows an error banner when saving fails', async () => {
    postMock.mockResolvedValueOnce(loadResponse(null));
    postMock.mockRejectedValueOnce(new Error('save rejected'));
    renderSettings();

    await waitFor(() => expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(screen.getByText(/save rejected/i)).toBeInTheDocument());
  });
});
