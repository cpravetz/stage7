import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Chip } from '@mui/material/index.js';

interface ComplianceRule {
  id: string;
  name: string;
  status: 'Compliant' | 'Non-Compliant' | 'Pending Review';
  details: string;
}

interface ComplianceCheckingProps {
  documentToAnalyze: string | null;
  complianceRules: ComplianceRule[];
  onUploadDocument: () => void;
  onCheckCompliance: () => void;
  onViewDetails: (ruleId: string) => void;
}

const ComplianceChecking: React.FC<ComplianceCheckingProps> = ({
  documentToAnalyze,
  complianceRules,
  onUploadDocument,
  onCheckCompliance,
  onViewDetails,
}) => {
  const getStatusColor = (status: ComplianceRule['status']) => {
    switch (status) {
      case 'Compliant': return 'success';
      case 'Non-Compliant': return 'error';
      case 'Pending Review': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Compliance Checking and Regulatory Analysis
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Document for Compliance
            </Typography>
            <Button variant="contained" fullWidth onClick={onUploadDocument} sx={{ mb: 2 }}>
              {documentToAnalyze ? "Re-upload Document" : "Upload Document"}
            </Button>
            {documentToAnalyze && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Document uploaded: {documentToAnalyze.substring(0, 50)}...
              </Typography>
            )}
            <Button variant="contained" fullWidth onClick={onCheckCompliance} disabled={!documentToAnalyze}>
              Check Compliance
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Compliance Report
            </Typography>
            {complianceRules.length > 0 ? (
              <List>
                {complianceRules.map((rule) => (
                  <ListItem key={rule.id} divider>
                    <ListItemText
                      primary={rule.name}
                      secondary={rule.details}
                    />
                    <Chip label={rule.status} color={getStatusColor(rule.status)} sx={{ mr: 1 }} />
                    <Button variant="outlined" size="small" onClick={() => onViewDetails(rule.id)}>
                      Details
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Upload a document and check compliance to see results.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ComplianceChecking;


