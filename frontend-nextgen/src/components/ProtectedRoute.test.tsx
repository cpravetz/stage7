import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../stores/authStore';

const renderProtected = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<ProtectedRoute />}>
          <Route index element={<div>App content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  afterEach(() => {
    cleanup();
    localStorage.removeItem('token');
    useAuthStore.setState({ token: null, user: null });
  });

  it('redirects to /login when there is no token', () => {
    useAuthStore.setState({ token: null });

    renderProtected();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('renders the guarded page when a token exists', () => {
    localStorage.setItem('token', 'tok');
    useAuthStore.setState({ token: 'tok' });

    renderProtected();

    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});
