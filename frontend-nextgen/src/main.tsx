import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('token');
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await originalFetch(input, { ...init, headers });
  if (response.status === 401 && token) {
    const refresh = await originalFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (refresh.ok) {
      const data = await refresh.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set('Authorization', `Bearer ${data.token}`);
        return originalFetch(input, { ...init, headers: retryHeaders });
      }
    }
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
