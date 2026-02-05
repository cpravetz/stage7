import React from 'react';
import { Box, Typography, Card, Button, List, ListItem, ListItemText } from '@mui/material';
import { Folder as FolderIcon, Add as AddIcon } from '@mui/icons-material';
import { Document } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface DocumentRepositoryProps {
  documents: Document[];
  sendMessage: (message: string) => Promise<void>;
}

const DocumentRepository: React.FC<DocumentRepositoryProps> = ({ documents, sendMessage }) => {

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <FolderIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Document Repository
      </Typography>

      <List sx={{ mt: 2 }}>
        {documents.map((doc) => (
          <ListItem key={doc.id} secondaryAction={
            <Button variant="outlined" size="small" onClick={() => {
              const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
              const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', `document-${doc.id}`, { trackBy: 'document' });
              sendMessage(JSON.stringify(msg));
            }}>Download</Button>
          }>
            <ListItemText
              primary={doc.name}
              secondary={`${doc.type} • ${doc.size} • Uploaded: ${doc.uploaded}`}
            />
          </ListItem>
        ))}
      </List>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        startIcon={<AddIcon />}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.scheduleEventCommunication(missionId, 'client-id', 'conversation-id', { optimizationGoal: 'engagement' });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Upload Document
      </Button>
    </Card>
  );
};

export default DocumentRepository;

