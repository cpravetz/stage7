import React, { useState } from 'react';
import { Box, IconButton, Typography, Tabs, Tab } from '@mui/material/index.js'; // Removed unused imports
import { useTheme, useMediaQuery } from '@mui/material'; // Use useMediaQuery from @mui/material
import { Menu as MenuIcon, Close as CloseIcon, Description as DescriptionIcon, Assignment as AssignmentIcon, Dashboard as DashboardIcon, QueryStats as QueryStatsIcon, Work as WorkIcon, Settings as SettingsIcon } from '@mui/icons-material'; // Added new icons as placeholders
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { pmAssistantClient } from '../shared/assistantClients';
import { ChatPanel } from '../shared/components/ChatPanel';

// Import PM-specific components (placeholders for now, or actual components if they exist)
import CurrentContextPanel from './components/CurrentContextPanel';
import SuggestedActionsPanel from './components/SuggestedActionsPanel';

// Define a11yProps for tabs
function a11yProps(index: number) {
  return {
    id: `pm-assistant-tab-${index}`,
    'aria-controls': `pm-assistant-tabpanel-${index}`,
  };
}

const PmAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState(0); // Added for tab management

  // UI toggle functions
  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <BaseAssistantPage
      title="Product Manager Assistant"
      description="Your AI partner for product management, assisting with planning, documentation, and project oversight."
      client={pmAssistantClient}
      initialPrompt="Hello! I need help with product management."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
        return (
          <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left Panel - Navigation Tabs */}
            {(leftPanelOpen || !isMobile) && (
              <Box
                sx={{
                  width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
                  transition: 'width 0.3s ease',
                  overflow: 'hidden',
                  display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
                  height: '100%',
                  borderRight: '1px solid #e0e0e0',
                  overflowY: 'auto'
                }}
              >
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    PM Tools
                  </Typography>
                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                    aria-label="pm assistant features tabs"
                  >
                    <Tab label="Product Overview" icon={<DashboardIcon />} iconPosition="start" {...a11yProps(0)} />
                    <Tab label="Requirements & Docs" icon={<DescriptionIcon />} iconPosition="start" {...a11yProps(1)} />
                    <Tab label="Roadmap & Planning" icon={<AssignmentIcon />} iconPosition="start" {...a11yProps(2)} />
                    <Tab label="Analytics & Insights" icon={<QueryStatsIcon />} iconPosition="start" {...a11yProps(3)} />
                    <Tab label="Work Management" icon={<WorkIcon />} iconPosition="start" {...a11yProps(4)} />
                    <Tab label="Settings & Integrations" icon={<SettingsIcon />} iconPosition="start" {...a11yProps(5)} />
                  </Tabs>
                </Box>
              </Box>
            )}

            {/* Main Content Area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Header */}
              <Box
                sx={{
                  p: 2,
                  borderBottom: '1px solid #e0e0e0',
                  backgroundColor: theme.palette.background.paper,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <Typography variant="h5" fontWeight="bold">
                  Product Manager Assistant
                </Typography>
                <Box>
                  {!isMobile && (
                    <IconButton onClick={toggleLeftPanel} sx={{ mr: 1 }}>
                      {leftPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
                    </IconButton>
                  )}
                  <IconButton onClick={toggleRightPanel}>
                    {rightPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
                  </IconButton>
                </Box>
              </Box>

              {/* Conversation Area - Handled by ChatPanel */}
              <ChatPanel
                messages={messages}
                onSendMessage={sendMessage}
                isLoading={isLoading}
                error={error}
                assistantName="Product Manager Assistant"
                enableVoiceInput={true}
              />
            </Box>

            {/* Right Panel - Active Tool Content */}
            {(rightPanelOpen || !isMobile) && (
              <Box
                sx={{
                  width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
                  transition: 'width 0.3s ease',
                  overflow: 'hidden',
                  display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
                  height: '100%',
                  borderLeft: '1px solid #e0e0e0',
                  overflowY: 'auto',
                  p: 2
                }}
              >
                {activeTab === 0 && <CurrentContextPanel contextItems={[]} />}
                {activeTab === 1 && <SuggestedActionsPanel actions={[]} />}
                {/* Add other PM-specific components here based on activeTab */}
                {/* Placeholder for other tabs */}
                {activeTab === 2 && <Box sx={{ p: 2 }}><Typography>Roadmap & Planning content goes here.</Typography></Box>}
                {activeTab === 3 && <Box sx={{ p: 2 }}><Typography>Analytics & Insights content goes here.</Typography></Box>}
                {activeTab === 4 && <Box sx={{ p: 2 }}><Typography>Work Management content goes here.</Typography></Box>}
                {activeTab === 5 && <Box sx={{ p: 2 }}><Typography>Settings & Integrations content goes here.</Typography></Box>}
              </Box>
            )}
          </Box>
        );
      }}
    </BaseAssistantPage>
  );
};

export default PmAssistantPage;

