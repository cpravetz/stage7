// services/mcsreact/src/pm-assistant/rich-output/JiraTicketCard.tsx
import React from 'react';
import { Card, CardHeader, CardContent, Chip, Avatar, Button, Typography, Box } from '@mui/material/index.js';
import { JiraTicketCardProps } from '../types';

const JiraTicketCard: React.FC<JiraTicketCardProps> = ({
  ticketKey,
  title,
  status,
  type,
  assignee,
  summary,
  priority,
  dueDate,
  createdDate,
  link,
  onView,
  onComment
}) => {
  // Color mapping for status
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'to do': return 'info';
      case 'in progress': return 'warning';
      case 'done': return 'success';
      default: return 'default';
    }
  };

  // Color mapping for priority
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'error';
      case 'critical': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  return (
    <Card sx={{ mb: 2, boxShadow: 3 }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" component="div">
              {ticketKey}: {title}
            </Typography>
            <Chip label={type} size="small" sx={{ ml: 1 }} />
          </Box>
        }
        subheader={
          <Box display="flex" alignItems="center" mt={1}>
            <Chip label={status} color={getStatusColor(status)} size="small" />
            <Chip label={priority} color={getPriorityColor(priority)} size="small" sx={{ ml: 1 }} />
            {dueDate && <Typography variant="caption" sx={{ ml: 2 }}>Due: {new Date(dueDate).toLocaleDateString()}</Typography>}
          </Box>
        }
      />
      <CardContent>
        <Box display="flex" alignItems="center" mb={2}>
          {assignee?.avatarUrl ? (
            <Avatar src={assignee.avatarUrl} alt={assignee.name} sx={{ width: 24, height: 24, mr: 1 }} />
          ) : (
            <Avatar sx={{ width: 24, height: 24, mr: 1 }}>{assignee?.name?.charAt(0) || '?'}</Avatar>
          )}
          <Typography variant="body2" color="text.secondary">
            Assigned to: {assignee?.name || 'Unassigned'}
          </Typography>
        </Box>
        <Typography variant="body1" paragraph>
          {summary}
        </Typography>
        <Box display="flex" justifyContent="flex-end" gap={1} mt={2}>
          {link && (
            <Button
              variant="outlined"
              size="small"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                if (onView) onView();
                window.open(link, '_blank');
              }}
            >
              View in Jira
            </Button>
          )}
          {onComment && (
            <Button
              variant="outlined"
              size="small"
              onClick={onComment}
            >
              Comment
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default JiraTicketCard;

