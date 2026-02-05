import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

interface RoomManagementProps {
  rooms: Array<{
    roomNumber: string;
    type: string;
    status: string;
    guest?: string;
    checkInDate?: string;
    checkOutDate?: string;
  }>;
  guests: Array<{
    id: string;
    name: string;
    room?: string;
  }>;
  onAssignRoom: (guestId: string, roomNumber: string) => void;
  onCheckIn: (guestId: string) => void;
  onCheckOut: (guestId: string) => void;
  onUpdateRoomStatus: (roomNumber: string, status: string) => void;
}

const RoomManagement: React.FC<RoomManagementProps> = ({
  rooms,
  guests,
  onAssignRoom,
  onCheckIn,
  onCheckOut,
  onUpdateRoomStatus
}) => {
  const [selectedGuest, setSelectedGuest] = React.useState<string>('');
  const [selectedRoom, setSelectedRoom] = React.useState<string>('');

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Room Management Dashboard
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Assign Room
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            select
            label="Select Guest"
            value={selectedGuest}
            onChange={(e) => setSelectedGuest(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 200, '& .MuiInputLabel-root': { transform: 'translate(14px, -9px) scale(0.75)' } }}
          >
            <option value="">Select a guest</option>
            {guests.map((guest) => (
              <option key={guest.id} value={guest.id}>{guest.name}</option>
            ))}
          </TextField>
          <TextField
            select
            label="Select Room"
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 150, '& .MuiInputLabel-root': { transform: 'translate(14px, -9px) scale(0.75)' } }}
          >
            <option value="">Select a room</option>
            {rooms.filter(r => r.status === 'Available').map((room) => (
              <option key={room.roomNumber} value={room.roomNumber}>{room.roomNumber} ({room.type})</option>
            ))}
          </TextField>
          <Button
            variant="contained"
            color="primary"
            onClick={() => selectedGuest && selectedRoom && onAssignRoom(selectedGuest, selectedRoom)}
            disabled={!selectedGuest || !selectedRoom}
          >
            Assign Room
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Room Number</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Guest</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.roomNumber}>
                <TableCell>{room.roomNumber}</TableCell>
                <TableCell>{room.type}</TableCell>
                <TableCell>{room.status}</TableCell>
                <TableCell>{room.guest || 'N/A'}</TableCell>
                <TableCell>
                  {room.status === 'Available' && (
                    <Button variant="outlined" size="small" onClick={() => onUpdateRoomStatus(room.roomNumber, 'Maintenance')}>Mark Maintenance</Button>
                  )}
                  {room.status === 'Occupied' && room.guest && (
                    <Button variant="outlined" size="small" onClick={() => onCheckOut(room.guest!)}>Check Out</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Guest Check-In/Check-Out
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {guests.filter(g => !g.room).map((guest) => (
            <Button key={guest.id} variant="outlined" onClick={() => onCheckIn(guest.id)}>
              Check-In {guest.name}
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default RoomManagement;

