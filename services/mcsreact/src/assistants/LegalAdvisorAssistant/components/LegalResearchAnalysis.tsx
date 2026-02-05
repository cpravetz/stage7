import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid } from '@mui/material/index.js';
import { ResearchResult } from '../types';

interface LegalResearchAnalysisProps {
  researchQuery: string;
  onQueryChange: (query: string) => void;
  researchResults: ResearchResult[];
  onConductResearch: () => void;
  onViewDetails: (resultId: string) => void;
}

const LegalResearchAnalysis: React.FC<LegalResearchAnalysisProps> = ({
  researchQuery,
  onQueryChange,
  researchResults,
  onConductResearch,
  onViewDetails,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Legal Research and Case Law Analysis
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Conduct New Research
            </Typography>
            <TextField
              label="Research Query"
              fullWidth
              multiline
              rows={4}
value={researchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="e.g., 'case law on intellectual property disputes in California'"
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={onConductResearch} fullWidth disabled={!researchQuery}>
              Start Research
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Research Results
            </Typography>
            {researchResults.length > 0 ? (
              <List>
                {researchResults.map((result) => (
                  <ListItem key={result.id} divider>
                    <ListItemText
                      primary={result.query}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            Summary: {result.summary.substring(0, 100)}...
                          </Typography>
                          <br />
                          Citations: {result.citations.join(', ')}
                        </React.Fragment>
                      }
                    />
                    <Button variant="outlined" size="small" onClick={() => onViewDetails(result.id)}>
                      View Details
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Enter a query and conduct research to see results.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default LegalResearchAnalysis;


