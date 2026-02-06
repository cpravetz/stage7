// services/mcsreact/src/pm-assistant/components/SuggestedActionsPanel.tsx
import React from 'react';
import { useTheme, Card, CardHeader, CardContent, List, ListItem, ListItemAvatar, ListItemText, Avatar, Button, Typography, Box, Divider } from '@mui/material';
import { SuggestedActionsPanelProps, SuggestedAction } from '../types';
import { Lightbulb, Analytics, Assignment, TrendingUp, Search } from '@mui/icons-material';


const SuggestedActionsPanel: React.FC<SuggestedActionsPanelProps> = ({
  actions,
  title = 'Suggested Actions'
}) => {
  const theme = useTheme();
  // Icon mapping for action types
  const getActionIcon = (title: string): React.ReactNode => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('draft') || lowerTitle.includes('spec')) {
      return <Assignment />;
    } else if (lowerTitle.includes('analyze') || lowerTitle.includes('feedback')) {
      return <Analytics />;
    } else if (lowerTitle.includes('jira') || lowerTitle.includes('epic')) {
      return <Lightbulb />;
    } else if (lowerTitle.includes('stakeholder') || lowerTitle.includes('update')) {
      return <TrendingUp />;
    } else if (lowerTitle.includes('review') || lowerTitle.includes('backlog')) {
      return <Search />;
    }
    return <Lightbulb />;
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 3 }}>
      <CardHeader 
        title={title}
        titleTypographyProps={{ variant: 'h6' }}
        sx={{ backgroundColor: theme.palette.background.paper, py: 1.5 }}
      />
      <CardContent sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
        {actions.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%">
            <Typography variant="body2" color="text.secondary">
              No suggested actions available
            </Typography>
          </Box>
        ) : (
          <List dense>
            {actions.map((action, index) => (
              <React.Fragment key={action.id || index}>
                <ListItem 
                  secondaryAction={
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={action.onClick}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      Start
                    </Button>
                  }
                  sx={{ py: 1 }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ backgroundColor: '#007bff', width: 32, height: 32 }}>
                      {getActionIcon(action.title)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle2" noWrap>
                        {action.title}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {action.description}
                      </Typography>
                    }
                  />
                </ListItem>
                {index < actions.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
};

export default SuggestedActionsPanel;

