import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import '@testing-library/jest-dom';
import App from '../src/App';
import { SecurityClient } from '@cktmcs/shared';
import axios from 'axios';

jest.mock('axios');
jest.mock('@cktmcs/shared', () => ({
  SecurityClient: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue('fake-token'),
  })),
}));

describe('App Component', () => {
  beforeEach(() => {
    localStorage.clear();
    (axios.create as jest.Mock).mockReturnValue({
      interceptors: {
        request: { use: jest.fn() },
      },
    });
  });

  test('renders login component when not authenticated', () => {
    render(<App />);
    expect(screen.getByText(/Login/i)).toBeInTheDocument();
  });

  test('handles successful login', async () => {
    render(<App />);
    
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText(/Login/i));

    await waitFor(() => {
      expect(screen.getByText(/Send/i)).toBeInTheDocument();
    });
  });

  test('renders main app components when authenticated', () => {
    localStorage.setItem('authToken', 'fake-token');
    render(<App />);

    expect(screen.getByText(/Send/i)).toBeInTheDocument();
    expect(screen.getByText(/Save/i)).toBeInTheDocument();
    expect(screen.getByText(/Load/i)).toBeInTheDocument();
    expect(screen.getByText(/Abort/i)).toBeInTheDocument();
  });

  test('handles sending a message', async () => {
    localStorage.setItem('authToken', 'fake-token');
    (axios.post as jest.Mock).mockResolvedValue({});
    
    render(<App />);

    const input = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(input, { target: { value: 'Hello, AI!' } });
    fireEvent.click(screen.getByText(/Send/i));

    await waitFor(() => {
      expect(screen.getByText(/User: Hello, AI!/i)).toBeInTheDocument();
    });
  });

  test('handles mission control actions', async () => {
    localStorage.setItem('authToken', 'fake-token');
    (axios.post as jest.Mock).mockResolvedValue({});
    
    render(<App />);

    fireEvent.click(screen.getByText(/Save/i));

    await waitFor(() => {
      expect(screen.getByText(/System: Sent save request to MissionControl./i)).toBeInTheDocument();
    });
  });

  // Add more tests as needed for other functionalities
});