import React, { useState } from 'react';
import { Box, Button, TextField, Typography, CircularProgress, Alert, Paper } from '@mui/material/index.js';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Request password reset component
 * Allows users to request a password reset email
 */
const RequestPasswordReset: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Send request
      const securityUrl = process.env.REACT_APP_SECURITY_URL || 'http://localhost:5010';
      await axios.post(`${securityUrl}/request-password-reset`, { email });

      setSuccess(true);
      setLoading(false);
    } catch (error) {
      console.error('Password reset request error:', error);
      // Don't show specific errors to prevent email enumeration
      setSuccess(true); // Always show success even on error
      setLoading(false);
    }
  };

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
          Reset Password
        </Typography>

        {!success && (
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, width: '100%' }}>
            <Typography variant="body1" paragraph>
              Enter your email address and we'll send you a link to reset your password.
            </Typography>
            
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Send Reset Link'}
            </Button>
            
            <Button
              fullWidth
              variant="text"
              onClick={handleGoToLogin}
              sx={{ mt: 1 }}
              disabled={loading}
            >
              Back to Login
            </Button>
          </Box>
        )}

        {success && (
          <Box sx={{ mt: 2, width: '100%' }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              If an account exists with that email, we've sent a password reset link.
            </Alert>
            <Typography variant="body1" paragraph>
              Please check your email and follow the instructions to reset your password.
              The link will expire in 1 hour.
            </Typography>
            <Button variant="contained" color="primary" onClick={handleGoToLogin} fullWidth>
              Back to Login
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default RequestPasswordReset;
