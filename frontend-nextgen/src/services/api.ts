import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // The one client-side refresh path (the main.tsx fetch wrapper was
    // removed). Only a session-expiry 401 — a request made with a stored
    // token — enters the recovery cycle; a 401 from the login or register
    // call itself must surface on the form, not redirect the page.
    if (error.response?.status === 401 && !original._retry && localStorage.getItem('token')) {
      original._retry = true;
      const token = localStorage.getItem('token');
      try {
        const res = await axios.post('/api/auth/refresh', { token });
        const newToken = res.data?.token;
        if (newToken) {
          localStorage.setItem('token', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
        console.error('[api] Token refresh succeeded but returned no token');
      } catch (refreshError) {
        console.error('[api] Token refresh failed', refreshError);
      }
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
