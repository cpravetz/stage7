import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WebSocketProvider } from './context/WebSocketContext'; // Import WebSocketProvider

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
  </React.StrictMode>
);
