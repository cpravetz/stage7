import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material/index.js';
import { RestaurantOperationsAssistantBuilder } from '../../../utils/AssistantMessageBuilders';

interface Reservation {
  id: string;
  guestName: string;
  partySize: number;
  date: string;
  time: string;
  status: string;
  specialRequests: string;
}

interface ReservationsProps {
  reservations: Reservation[];
  sendMessage: (message: string) => Promise<void>;
  onCreateReservation?: (reservation: Reservation) => Promise<void>;
  onUpdateReservation?: (id: string, updates: Partial<Reservation>) => Promise<void>;
  onCancelReservation?: (id: string) => Promise<void>;
}

const Reservations: React.FC<ReservationsProps> = ({ reservations, sendMessage, onCreateReservation, onUpdateReservation, onCancelReservation }) => {
  const [guestName, setGuestName] = React.useState('');
  const [partySize, setPartySize] = React.useState(2);
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [specialRequests, setSpecialRequests] = React.useState('');

  const getMissionId = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('missionId') || 'unknown-mission';
  };

  const getConversationId = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('conversationId') || 'default-conversation';
  };

  const handleCreate = () => {
    if (guestName && date && time) {
      const missionId = getMissionId();
      const conversationId = getConversationId();
      const message = RestaurantOperationsAssistantBuilder.createReservation(
        missionId,
        'restaurant-ops-client',
        conversationId,
        {
          guestName,
          partySize,
          date,
          time,
          specialRequests,
          status: 'Confirmed'
        }
      );
      sendMessage(JSON.stringify(message));
      setGuestName('');
      setPartySize(2);
      setDate('');
      setTime('');
      setSpecialRequests('');
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Reservations Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Reservation
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Guest Name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            label="Party Size"
            type="number"
            value={partySize}
            onChange={(e) => setPartySize(parseInt(e.target.value) || 2)}
            sx={{ width: 120 }}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!guestName || !date || !time}
          >
            Create Reservation
          </Button>
        </Box>
        <TextField
          label="Special Requests"
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          fullWidth
          multiline
          rows={2}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Guest Name</TableCell>
              <TableCell>Party Size</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Special Requests</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reservations.map((reservation) => (
              <TableRow key={reservation.id}>
                <TableCell>{reservation.guestName}</TableCell>
                <TableCell>{reservation.partySize}</TableCell>
                <TableCell>{new Date(reservation.date).toLocaleDateString()}</TableCell>
                <TableCell>{reservation.time}</TableCell>
                <TableCell>{reservation.status}</TableCell>
                <TableCell>{reservation.specialRequests || 'None'}</TableCell>
                <TableCell>
                  {reservation.status === 'Confirmed' && (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          const missionId = getMissionId();
                          const conversationId = getConversationId();
                          const message = RestaurantOperationsAssistantBuilder.updateReservation(
                            missionId,
                            'restaurant-ops-client',
                            conversationId,
                            reservation.id,
                            { status: 'Seated' }
                          );
                          sendMessage(JSON.stringify(message));
                        }}
                        sx={{ mr: 1 }}
                      >
                        Seat
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => {
                          const missionId = getMissionId();
                          const conversationId = getConversationId();
                          const message = RestaurantOperationsAssistantBuilder.cancelReservation(
                            missionId,
                            'restaurant-ops-client',
                            conversationId,
                            reservation.id
                          );
                          sendMessage(JSON.stringify(message));
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => {
            const missionId = getMissionId();
            const conversationId = getConversationId();
            const message = RestaurantOperationsAssistantBuilder.createReservation(
              missionId,
              'restaurant-ops-client',
              conversationId,
              { status: 'Confirmed' }
            );
            sendMessage(JSON.stringify(message));
          }}>
            Confirm All Pending
          </Button>
          <Button variant="outlined" onClick={() => {
            const missionId = getMissionId();
            const conversationId = getConversationId();
            const message = RestaurantOperationsAssistantBuilder.cancelReservation(
              missionId,
              'restaurant-ops-client',
              conversationId,
              'all-no-shows'
            );
            sendMessage(JSON.stringify(message));
          }}>
            Cancel No-Shows
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Reservations;

