import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

interface HotelReservation {
  id: string;
  guestName: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  totalPrice: number;
}

interface ReservationsProps {
  reservations: HotelReservation[];
  onCreateReservation: (reservation: Omit<HotelReservation, 'id' | 'totalPrice'>) => void;
  onUpdateReservation: (reservationId: string, updates: Partial<HotelReservation>) => void;
  onCancelReservation: (reservationId: string) => void;
}

const Reservations: React.FC<ReservationsProps> = ({
  reservations,
  onCreateReservation,
  onUpdateReservation,
  onCancelReservation
}: ReservationsProps) => {
  const [newReservation, setNewReservation] = React.useState<{
    guestName: string;
    roomType: string;
    checkInDate: string;
    checkOutDate: string;
  }>({
    guestName: '',
    roomType: 'Standard',
    checkInDate: '',
    checkOutDate: ''
  });

  const handleCreate = () => {
    if (newReservation.guestName && newReservation.checkInDate && newReservation.checkOutDate) {
      onCreateReservation({
        guestName: newReservation.guestName,
        roomType: newReservation.roomType,
        checkInDate: newReservation.checkInDate,
        checkOutDate: newReservation.checkOutDate,
        status: 'Confirmed'
      });
      setNewReservation({
        guestName: '',
        roomType: 'Standard',
        checkInDate: '',
        checkOutDate: ''
      });
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
            value={newReservation.guestName}
            onChange={(e) => setNewReservation({...newReservation, guestName: e.target.value})}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            select
            label="Room Type"
            value={newReservation.roomType}
            onChange={(e) => setNewReservation({...newReservation, roomType: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ width: 150 }}
          >
            <option value="Standard">Standard</option>
            <option value="Deluxe">Deluxe</option>
            <option value="Suite">Suite</option>
          </TextField>
          <TextField
            label="Check-In Date"
            type="date"
            value={newReservation.checkInDate}
            onChange={(e) => setNewReservation({...newReservation, checkInDate: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Check-Out Date"
            type="date"
            value={newReservation.checkOutDate}
            onChange={(e) => setNewReservation({...newReservation, checkOutDate: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!newReservation.guestName || !newReservation.checkInDate || !newReservation.checkOutDate}
          >
            Create Reservation
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Guest Name</TableCell>
              <TableCell>Room Type</TableCell>
              <TableCell>Check-In</TableCell>
              <TableCell>Check-Out</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Total Price</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reservations.map((reservation) => (
              <TableRow key={reservation.id}>
                <TableCell>{reservation.guestName}</TableCell>
                <TableCell>{reservation.roomType}</TableCell>
                <TableCell>{new Date(reservation.checkInDate).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(reservation.checkOutDate).toLocaleDateString()}</TableCell>
                <TableCell>{reservation.status}</TableCell>
                <TableCell>${reservation.totalPrice.toFixed(2)}</TableCell>
                <TableCell>
                  {reservation.status === 'Confirmed' && (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onUpdateReservation(reservation.id, { status: 'Checked In' })}
                        sx={{ mr: 1 }}
                      >
                        Check-In
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => onCancelReservation(reservation.id)}
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
    </Box>
  );
};

export default Reservations;

