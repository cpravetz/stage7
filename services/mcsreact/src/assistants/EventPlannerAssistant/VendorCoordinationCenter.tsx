import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, Card } from '@mui/material/index.js';
import { Business as BusinessIcon, Add as AddIcon } from '@mui/icons-material';
import { Vendor } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface VendorCoordinationCenterProps {
  vendors: Vendor[];
  sendMessage: (message: string) => Promise<void>;
}

const VendorCoordinationCenter: React.FC<VendorCoordinationCenterProps> = ({ vendors, sendMessage }) => {
  const getStatusColor = (status: Vendor['status']) => {
    switch (status) {
      case 'Hired': return 'success';
      case 'Pending': return 'warning';
      case 'Rejected': return 'error';
      default: return 'default';
    }
  };

  const handleUpdateStatus = (vendorId: string, newStatus: Vendor['status']) => {
    alert(`Updating status for vendor ${vendorId} to ${newStatus}. (Mock Action)`);
    // In a real app, you would update state or call an API
  };

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <BusinessIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Vendor Coordination Center
      </Typography>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Vendor Name</TableCell>
              <TableCell>Service</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell>{vendor.name}</TableCell>
                <TableCell>{vendor.service}</TableCell>
                <TableCell>{vendor.contact}</TableCell>
                <TableCell>
                  <Chip label={vendor.status} color={getStatusColor(vendor.status)} />
                </TableCell>
                <TableCell>
                  {vendor.status === 'Pending' && (
                    <Button variant="outlined" size="small" onClick={() => handleUpdateStatus(vendor.id, 'Hired')}>Approve</Button>
                  )}
                  {vendor.status === 'Hired' && (
                    <Button variant="outlined" size="small" onClick={() => handleUpdateStatus(vendor.id, 'Pending')}>Revert</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        startIcon={<AddIcon />}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.scheduleEventCommunication(missionId, 'client-id', 'conversation-id', { optimizationGoal: 'costReduction' });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Add Vendor
      </Button>
    </Card>
  );
};

export default VendorCoordinationCenter;


