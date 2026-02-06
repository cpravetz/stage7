import React from 'react';
import { Box, Typography, Paper, List, ListItem, Alert, AlertTitle, IconButton } from '@mui/material/index.js';
import { Close as CloseIcon } from '@mui/icons-material';

interface AlertNotification {
  id: string;
  type: 'warning' | 'info' | 'error' | 'success';
  message: string;
  timestamp: string;
}

interface AlertSystemProps {
  alerts: AlertNotification[];
  onDismissAlert: (alertId: string) => void;
}

const AlertSystem: React.FC<AlertSystemProps> = ({
  alerts = [],
  onDismissAlert
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Alert System ({alerts.length})
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        {alerts.length > 0 ? (
          <List sx={{ width: '100%' }}>
            {alerts.map((alertItem) => (
              <ListItem
                key={alertItem.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="close"
                    onClick={() => onDismissAlert(alertItem.id)}
                    size="small"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
              >
                <Alert severity={alertItem.type} sx={{ width: '100%', mb: 1 }}>
                  <Typography variant="body2">{alertItem.message}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {alertItem.timestamp}
                  </Typography>
                </Alert>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="textSecondary">
            No alerts at this time. You're all set!
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default AlertSystem;


