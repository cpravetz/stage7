import { create } from 'zustand';
import axios from 'axios';
import api from '../services/api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  /** Login responses carry the user's tenant; the Vault scopes secrets by it. */
  tenantId?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  login: async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    localStorage.setItem('token', data.token);
    set({ token: data.token, user: data.user });
  },
  register: async (name, email, password) => {
    try {
      const res = await api.post('/auth/register', { name, email, password });
      localStorage.setItem('token', res.data.token);
      set({ token: res.data.token, user: res.data.user });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          throw new Error('An account with this email already exists');
        }
        const message = (err.response?.data as { error?: string } | undefined)?.error;
        throw new Error(message || 'Registration failed');
      }
      throw err;
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },
  setToken: (token: string) => {
    localStorage.setItem('token', token);
    set({ token });
  },
}));

/**
 * The tenant the authenticated user's token belongs to. Prefers the login
 * response's `user.tenantId`; after a page refresh only the token survives in
 * localStorage, so fall back to the token's own claims — the same tenant the
 * gateway and Vault verify. Returns null when there is no session.
 */
export function getAuthTenantId(): string | null {
  const { token, user } = useAuthStore.getState();
  if (user?.tenantId) return user.tenantId;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.tenantId === 'string' && claims.tenantId ? claims.tenantId : null;
  } catch {
    return null;
  }
}
