import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, IconButton } from '@mui/material/index.js';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Lead } from './types';

const getStatusColor = (status: Lead['status']) => {
  switch (status) {
    case 'New': return 'primary';
    case 'Contacted': return 'info';
    case 'Qualified': return 'success';
    case 'Unqualified': return 'error';
    default: return 'default';
  }
};

interface LeadManagementDashboardProps {
  leads: Lead[];
  onCreateLead: (lead: Lead) => void;
  onUpdateLead: (id: string, updates: Partial<Lead>) => void;
  onDeleteLead: (id: string) => void;
  sendMessage: (message: string) => void;
}

const LeadManagementDashboard: React.FC<LeadManagementDashboardProps> = ({ 
  leads, 
  onCreateLead, 
  onUpdateLead, 
  onDeleteLead, 
  sendMessage 
}) => {
  const handleCreateLead = () => {
    const newLead: Lead = {
      id: Date.now().toString(),
      name: 'New Lead',
      company: '',
      status: 'New',
      email: '',
      phone: '',
      source: 'Manual'
    };
    onCreateLead(newLead);
  };

  const handleStatusChange = (leadId: string, currentStatus: Lead['status']) => {
    const statusOrder: Lead['status'][] = ['New', 'Contacted', 'Qualified', 'Unqualified'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    
    if (currentIndex < statusOrder.length - 1) {
      const newStatus = statusOrder[currentIndex + 1];
      onUpdateLead(leadId, { status: newStatus });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Lead Management Dashboard
        </Typography>
        <Button 
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateLead}
        >
          New Lead
        </Button>
      </Box>
      
      {leads.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No leads available. Click "New Lead" to add your first lead.
        </Typography>
      ) : (
        <TableContainer component={Paper} elevation={2}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>{lead.name}</TableCell>
                  <TableCell>{lead.company}</TableCell>
                  <TableCell>
                    <Chip label={lead.status} color={getStatusColor(lead.status)} />
                  </TableCell>
                  <TableCell>{lead.email}</TableCell>
                  <TableCell>{lead.phone || '-'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <IconButton aria-label="edit" onClick={() => sendMessage(`Edit lead ${lead.id}`)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton aria-label="delete" onClick={() => onDeleteLead(lead.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      <Button 
                        variant="outlined"
                        size="small"
                        onClick={() => handleStatusChange(lead.id, lead.status)}
                        disabled={lead.status === 'Unqualified'}
                      >
                        Advance
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default LeadManagementDashboard;

