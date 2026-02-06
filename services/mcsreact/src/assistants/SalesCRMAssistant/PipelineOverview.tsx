import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Chip, Button, IconButton } from '@mui/material/index.js';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Deal } from './types';

const getStageColor = (stage: Deal['stage']) => {
  switch (stage) {
    case 'Lead': return 'default';
    case 'Qualification': return 'info';
    case 'Proposal': return 'primary';
    case 'Negotiation': return 'warning';
    case 'Closed Won': return 'success';
    case 'Closed Lost': return 'error';
    default: return 'default';
  }
};

interface PipelineOverviewProps {
  deals: Deal[];
  onCreateDeal: (deal: Deal) => void;
  onUpdateDeal: (id: string, updates: Partial<Deal>) => void;
  onDeleteDeal: (id: string) => void;
  sendMessage: (message: string) => void;
}

const PipelineOverview: React.FC<PipelineOverviewProps> = ({ 
  deals, 
  onCreateDeal, 
  onUpdateDeal, 
  onDeleteDeal, 
  sendMessage 
}) => {
  const dealsByStage = deals.reduce((acc, deal) => {
    (acc[deal.stage] = acc[deal.stage] || []).push(deal);
    return acc;
  }, {} as Record<Deal['stage'], Deal[]>);

  const handleCreateDeal = () => {
    const newDeal: Deal = {
      id: Date.now().toString(),
      name: 'New Deal',
      stage: 'Lead',
      value: 0,
      expectedCloseDate: new Date().toISOString().split('T')[0],
      company: '',
      contactName: ''
    };
    onCreateDeal(newDeal);
  };

  const handleMoveStage = (dealId: string, currentStage: Deal['stage'], direction: 'forward' | 'backward') => {
    const stageOrder: Deal['stage'][] = ['Lead', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
    const currentIndex = stageOrder.indexOf(currentStage);
    
    if (direction === 'forward' && currentIndex < stageOrder.length - 1) {
      const newStage = stageOrder[currentIndex + 1];
      onUpdateDeal(dealId, { stage: newStage });
    } else if (direction === 'backward' && currentIndex > 0) {
      const newStage = stageOrder[currentIndex - 1];
      onUpdateDeal(dealId, { stage: newStage });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Sales Pipeline Overview
        </Typography>
        <Button 
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateDeal}
        >
          New Deal
        </Button>
      </Box>
      
      {deals.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No deals in pipeline. Click "New Deal" to add your first deal.
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {Object.entries(dealsByStage).map(([stage, deals]) => (
            <Grid item xs={12} sm={6} md={4} key={stage}>
              <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    {stage} ({deals.length})
                  </Typography>
                  <Chip label={deals.length} color={getStageColor(stage as Deal['stage'])} />
                </Box>
                <List>
                  {deals.map((deal) => (
                    <ListItem 
                      key={deal.id} 
                      disablePadding 
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <IconButton edge="end" aria-label="edit" onClick={() => sendMessage(`Edit deal ${deal.id}`)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton edge="end" aria-label="delete" onClick={() => onDeleteDeal(deal.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemText
                        primary={deal.name}
                        secondary={
                          <React.Fragment>
                            <Typography component="span" variant="body2" color="text.primary">
                              ${deal.value} - {deal.company || 'No company'}
                            </Typography>
                            <br />
                            <Typography component="span" variant="body2" color="text.secondary">
                              Close: {deal.expectedCloseDate}
                            </Typography>
                          </React.Fragment>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default PipelineOverview;


