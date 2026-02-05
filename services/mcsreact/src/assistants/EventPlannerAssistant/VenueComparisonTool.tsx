import React from 'react';
import { Box, Typography, Card, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from '@mui/material';
import { CompareArrows as CompareArrowsIcon, Add as AddIcon } from '@mui/icons-material';
import { Venue } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface VenueComparisonToolProps {
  venues: Venue[];
  sendMessage: (message: string) => Promise<void>;
}

const VenueComparisonTool: React.FC<VenueComparisonToolProps> = ({ venues, sendMessage }) => {

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <CompareArrowsIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Venue Comparison Tool
      </Typography>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Venue Name</TableCell>
              <TableCell>Capacity</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell>Amenities</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {venues.map((venue) => (
              <TableRow key={venue.id}>
                <TableCell>{venue.name}</TableCell>
                <TableCell>{venue.capacity}</TableCell>
                <TableCell>${venue.price.toLocaleString()}</TableCell>
                <TableCell>{venue.location}</TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center">
                    <Typography sx={{ mr: 0.5 }}>{venue.rating}</Typography>
                    <Typography variant="body2" color="text.secondary">/5</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  {venue.amenities.map((amenity, idx) => (
                    <Chip key={idx} label={amenity} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                  ))}
                </TableCell>
                <TableCell>
                  <Button variant="outlined" size="small">Compare</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        startIcon={<AddIcon />}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'venue-search', { trackBy: 'venue' });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Search More Venues
      </Button>
    </Card>
  );
};

export default VenueComparisonTool;

