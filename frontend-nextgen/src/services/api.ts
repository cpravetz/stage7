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
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await axios.post('/api/auth/refresh', { token });
          const newToken = res.data?.token;
          if (newToken) {
            localStorage.setItem('token', newToken);
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
          }
        } catch {
          // fall through to logout
        }
      }
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
