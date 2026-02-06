import React from 'react';
import { Box, Typography, Card, Button } from '@mui/material';
import { Timeline as TimelineIcon, Add as AddIcon } from '@mui/icons-material';
import { Task } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface TimelineAndTaskManagerProps {
  tasks: Task[];
  sendMessage: (message: string) => Promise<void>;
}

const TimelineAndTaskManager: React.FC<TimelineAndTaskManagerProps> = ({ tasks, sendMessage }) => {

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <TimelineIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Timeline and Task Manager
      </Typography>

      <Box sx={{ display: 'flex', overflowX: 'auto', gap: 2, mb: 3, pb: 1 }}>
        {tasks.map((task) => (
          <Card key={task.id} sx={{ minWidth: 200, flexShrink: 0 }}>
            <Box sx={{ p: 1.5, backgroundColor: `${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}.light`, color: `${task.status === 'completed' ? 'success' : task.status === 'in-progress' ? 'warning' : 'info'}.contrastText` }}>
              <Typography variant="body2" fontWeight="bold">
                {task.name}
              </Typography>
            </Box>
            <Box sx={{ p: 1.5 }}>
              <Typography variant="caption" display="block" gutterBottom>
                {task.startDate} to {task.endDate}
              </Typography>
              <Typography variant="caption" display="block">
                {task.assignedTo}
              </Typography>
            </Box>
          </Card>
        ))}
      </Box>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        startIcon={<AddIcon />}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'event-task', { trackBy: 'task' });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Add Task
      </Button>
    </Card>
  );
};

export default TimelineAndTaskManager;

