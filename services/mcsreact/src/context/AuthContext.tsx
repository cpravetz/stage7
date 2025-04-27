import React, { createContext, useContext, useState, useEffect } from 'react';
import { SecurityClient } from '../SecurityClient';
import { API_BASE_URL } from '../config';

// Define the context type
interface AuthContextType {
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => string | null;
}

// Create the context with default values
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create a provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const securityClient = SecurityClient.getInstance(API_BASE_URL);

  // Initialize authentication state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('[AuthContext] Initializing authentication...');
        setIsInitializing(true);
        
        // Check if we have a token
        const token = securityClient.getAccessToken();
        if (token) {
          console.log('[AuthContext] Found existing token, validating...');
          try {
            // Try to use the token to make an authenticated request
            await securityClient.refreshAccessToken();
            console.log('[AuthContext] Token is valid or was refreshed successfully');
            setIsAuthenticated(true);
          } catch (error) {
            console.log('[AuthContext] Token validation failed, attempting to initialize with default credentials');
            
            // Try to initialize with default credentials
            const initialized = await securityClient.initializeWithDefaultCredentials();
            setIsAuthenticated(initialized);
            
            if (initialized) {
              console.log('[AuthContext] Successfully authenticated with default credentials');
            } else {
              console.log('[AuthContext] Failed to authenticate with default credentials');
            }
          }
        } else {
          console.log('[AuthContext] No token found, attempting to initialize with default credentials');
          
          // Try to initialize with default credentials
          const initialized = await securityClient.initializeWithDefaultCredentials();
          setIsAuthenticated(initialized);
          
          if (initialized) {
            console.log('[AuthContext] Successfully authenticated with default credentials');
          } else {
            console.log('[AuthContext] Failed to authenticate with default credentials');
          }
        }
      } catch (error) {
        console.error('[AuthContext] Error initializing authentication:', error);
        setIsAuthenticated(false);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (email: string, password: string) => {
    try {
      await securityClient.login(email, password);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await securityClient.logout();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
      throw error;
    }
  };

  // Get token function
  const getToken = () => {
    return securityClient.getAccessToken();
  };

  // Provide the context value
  const contextValue: AuthContextType = {
    isAuthenticated,
    isInitializing,
    login,
    logout,
    getToken
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Create a hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
