import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid, Chip } from '@mui/material/index.js';

interface SalaryNegotiationProps {
  jobOfferDetails: {
    company: string;
    position: string;
    salary: number;
    benefits: string;
    status: 'Received' | 'Negotiating' | 'Accepted' | 'Rejected';
  } | null;
  marketAnalysis: {
    averageSalary: number;
    salaryRange: string;
  } | null;
  negotiationStrategy: string[] | null;
  onReceiveOffer: () => void;
  onAnalyzeOffer: () => void;
  onDevelopStrategy: () => void;
}

const SalaryNegotiation: React.FC<SalaryNegotiationProps> = ({
  jobOfferDetails,
  marketAnalysis,
  negotiationStrategy,
  onReceiveOffer,
  onAnalyzeOffer,
  onDevelopStrategy,
}) => {
  const getOfferStatusColor = (status: string) => {
    switch (status) {
      case 'Received': return 'info';
      case 'Negotiating': return 'warning';
      case 'Accepted': return 'success';
      case 'Rejected': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Salary Negotiation and Offer Evaluation
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Job Offer Details
            </Typography>
            {jobOfferDetails ? (
              <List dense>
                <ListItem>
                  <ListItemText primary="Company" secondary={jobOfferDetails.company} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Position" secondary={jobOfferDetails.position} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Salary" secondary={`$${jobOfferDetails.salary.toLocaleString()}`} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Benefits" secondary={jobOfferDetails.benefits} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Status" secondary={<Chip label={jobOfferDetails.status} color={getOfferStatusColor(jobOfferDetails.status)} />} />
                </ListItem>
                <ListItem>
                  <Button variant="outlined" size="small" onClick={onAnalyzeOffer}>
                    Analyze Offer
                  </Button>
                </ListItem>
              </List>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  No job offer details entered.
                </Typography>
                <Button variant="contained" size="small" onClick={onReceiveOffer} sx={{ mt: 1 }}>
                  Enter Offer Details
                </Button>
              </Box>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Market Analysis & Strategy
            </Typography>
            {marketAnalysis ? (
              <List dense>
                <ListItem>
                  <ListItemText primary="Average Salary" secondary={`$${marketAnalysis.averageSalary.toLocaleString()}`} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Market Salary Range" secondary={marketAnalysis.salaryRange} />
                </ListItem>
                <ListItem>
                  <Button variant="outlined" size="small" onClick={onDevelopStrategy}>
                    Develop Negotiation Strategy
                  </Button>
                </ListItem>
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Analyze a job offer to see market data.
              </Typography>
            )}
            {negotiationStrategy && negotiationStrategy.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Negotiation Talking Points:
                </Typography>
                <List dense>
                  {negotiationStrategy.map((point, index) => (
                    <ListItem key={index}>
                      <Chip label={point} size="small" color="primary" />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default SalaryNegotiation;


