import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {Event as EventIcon, MedicalInformation as  MedicalInformationIcon, AssignmentTurnedIn as AssignmentTurnedInIcon} from '@mui/icons-material';

interface PatientTimelineViewProps {
  onViewTimeline?: (patientId: string) => void;
}

interface PatientEvent {
  id: string;
  date: string;
  description: string;
  type: 'Appointment' | 'Diagnosis' | 'Procedure' | 'Medication Change';
}

const mockPatientEvents: PatientEvent[] = [
  { id: 'pte1', date: '2026-01-10', description: 'Initial Consultation with Dr. Smith', type: 'Appointment' },
  { id: 'pte2', date: '2026-01-15', description: 'Diagnosis: Type 2 Diabetes', type: 'Diagnosis' },
  { id: 'pte3', date: '2026-01-15', description: 'Medication change: Metformin prescribed', type: 'Medication Change' },
  { id: 'pte4', date: '2026-02-01', description: 'Follow-up appointment scheduled', type: 'Appointment' },
  { id: 'pte5', date: '2026-02-10', description: 'Lab Results: HbA1c improved', type: 'Procedure' },
];

const PatientTimelineView: React.FC<PatientTimelineViewProps> = ({ onViewTimeline }) => {
  const getIconForEventType = (type: PatientEvent['type']) => {
    switch (type) {
      case 'Appointment': return <EventIcon />;
      case 'Diagnosis': return <MedicalInformationIcon />;
      case 'Procedure': return <AssignmentTurnedInIcon />;
      case 'Medication Change': return <MedicalInformationIcon />;
      default: return <EventIcon />;
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Patient Timeline View
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockPatientEvents.map((event) => (
            <ListItem key={event.id}>
              <ListItemIcon>
                {getIconForEventType(event.type)}
              </ListItemIcon>
              <ListItemText
                primary={event.description}
                secondary={`${event.date} - ${event.type}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default PatientTimelineView;


