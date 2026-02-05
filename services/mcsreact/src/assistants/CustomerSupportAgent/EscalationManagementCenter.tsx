import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Chip, CircularProgress, Alert } from '@mui/material/index.js';
import { SupportTicket } from './types'; // Import SupportTicket from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface EscalationManagementCenterProps {
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

const EscalationManagementCenter: React.FC<EscalationManagementCenterProps> = ({ conversationId, client, setError }) => {
  const [escalatedTickets, setEscalatedTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEscalatedTickets = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getEscalatedTickets(conversationId);
      setEscalatedTickets(data);
    } catch (err) {
      console.error('Error fetching escalated tickets:', err);
      setError(`Error fetching escalated tickets: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalatedTickets();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  const handleAssign = async (ticketId: string) => {
    if (!conversationId) return;
    const assignedAgent = prompt('Enter agent to assign to:'); // Placeholder for agent selection
    if (assignedAgent) {
      try {
        await client.assignEscalatedTicket(conversationId, ticketId, assignedAgent);
        alert(`Ticket ${ticketId} assigned to ${assignedAgent}.`);
        fetchEscalatedTickets(); // Re-fetch to update the list
      } catch (err) {
        console.error('Error assigning ticket:', err);
        setError(`Error assigning ticket: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleUpdate = async (ticketId: string, currentStatus: SupportTicket['status']) => {
    if (!conversationId) return;
    const newStatus = prompt(`Enter new status for ticket ${ticketId} (e.g., Open, Pending, Closed):`, currentStatus); // Placeholder for status selection
    if (newStatus && ['Open', 'Pending', 'Closed'].includes(newStatus)) {
      try {
        await client.updateEscalatedTicketStatus(conversationId, ticketId, newStatus as SupportTicket['status']);
        alert(`Ticket ${ticketId} status updated to ${newStatus}.`);
        fetchEscalatedTickets(); // Re-fetch to update the list
      } catch (err) {
        console.error('Error updating ticket status:', err);
        setError(`Error updating ticket status: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (newStatus !== null) {
      alert('Invalid status. Please enter Open, Pending, or Closed.');
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Escalated Tickets...</Typography>
      </Box>
    );
  }

  if (escalatedTickets.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Escalation Management Center
        </Typography>
        <Alert severity="info">No escalated tickets found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Escalation Management Center
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Subject</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Assigned To</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {escalatedTickets.map((ticket) => (
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
                <TableCell>
                  <Button variant="outlined" size="small" sx={{ mr: 1 }} onClick={() => handleAssign(ticket.id)}>Assign</Button>
                  <Button variant="outlined" size="small" onClick={() => handleUpdate(ticket.id, ticket.status)}>Update</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default EscalationManagementCenter;


