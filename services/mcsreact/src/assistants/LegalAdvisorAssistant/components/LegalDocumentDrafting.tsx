import React from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material/index.js';
import { LegalDocument } from '../types';

interface LegalDocumentDraftingProps {
  documentTypes: string[];
  selectedDocumentType: string | null;
  onSelectDocumentType: (type: string) => void;
  documentContent: string | null;
  onDraftDocument: () => void;
  onReviewDocument: () => void;
}

const LegalDocumentDrafting: React.FC<LegalDocumentDraftingProps> = ({
  documentTypes,
  selectedDocumentType,
  onSelectDocumentType,
  documentContent,
  onDraftDocument,
  onReviewDocument,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Legal Document Drafting
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Draft New Document
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="document-type-select-label">Document Type</InputLabel>
              <Select
                labelId="document-type-select-label"
                value={selectedDocumentType || ''}
                label="Document Type"
                onChange={(e) => onSelectDocumentType(e.target.value as string)}
              >
                {documentTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Key Terms and Requirements"
              fullWidth
              multiline
              rows={4}
              placeholder="e.g., Parties involved, jurisdiction, special clauses..."
              sx={{ mb: 2 }}
              // In a real implementation, this would be a controlled component
              // value={keyTerms} onChange={(e) => setKeyTerms(e.target.value)}
            />
            <Button variant="contained" onClick={onDraftDocument} fullWidth disabled={!selectedDocumentType}>
              Draft Document
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Drafted Document Preview
            </Typography>
            {documentContent ? (
              <Box>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  <Typography variant="body2">{documentContent}</Typography>
                </Paper>
                <Button variant="contained" onClick={onReviewDocument} fullWidth>
                  Review & Finalize
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Draft a document to see its preview here.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default LegalDocumentDrafting;


