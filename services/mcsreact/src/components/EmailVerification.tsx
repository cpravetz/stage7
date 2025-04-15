import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Email verification component
 * Verifies a user's email using the token from the URL
 */
const EmailVerification: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL query parameters
        const params = new URLSearchParams(location.search);
        const token = params.get('token');

        if (!token) {
          setError('Verification token is missing');
          setLoading(false);
          return;
        }

        // Send verification request
        const securityUrl = process.env.REACT_APP_SECURITY_URL || 'http://localhost:5010';
        const response = await axios.post(`${securityUrl}/verify-email`, { token });

        setSuccess(true);
        setLoading(false);
      } catch (error) {
        console.error('Email verification error:', error);
        setError('Failed to verify email. The token may be invalid or expired.');
        setLoading(false);
      }
    };

    verifyEmail();
  }, [location]);

  const handleGoToLogin = () => {
    navigate('/login');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 3,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: 500,
          width: '100%',
        }}
      >
        <Typography variant="h4" gutterBottom>
          Email Verification
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 4 }}>
            <CircularProgress />
            <Typography variant="body1" sx={{ mt: 2 }}>
              Verifying your email...
            </Typography>
          </Box>
        )}

        {success && (
          <Box sx={{ mt: 2, width: '100%' }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              Your email has been successfully verified!
            </Alert>
            <Typography variant="body1" paragraph>
              Thank you for verifying your email address. You can now log in to your account.
            </Typography>
            <Button variant="contained" color="primary" onClick={handleGoToLogin} fullWidth>
              Go to Login
            </Button>
          </Box>
        )}

        {error && (
          <Box sx={{ mt: 2, width: '100%' }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
            <Typography variant="body1" paragraph>
              There was a problem verifying your email. Please try again or contact support.
            </Typography>
            <Button variant="contained" color="primary" onClick={handleGoToLogin} fullWidth>
              Go to Login
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default EmailVerification;
