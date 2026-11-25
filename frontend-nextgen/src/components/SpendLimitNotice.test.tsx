import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSpendLimitStore } from '../stores/spendLimitStore';
import { ApiError } from '../utils/api';
import SpendLimitNotice from './SpendLimitNotice';

const refusal = {
  error: 'SPEND_LIMIT_REACHED' as const,
  period: 'month' as const,
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

describe('SpendLimitNotice', () => {
  afterEach(() => {
    useSpendLimitStore.setState({ refusal: null });
  });

  it('renders from a 429 refusal payload, naming the pause and resumption time', () => {
    useSpendLimitStore.setState({ refusal });

    render(<SpendLimitNotice />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('LLM spending limit reached');
    expect(alert).toHaveTextContent('Model activity is paused');
    expect(alert).toHaveTextContent('≈ $25.03 of $25.00 used this month (estimated)');
    expect(alert).toHaveTextContent('Activity resumes Dec 1, 00:00 UTC');
  });

  it('renders nothing when no refusal was recorded', () => {
    render(<SpendLimitNotice />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears after the store flag is reset by a successful completion', () => {
    useSpendLimitStore.setState({ refusal });
    const { rerender } = render(<SpendLimitNotice />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    useSpendLimitStore.getState().clearRefusal();
    rerender(<SpendLimitNotice />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays hidden when the recorded error is not the refusal contract', () => {
    useSpendLimitStore.getState().recordRefusalFromError(
      new ApiError(400, 'Bad Request', '/api/brain/complete', refusal),
    );
    expect(useSpendLimitStore.getState().refusal).toBeNull();

    render(<SpendLimitNotice />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
