import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress, Alert } from '@mui/material/index.js';
import { SupportTicket } from './types'; // Import SupportTicket from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface TicketManagementCenterProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const getStatusColor = (status: SupportTicket['status']) => {
  switch (status) {
    case 'Open': return 'error';
    case 'Pending': return 'warning';
    case 'Closed': return 'success';
    default: return 'default';
  }
};

const getPriorityColor = (priority: SupportTicket['priority']) => {
  switch (priority) {
    case 'Low': return 'success';
    case 'Medium': return 'warning';
    case 'High': return 'error';
    default: return 'default';
  }
};

const TicketManagementCenter: React.FC<TicketManagementCenterProps> = ({ conversationId, client, setError }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTickets = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getTickets(conversationId);
      setTickets(data);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError(`Error fetching tickets: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Tickets...</Typography>
      </Box>
    );
  }

  if (tickets.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Ticket Management Center
        </Typography>
        <Alert severity="info">No tickets found.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Ticket Management Center
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Subject</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Assigned Agent</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>{ticket.subject}</TableCell>
                <TableCell>{ticket.customerName}</TableCell>
                <TableCell>{ticket.assignedAgent}</TableCell>
                <TableCell>
                  <Chip label={ticket.status} color={getStatusColor(ticket.status)} />
                </TableCell>
                <TableCell>
                  <Chip label={ticket.priority} color={getPriorityColor(ticket.priority)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default TicketManagementCenter;


