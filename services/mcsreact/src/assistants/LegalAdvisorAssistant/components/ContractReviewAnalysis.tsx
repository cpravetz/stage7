import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid, Chip } from '@mui/material/index.js';
import { ContractAnalysisResult } from '../types';

interface ContractReviewAnalysisProps {
  uploadedContract: string | null;
  analysisResult: ContractAnalysisResult | null;
  onUploadContract: () => void;
  onAnalyzeContract: () => void;
  onReviewFindings: () => void;
}

const ContractReviewAnalysis: React.FC<ContractReviewAnalysisProps> = ({
  uploadedContract,
  analysisResult,
  onUploadContract,
  onAnalyzeContract,
  onReviewFindings,
}) => {
  const getRiskSeverityColor = (risk: string) => {
    if (risk.toLowerCase().includes('high')) return 'error';
    if (risk.toLowerCase().includes('medium')) return 'warning';
    return 'default';
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Contract Review and Analysis
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Upload Contract for Analysis
            </Typography>
            <Button variant="contained" fullWidth onClick={onUploadContract} sx={{ mb: 2 }}>
              {uploadedContract ? "Re-upload Contract" : "Upload Contract"}
            </Button>
            {uploadedContract && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Contract uploaded: {uploadedContract.substring(0, 50)}...
              </Typography>
            )}
            <Button variant="contained" fullWidth onClick={onAnalyzeContract} disabled={!uploadedContract}>
              Analyze Contract
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Analysis Results
            </Typography>
            {analysisResult ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Summary:
                </Typography>
                <Paper variant="outlined" sx={{ p: 1, mb: 2, maxHeight: 100, overflowY: 'auto' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {analysisResult.summary}
                  </Typography>
                </Paper>
                <Typography variant="subtitle1" gutterBottom>
                  Identified Risks:
                </Typography>
                <List dense>
                  {analysisResult.risks.map((risk, index) => (
                    <ListItem key={index}>
                      <Chip label={risk} size="small" color={getRiskSeverityColor(risk)} />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                  Compliance Issues:
                </Typography>
                <List dense>
                  {analysisResult.complianceIssues.map((issue, index) => (
                    <ListItem key={index}>
                      <Chip label={issue} size="small" color="error" />
                    </ListItem>
                  ))}
                </List>
                <Button variant="contained" fullWidth onClick={onReviewFindings} sx={{ mt: 2 }}>
                  Review Recommendations
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Upload and analyze a contract to see results.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ContractReviewAnalysis;


