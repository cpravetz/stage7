import React, { useState } from 'react';
import { Box, Button, TextField, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Password reset component
 * Allows users to reset their password using a token from the URL
 */
const PasswordReset: React.FC = () => {
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Get token from URL query parameters
  const params = new URLSearchParams(location.search);
  const token = params.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    if (!token) {
      setError('Reset token is missing');
      return;
    }

    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Send reset request
      const securityUrl = process.env.REACT_APP_SECURITY_URL || 'http://localhost:5010';
      await axios.post(`${securityUrl}/reset-password`, {
        token,
        newPassword
      });

      setSuccess(true);
      setLoading(false);
    } catch (error) {
      console.error('Password reset error:', error);
      setError('Failed to reset password. The token may be invalid or expired.');
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

        {!token && (
          <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
            Reset token is missing. Please use the link from the email.
          </Alert>
        )}

        {!success && token && (
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              name="newPassword"
              label="New Password"
              type="password"
              id="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? <CircularProgress size={24} /> : 'Reset Password'}
            </Button>
          </Box>
        )}

        {success && (
          <Box sx={{ mt: 2, width: '100%' }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              Your password has been successfully reset!
            </Alert>
            <Typography variant="body1" paragraph>
              You can now log in with your new password.
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

export default PasswordReset;
