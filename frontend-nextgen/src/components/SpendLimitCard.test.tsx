import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/apiClient';
import SpendLimitCard from './SpendLimitCard';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedDelete = vi.mocked(apiClient.delete);

function meResponse(limit: { limit: number; period: string } | null) {
  return {
    limit,
    usage: limit
      ? { period: limit.period, periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', limit: limit.limit, spent: 12.4 }
      : null,
  };
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedDelete.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SpendLimitCard', () => {
  it('renders the current limit, period, and estimated usage', async () => {
    mockedGet.mockResolvedValue(meResponse({ limit: 25, period: 'month' }));

    render(<SpendLimitCard />);

    await waitFor(() => expect(mockedGet).toHaveBeenCalledWith('/api/brain/spend-limits/me'));
    expect(await screen.findByText('LLM Spending Limit')).toBeInTheDocument();
    expect(screen.getByTestId('spend-usage'))
      .toHaveTextContent('≈ $12.40 of $25.00 used this month (estimated)');
    expect(screen.getByLabelText('Max estimated spend (USD, estimated)')).toHaveValue(25);
    expect(screen.getByLabelText('Spending limit period')).toHaveValue('month');
    expect(screen.getByRole('button', { name: 'Clear Limit' })).toBeInTheDocument();
  });

  it('renders the empty state when no limit is set', async () => {
    mockedGet.mockResolvedValue(meResponse(null));

    render(<SpendLimitCard />);

    expect(await screen.findByText('No spending limit set. Model activity is uncapped.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear Limit' })).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a recovery action', async () => {
    mockedGet.mockRejectedValue(new Error('API error: 503 Service Unavailable'));

    render(<SpendLimitCard />);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('API error: 503 Service Unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('retry by reloading the page');
  });

  it('saves the limit through PUT with the entered amount and period', async () => {
    mockedGet.mockResolvedValue(meResponse(null));
    mockedPut.mockResolvedValue({ limit: { userId: 'usr_1', limit: 30, period: 'week', currency: 'USD', updatedAt: '' } });

    const user = userEvent.setup();
    render(<SpendLimitCard />);
    await screen.findByText('LLM Spending Limit');

    await user.type(screen.getByLabelText('Max estimated spend (USD, estimated)'), '30');
    await user.selectOptions(screen.getByLabelText('Spending limit period'), 'week');
    await user.click(screen.getByRole('button', { name: 'Save Limit' }));

    await waitFor(() => expect(mockedPut).toHaveBeenCalledWith(
      '/api/brain/spend-limits/me',
      { limit: 30, period: 'week' },
    ));
  });

  it('reverts and shows the error state when the save fails', async () => {
    mockedGet.mockResolvedValue(meResponse({ limit: 25, period: 'month' }));
    mockedPut.mockRejectedValue(new Error('API error: 503 Service Unavailable'));

    const user = userEvent.setup();
    render(<SpendLimitCard />);
    await screen.findByTestId('spend-usage');

    await user.clear(screen.getByLabelText('Max estimated spend (USD, estimated)'));
    await user.type(screen.getByLabelText('Max estimated spend (USD, estimated)'), '40');
    await user.click(screen.getByRole('button', { name: 'Save Limit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('API error: 503 Service Unavailable');
    // The optimistic update is rolled back to the persisted value.
    await waitFor(() => expect(screen.getByTestId('spend-usage'))
      .toHaveTextContent('≈ $12.40 of $25.00 used this month (estimated)'));
    expect(screen.getByLabelText('Max estimated spend (USD, estimated)')).toHaveValue(40);
  });

  it('rejects a save without a positive amount', async () => {
    mockedGet.mockResolvedValue(meResponse(null));

    const user = userEvent.setup();
    render(<SpendLimitCard />);
    await screen.findByText('LLM Spending Limit');

    await user.click(screen.getByRole('button', { name: 'Save Limit' }));

    expect(mockedPut).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Enter a positive USD amount for the spending limit.');
  });

  it('clears the limit through DELETE', async () => {
    mockedGet.mockResolvedValue(meResponse({ limit: 25, period: 'month' }));
    mockedDelete.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SpendLimitCard />);
    await screen.findByTestId('spend-usage');

    await user.click(screen.getByRole('button', { name: 'Clear Limit' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('/api/brain/spend-limits/me'));
    expect(screen.queryByRole('button', { name: 'Clear Limit' })).not.toBeInTheDocument();
    // Recorded usage persists; only the cap is removed.
    expect(await screen.findByTestId('spend-usage'))
      .toHaveTextContent('Estimated usage this month: $12.40 (estimated)');
  });

  it('reverts the cleared limit and shows the error when DELETE fails', async () => {
    mockedGet.mockResolvedValue(meResponse({ limit: 25, period: 'month' }));
    mockedDelete.mockRejectedValue(new Error('API error: 500 Internal Server Error'));

    const user = userEvent.setup();
    render(<SpendLimitCard />);
    await screen.findByTestId('spend-usage');

    await user.click(screen.getByRole('button', { name: 'Clear Limit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('API error: 500 Internal Server Error');
    expect(screen.getByTestId('spend-usage'))
      .toHaveTextContent('≈ $12.40 of $25.00 used this month (estimated)');
    expect(screen.getByRole('button', { name: 'Clear Limit' })).toBeInTheDocument();
  });
});
