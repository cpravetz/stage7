// Central configuration file for the frontend

// API base URL - dynamically set based on current protocol and hostname
export const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5020`;

// WebSocket URL - dynamically set based on current protocol and hostname
export const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:5020`;

// Other configuration settings can be added here
