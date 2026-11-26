import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

describe('Login page', () => {
  it('offers a sign-up link to /register', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Sign up' });
    expect(link).toHaveAttribute('href', '/register');
  });
});
