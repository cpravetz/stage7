import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Divider, Chip, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Button } from '@mui/material';
import { Assignment as AssignmentIcon, Visibility as VisibilityIcon, Edit as EditIcon, Add as AddIcon, Search as SearchIcon } from '@mui/icons-material';
import { customerSupportAssistantClient } from '../CustomerSupportAssistantClient';

interface TicketManagementDashboardProps {
  conversationId: string | undefined;
}

const TicketManagementDashboard: React.FC<TicketManagementDashboardProps> = ({ conversationId }) => {
  const [tickets, setTickets] = useState<Array<{
    id: string;
    subject: string;
    customer: string;
    status: string;
    priority: string;
    created: string;
    assignedTo: string;
  }>>([]);
  const [stats, setStats] = useState({
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    avgResponseTime: '0 hours',
    customerSatisfaction: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTicketData = async () => {
      if (!conversationId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch ticket data from backend via the support assistant client
        const contextData = await customerSupportAssistantClient.getContext(conversationId);

        // Extract ticket data from context
        const ticketItems = contextData.contextItems
          .filter(item => item.type === 'ticket')
          .map(ticket => {
            const ticketData = ticket as any; // Cast to any to access custom properties
            return {
              id: ticket.id,
              subject: ticket.title,
              customer: ticketData.customer || 'Unknown Customer',
              status: ticketData.status || 'Open',
              priority: ticketData.priority || 'Medium',
              created: ticketData.created || new Date().toISOString().split('T')[0],
              assignedTo: ticketData.assignedTo || 'Unassigned'
            };
          });

        // Extract stats data from context
        const statsItem = contextData.contextItems.find(item => item.type === 'support_stats');
        const statsData = statsItem ? (statsItem as any).content || {} : {};

        setTickets(ticketItems);

        setStats({
          open: statsData.open_tickets || 0,
          inProgress: statsData.in_progress_tickets || 0,
          resolved: statsData.resolved_tickets || 0,
          closed: statsData.closed_tickets || 0,
          avgResponseTime: statsData.avg_response_time || '0 hours',
          customerSatisfaction: statsData.customer_satisfaction || 0
        });

      } catch (error) {
        console.error('Error fetching ticket data:', error);
        setError('Failed to load ticket data from backend');
        
        // Fallback to empty data if API fails
        setTickets([]);
        setStats({
          open: 0,
          inProgress: 0,
          resolved: 0,
          closed: 0,
          avgResponseTime: '0 hours',
          customerSatisfaction: 0
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTicketData();
  }, [conversationId]);

  if (isLoading) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          <AssignmentIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
          Ticket Management Dashboard
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          <AssignmentIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
          Ticket Management Dashboard
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <AssignmentIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Ticket Management Dashboard
      </Typography>

      <Box display="flex" justifyContent="space-around" sx={{ mb: 3 }}>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="error.main">{stats.open}</Typography>
          <Typography variant="body2" color="text.secondary">Open Tickets</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="warning.main">{stats.inProgress}</Typography>
          <Typography variant="body2" color="text.secondary">In Progress</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="success.main">{stats.resolved}</Typography>
          <Typography variant="body2" color="text.secondary">Resolved</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold">{stats.closed}</Typography>
          <Typography variant="body2" color="text.secondary">Closed</Typography>
        </Box>
      </Box>

      <Box display="flex" justifyContent="space-around" sx={{ mb: 3 }}>
        <Box textAlign="center">
          <Typography variant="h6" fontWeight="bold">{stats.avgResponseTime}</Typography>
          <Typography variant="body2" color="text.secondary">Avg Response Time</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h6" fontWeight="bold">{stats.customerSatisfaction}/5</Typography>
          <Typography variant="body2" color="text.secondary">Customer Satisfaction</Typography>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ticket ID</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>{ticket.id}</TableCell>
                <TableCell>{ticket.subject}</TableCell>
                <TableCell>{ticket.customer}</TableCell>
                <TableCell>
                  <Chip
                    label={ticket.status}
                    color={ticket.status === 'Open' ? 'error' : ticket.status === 'In Progress' ? 'warning' : 'success'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={ticket.priority}
                    color={ticket.priority === 'High' ? 'error' : ticket.priority === 'Medium' ? 'warning' : 'info'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box display="flex" gap={1}>
                    <IconButton size="small"><VisibilityIcon /></IconButton>
                    <IconButton size="small"><EditIcon /></IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No tickets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button variant="contained" color="primary" startIcon={<AddIcon />}>
          Create New Ticket
        </Button>
        <Button variant="outlined" startIcon={<SearchIcon />}>
          Advanced Search
        </Button>
      </Box>
    </Paper>
  );
};

export default TicketManagementDashboard;


