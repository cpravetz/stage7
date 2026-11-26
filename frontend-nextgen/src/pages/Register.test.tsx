import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Register from './Register';
import { useAuthStore } from '../stores/authStore';

const renderRegister = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<div>Dashboard after registration</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );

const fillForm = async (password = 'long-enough-password') => {
  await userEvent.type(screen.getByPlaceholderText('Name'), 'Chris');
  await userEvent.type(screen.getByPlaceholderText('Email'), 'chris@example.com');
  await userEvent.type(screen.getByPlaceholderText(/Password/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
};

describe('Register page', () => {
  const originalRegister = useAuthStore.getState().register;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAuthStore.setState({ register: originalRegister });
  });

  it('submits valid input and navigates to the dashboard with a stored session', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ register });

    renderRegister();
    await fillForm();

    await waitFor(() => {
      expect(screen.getByText('Dashboard after registration')).toBeInTheDocument();
    });
    expect(register).toHaveBeenCalledWith('Chris', 'chris@example.com', 'long-enough-password');
  });

  it('shows the duplicate-email message inline on a 409', async () => {
    useAuthStore.setState({
      register: vi.fn().mockRejectedValue(new Error('An account with this email already exists')),
    });

    renderRegister();
    await fillForm();

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('An account with this email already exists');
    });
    expect(screen.queryByText('Dashboard after registration')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toHaveValue('chris@example.com');
  });

  it('shows a short-password error inline without calling register', async () => {
    const register = vi.fn();
    useAuthStore.setState({ register });

    renderRegister();
    await fillForm('short');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password must be at least 8 characters'
    );
    expect(register).not.toHaveBeenCalled();
  });
});
