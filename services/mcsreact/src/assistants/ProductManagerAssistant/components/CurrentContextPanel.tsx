// services/mcsreact/src/pm-assistant/components/CurrentContextPanel.tsx
import React, { useState } from 'react';
import { Card, CardHeader, CardContent, Typography, Box, List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip, Divider, Tabs, Tab, TextField, InputAdornment, useTheme } from '@mui/material';
import { CurrentContextPanelProps, ContextItem } from '../types';
import {Article, BugReport, Description, Group, Search} from '@mui/icons-material';

const CurrentContextPanel: React.FC<CurrentContextPanelProps> = ({ 
  contextItems, 
  missionName, 
  missionStatus
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter context items based on search term
  const filteredItems = contextItems.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group items by type
  const groupedItems = filteredItems.reduce((groups, item) => {
    if (!groups[item.type]) {
      groups[item.type] = [];
    }
    groups[item.type].push(item);
    return groups;
  }, {} as Record<string, ContextItem[]>);

  // Get icon for context item type
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'file': return <Description />;
      case 'ticket': return <BugReport />;
      case 'document': return <Article />;
      case 'meeting': return <Group />;
      default: return <Article />;
    }
  };

  // Format date
  const formatDate = (timestamp: Date | string) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 3 }}>
      <CardHeader 
        title="Current Context"
        titleTypographyProps={{ variant: 'h6' }}
        sx={{ backgroundColor: theme.palette.background.paper, py: 1.5 }}
      />
      
      {missionName && (
        <Box sx={{ px: 2, pb: 1, backgroundColor: '#f0f0f0' }}>
          <Typography variant="subtitle2" gutterBottom>
            Active Mission
          </Typography>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" fontWeight="medium">
              {missionName}
            </Typography>
            {missionStatus && (
              <Chip 
                label={missionStatus}
                size="small"
                color={missionStatus.toLowerCase() === 'in progress' ? 'warning' : 
                      missionStatus.toLowerCase() === 'completed' ? 'success' : 'info'}
              />
            )}
          </Box>
        </Box>
      )}

      <Box sx={{ px: 2, pt: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search context..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <CardContent sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
        {filteredItems.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%">
            <Typography variant="body2" color="text.secondary">
              No context items found
            </Typography>
          </Box>
        ) : (
          <Box>
            {Object.entries(groupedItems).map(([type, items]) => (
              <Box key={type} mb={2}>
                <Typography variant="subtitle2" fontWeight="medium" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                  {getTypeIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}s ({items.length})
                </Typography>
                <List dense>
                  {items.map((item, index) => (
                    <React.Fragment key={item.id || index}>
                      <ListItem 
                        alignItems="flex-start"
                        sx={{ py: 1 }}
                        secondaryAction={
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(item.timestamp)}
                          </Typography>
                        }
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ backgroundColor: '#007bff', width: 24, height: 24 }}>
                            {getTypeIcon(item.type)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight="medium" noWrap>
                              {item.title}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {item.preview}
                            </Typography>
                          }
                        />
                      </ListItem>
                      {index < items.length - 1 && <Divider component="li" />}
                    </React.Fragment>
                  ))}
                </List>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default CurrentContextPanel;

