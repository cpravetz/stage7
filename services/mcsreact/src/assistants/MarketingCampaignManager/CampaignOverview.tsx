import React from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, IconButton } from '@mui/material/index.js';
import { Campaign } from './types';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

const getStatusChipColor = (status: Campaign['status']) => {
  switch (status) {
    case 'active':
      return 'primary';
    case 'paused':
      return 'warning';
    case 'completed':
      return 'success';
    case 'draft':
      return 'info';
    case 'scheduled':
      return 'secondary';
    default:
      return 'default';
  }
};

interface CampaignOverviewProps {
  campaigns: Campaign[];
  onCreateCampaign: (campaign: Campaign) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
  onDeleteCampaign: (id: string) => void;
  sendMessage: (message: string) => Promise<any>;
}

const CampaignOverview: React.FC<CampaignOverviewProps> = ({
  campaigns,
  onCreateCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  sendMessage
}) => {
  const handleCreateCampaign = () => {
    const newCampaign: Campaign = {
      id: Date.now().toString(),
      name: 'New Campaign',
      status: 'draft',
      performance: 0,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: 0,
      targetAudience: '',
      channels: [],
      objectives: []
    };
    onCreateCampaign(newCampaign);
  };

  const handleUpdateStatus = (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    if (campaign) {
      const newStatuses: Record<Campaign['status'], Campaign['status']> = {
        'draft': 'active',
        'active': 'paused',
        'paused': 'completed',
        'completed': 'draft',
        'scheduled': 'active'
      };
      const newStatus = newStatuses[campaign.status] || 'draft';
      onUpdateCampaign(id, { status: newStatus });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Campaign Overview
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateCampaign}
        >
          Create Campaign
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Campaign Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Performance</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell>{campaign.name}</TableCell>
                <TableCell>
                  <Chip 
                    label={campaign.status} 
                    color={getStatusChipColor(campaign.status)} 
                    onClick={() => handleUpdateStatus(campaign.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell>{campaign.performance}%</TableCell>
                <TableCell>
                  <IconButton aria-label="edit" onClick={() => sendMessage(`Edit campaign ${campaign.id}`)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton aria-label="delete" onClick={() => onDeleteCampaign(campaign.id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default CampaignOverview;


