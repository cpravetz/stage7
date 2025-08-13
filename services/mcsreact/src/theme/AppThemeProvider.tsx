import React from 'react';
import { ThemeProvider as ThemeContextProvider } from './ThemeContext';
import { ThemeProvider as MuiThemeProvider } from './MuiThemeProvider';
import { SnackbarProvider } from 'notistack';

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeContextProvider>
      <MuiThemeProvider>
        <SnackbarProvider 
          maxSnack={3} 
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          autoHideDuration={5000}
        >
          {children}
        </SnackbarProvider>
      </MuiThemeProvider>
    </ThemeContextProvider>
  );
};
