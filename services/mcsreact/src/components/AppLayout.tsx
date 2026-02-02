import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SnackbarProvider } from 'notistack';
import { CircularProgress, Box, Typography } from '@mui/material/index.js';

const AppLayout: React.FC = () => {
  return (
    <SnackbarProvider maxSnack={3}>
      <AuthProvider>
        <AuthInitializer>
          {/* WebSocketProvider is already at the root level in index.tsx, do not wrap again */}
          <Outlet />
        </AuthInitializer>
      </AuthProvider>
    </SnackbarProvider>
  );
};

// Component to handle authentication initialization
const AuthInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const { isInitializing, isAuthenticated } = useAuth();

  useEffect(() => {
    // When authentication initialization is complete, mark as ready
    if (!isInitializing) {
      setIsReady(true);
    }
  }, [isInitializing]);

  if (!isReady) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Initializing application...
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};

export default AppLayout;
