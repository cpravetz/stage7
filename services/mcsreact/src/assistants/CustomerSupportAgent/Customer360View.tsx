import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Divider, CircularProgress, Alert } from '@mui/material/index.js';
import { Customer, SupportTicket } from '../types'; // Import Customer and SupportTicket from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface Customer360ViewProps {
  conversationId: string | null;
  customerId: string | null; // Assuming a customerId will be passed to view a specific customer
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const Customer360View: React.FC<Customer360ViewProps> = ({ conversationId, customerId, client, setError }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomerData = async () => {
    if (!conversationId || !customerId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getCustomer360View(conversationId, customerId);
      setCustomer(data);
    } catch (err) {
      console.error('Error fetching customer 360 view:', err);
      setError(`Error fetching customer 360 view: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [conversationId, customerId, client]); // Re-fetch when conversationId, customerId, or client changes

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Customer Data...</Typography>
      </Box>
    );
  }

  if (!customer) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Customer 360 View
        </Typography>
        <Alert severity="info">No customer selected or data found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Customer 360 View
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Customer Details
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="Name" secondary={customer.name} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Company" secondary={customer.company} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Email" secondary={customer.email} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Phone" secondary={customer.phone} />
              </ListItem>
            </List>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <List dense>
              {customer.recentActivity.map((activity, index) => (
                <ListItem key={index}>
                  <ListItemText primary={activity} />
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Recent Tickets
            </Typography>
            <List dense>
              {customer.recentTickets.map((ticket) => (
                <ListItem key={ticket.id}>
                  <ListItemText
                    primary={ticket.subject}
                    secondary={`Status: ${ticket.status} | Priority: ${ticket.priority}`}
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default Customer360View;


