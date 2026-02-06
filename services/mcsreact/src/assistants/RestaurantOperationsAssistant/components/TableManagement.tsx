import React from 'react';
import { Box, Typography, Button, Grid, Paper, TextField, Chip } from '@mui/material/index.js';
import { RestaurantOperationsAssistantBuilder } from '../../../utils/AssistantMessageBuilders';

interface Table {
  tableNumber: string;
  capacity: number;
  status: string;
  currentReservation?: string;
  server?: string;
}

interface ReservationForTable {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
}

interface TableManagementProps {
  tables: Table[];
  reservations: ReservationForTable[];
  sendMessage: (message: string) => Promise<void>;
  onAssignTable?: (reservationId: string, tableNumber: string) => Promise<void>;
  onUpdateTableStatus?: (tableNumber: string, status: string) => Promise<void>;
}

const TableManagement: React.FC<TableManagementProps> = ({
  tables,
  reservations,
  sendMessage
}) => {
  const [selectedReservation, setSelectedReservation] = React.useState<string>('');
  const [selectedTable, setSelectedTable] = React.useState<string>('');

  const getMissionId = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('missionId') || 'unknown-mission';
  };

  const getConversationId = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('conversationId') || 'default-conversation';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'success';
      case 'Occupied': return 'error';
      case 'Reserved': return 'warning';
      case 'Dirty': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Table Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Assign Table to Reservation
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            select
            label="Select Reservation"
            value={selectedReservation}
            onChange={(e) => setSelectedReservation(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 200 }}
          >
            <option value="">Select a reservation</option>
            {reservations.filter(r => r.partySize <= Math.max(...tables.map(t => t.capacity))).map((reservation) => (
              <option key={reservation.id} value={reservation.id}>
                {reservation.guestName} ({reservation.partySize} guests, {reservation.time})
              </option>
            ))}
          </TextField>
          <TextField
            select
            label="Select Table"
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 150 }}
          >
            <option value="">Select a table</option>
            {tables.filter(t => t.status === 'Available' && t.capacity >= (reservations.find(r => r.id === selectedReservation)?.partySize || 0)).map((table) => (
              <option key={table.tableNumber} value={table.tableNumber}>
                {table.tableNumber} (Capacity: {table.capacity})
              </option>
            ))}
          </TextField>
          <Button
            variant="contained"
            color="primary"
            onClick={() => selectedReservation && selectedTable && (() => {
              const missionId = getMissionId();
              const conversationId = getConversationId();
              const message = RestaurantOperationsAssistantBuilder.assignTable(
                missionId,
                'restaurant-ops-client',
                conversationId,
                { reservationId: selectedReservation, tableNumber: selectedTable }
              );
              sendMessage(JSON.stringify(message));
            })()}
            disabled={!selectedReservation || !selectedTable}
          >
            Assign Table
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Table Layout
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {tables.map((table) => (
          <Grid {...({ xs: 12, sm: 6, md: 4, lg: 3, key: table.tableNumber, item: true } as any)}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1">Table {table.tableNumber}</Typography>
                <Chip
                  label={table.status}
                  color={getStatusColor(table.status)}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Capacity: {table.capacity}
              </Typography>
              {table.currentReservation && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Reservation: {table.currentReservation}
                </Typography>
              )}
              {table.server && (
                <Typography variant="body2" color="text.secondary">
                  Server: {table.server}
                </Typography>
              )}
              <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
                {table.status === 'Available' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sendMessage(`Update table ${table.tableNumber} status to Reserved`)}
                  >
                    Reserve
                  </Button>
                )}
                {table.status === 'Occupied' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sendMessage(`Update table ${table.tableNumber} status to Dirty`)}
                  >
                    Clear
                  </Button>
                )}
                {table.status === 'Dirty' && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sendMessage(`Update table ${table.tableNumber} status to Available`)}
                  >
                    Clean
                  </Button>
                )}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => sendMessage(`Reset all tables to Available`)}>
          Reset All Tables
        </Button>
        <Button variant="outlined" onClick={() => sendMessage(`Mark all tables as Dirty`)}>
          Mark All Dirty
        </Button>
      </Box>
    </Box>
  );
};

export default TableManagement;

