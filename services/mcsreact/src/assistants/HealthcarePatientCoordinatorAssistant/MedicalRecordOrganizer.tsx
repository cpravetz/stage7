import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, InputAdornment, IconButton } from '@mui/material/index.js';
import {Search as SearchIcon} from '@mui/icons-material';

interface MedicalRecordOrganizerProps {
  onUploadRecord?: (recordData: MedicalRecord) => void;
  onRetrieveRecord?: (recordId: string) => void;
}

interface MedicalRecord {
  id: string;
  patientId: string;
  type: 'Diagnosis' | 'Medication' | 'Lab Result' | 'Procedure';
  date: string;
  details: string;
}

const mockMedicalRecords: MedicalRecord[] = [
  { id: 'mr1', patientId: 'p1', type: 'Diagnosis', date: '2026-03-10', details: 'Migraine with aura.' },
  { id: 'mr2', patientId: 'p1', type: 'Medication', date: '2026-03-10', details: 'Prescribed Sumatriptan 50mg.' },
  { id: 'mr3', patientId: 'p2', type: 'Lab Result', date: '2026-03-05', details: 'Cholesterol levels within normal range.' },
  { id: 'mr4', patientId: 'p3', type: 'Procedure', date: '2026-03-12', details: 'ECG performed, showing minor irregularities.' },
];

const MedicalRecordOrganizer: React.FC<MedicalRecordOrganizerProps> = ({ onUploadRecord, onRetrieveRecord }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<MedicalRecord[]>([]);

  const handleSearch = () => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      return;
    }
    const filtered = mockMedicalRecords.filter(record =>
      record.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.patientId.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setSearchResults(filtered);
    if (filtered.length > 0) {
      onRetrieveRecord?.(filtered[0].id);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Medical Record Organizer
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TextField
          label="Search Medical Records (e.g., patient ID, diagnosis)"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={handleSearch}>
                  <SearchIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleSearch} fullWidth>
          Search
        </Button>

        {searchResults.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Search Results
            </Typography>
            <List>
              {searchResults.map((record) => (
                <ListItem key={record.id} divider>
                  <ListItemText
                    primary={`Patient ID: ${record.patientId} - ${record.type}`}
                    secondary={`${record.date}: ${record.details}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {searchTerm && searchResults.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No records found matching "{searchTerm}".
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default MedicalRecordOrganizer;


