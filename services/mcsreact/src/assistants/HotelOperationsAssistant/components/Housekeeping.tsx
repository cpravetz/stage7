import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

interface HousekeepingProps {
  housekeepingTasks: Array<{
    id: string;
    roomNumber: string;
    taskType: string;
    status: string;
    assignedTo: string;
    scheduledTime: string;
  }>;
  onScheduleHousekeeping: (roomNumber: string, time: string) => void;
  onUpdateStatus: (taskId: string, status: string) => void;
}

const Housekeeping: React.FC<HousekeepingProps> = ({
  housekeepingTasks,
  onScheduleHousekeeping,
  onUpdateStatus
}) => {
  const [newTask, setNewTask] = React.useState<{
    roomNumber: string;
    scheduledTime: string;
  }>({
    roomNumber: '',
    scheduledTime: ''
  });

  const handleSchedule = () => {
    if (newTask.roomNumber && newTask.scheduledTime) {
      onScheduleHousekeeping(newTask.roomNumber, newTask.scheduledTime);
      setNewTask({ roomNumber: '', scheduledTime: '' });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Housekeeping Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Schedule New Housekeeping Task
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Room Number"
            value={newTask.roomNumber}
            onChange={(e) => setNewTask({...newTask, roomNumber: e.target.value})}
            sx={{ width: 150 }}
          />
          <TextField
            label="Scheduled Time"
            type="datetime-local"
            value={newTask.scheduledTime}
            onChange={(e) => setNewTask({...newTask, scheduledTime: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSchedule}
            disabled={!newTask.roomNumber || !newTask.scheduledTime}
          >
            Schedule Task
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Room Number</TableCell>
              <TableCell>Task Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Assigned To</TableCell>
              <TableCell>Scheduled Time</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {housekeepingTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>{task.roomNumber}</TableCell>
                <TableCell>{task.taskType}</TableCell>
                <TableCell>{task.status}</TableCell>
                <TableCell>{task.assignedTo}</TableCell>
                <TableCell>{new Date(task.scheduledTime).toLocaleString()}</TableCell>
                <TableCell>
                  {task.status === 'Scheduled' && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onUpdateStatus(task.id, 'In Progress')}
                    >
                      Start
                    </Button>
                  )}
                  {task.status === 'In Progress' && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onUpdateStatus(task.id, 'Completed')}
                    >
                      Complete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => onScheduleHousekeeping('all', new Date().toISOString())}>
          Schedule All Rooms
        </Button>
        <Button variant="outlined" onClick={() => onUpdateStatus('all', 'Completed')}>
          Mark All Complete
        </Button>
      </Box>
    </Box>
  );
};

export default Housekeeping;

