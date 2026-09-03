import { useAuthStore } from '../stores/authStore';

const api = async (path: string, options?: RequestInit) => {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

export const apiClient = {
  get: <T>(path: string): Promise<T> => api(path),
  post: <T>(path: string, body: unknown): Promise<T> => api(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown): Promise<T> => api(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string): Promise<void> => api(path, { method: 'DELETE' }),
};
