import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Divider, Button, IconButton } from '@mui/material/index.js';
import { Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { Customer, SalesActivity, Deal } from './types';

interface Customer360ViewProps {
  customers: Customer[];
  onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
  onCreateActivity: (activity: SalesActivity) => void;
  sendMessage: (message: string) => void;
}

const Customer360View: React.FC<Customer360ViewProps> = ({ 
  customers, 
  onUpdateCustomer, 
  onCreateActivity, 
  sendMessage 
}) => {
  const selectedCustomer = customers.length > 0 ? customers[0] : null;

  const handleCreateActivity = () => {
    if (!selectedCustomer) return;
    
    const newActivity: SalesActivity = {
      id: Date.now().toString(),
      type: 'Call',
      date: new Date().toISOString().split('T')[0],
      description: `Follow-up call with ${selectedCustomer.name}`,
      relatedTo: selectedCustomer.id,
      outcome: 'Positive'
    };
    onCreateActivity(newActivity);
  };

  if (!selectedCustomer) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Customer 360° View
        </Typography>
        <Typography variant="body1" color="text.secondary">
          No customers available.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Customer 360° View
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => sendMessage(`Edit customer ${selectedCustomer.id}`)}
            size="small"
          >
            Edit
          </Button>
          <Button 
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateActivity}
            size="small"
          >
            Log Activity
          </Button>
        </Box>
      </Box>
      
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Customer Details
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="Name" secondary={selectedCustomer.name} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Company" secondary={selectedCustomer.company} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Email" secondary={selectedCustomer.email} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Phone" secondary={selectedCustomer.phone || '-'} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Lifetime Value" secondary={`$${selectedCustomer.lifetimeValue}`} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Last Purchase" secondary={selectedCustomer.lastPurchaseDate || '-'} />
              </ListItem>
            </List>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Activity data would be displayed here
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Past Deals
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Deal history would be displayed here
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default Customer360View;


