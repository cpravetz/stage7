import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid, Chip } from '@mui/material';
import { CaseFile } from '../types';

interface CaseFileManagerProps {
  caseFiles: CaseFile[];
  onAddCaseFile: () => void;
  onViewCaseDetails: (caseId: string) => void;
  onUpdateCaseStatus: (caseId: string, newStatus: CaseFile['status']) => void;
}

const CaseFileManager: React.FC<CaseFileManagerProps> = ({
  caseFiles,
  onAddCaseFile,
  onViewCaseDetails,
  onUpdateCaseStatus,
}) => {
  const getStatusColor = (status: CaseFile['status']) => {
    switch (status) {
      case 'Open': return 'info';
      case 'Closed': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Case File Management and Organization
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" onClick={onAddCaseFile}>
            Add New Case File
          </Button>
        </Box>
        <Grid container spacing={3}>
          <Grid {...({ item: true, xs: 12 } as any)}>
            <Typography variant="h6" gutterBottom>
              My Case Files
            </Typography>
            {caseFiles.length > 0 ? (
              <List>
                {caseFiles.map((caseFile) => (
                  <ListItem key={caseFile.id} divider>
                    <ListItemText
                      primary={caseFile.name}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            Documents: {caseFile.documents.length}
                          </Typography>
                          <br />
                          Status: <Chip label={caseFile.status} color={getStatusColor(caseFile.status)} size="small" sx={{ mt: 0.5 }} />
                        </React.Fragment>
                      }
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{ mr: 1 }}
                      onClick={() => onViewCaseDetails(caseFile.id)}
                    >
                      View Details
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color={caseFile.status === 'Open' ? 'success' : 'info'}
                      onClick={() => onUpdateCaseStatus(caseFile.id, caseFile.status === 'Open' ? 'Closed' : 'Open')}
                    >
                      {caseFile.status === 'Open' ? 'Mark Closed' : 'Reopen'}
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No case files managed yet.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default CaseFileManager;


