import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Link, useTheme } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ConversationHistory from './ConversationHistory';
import { AgentStatistics } from '../shared-browser';
import { NetworkGraph } from './NetworkGraph';
import { SecurityClient } from '../SecurityClient';
import FileUpload from './FileUpload';

interface WorkProduct {
  type: 'Interim' | 'Final';
  name: string;
  url: string;
}

interface TabbedPanelProps {
  conversationHistory: string[];
  workProducts: WorkProduct[];
  agentStatistics: Map<string, Array<AgentStatistics>>;
  activeMissionId?: string;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  conversationHistory,
  workProducts,
  agentStatistics,
  activeMissionId
}) => {
  const [activeTab, setActiveTab] = useState('conversation');

  const theme = useTheme();

  // Interface for the TabPanel component
  interface TabPanelProps {
    children?: React.ReactNode;
    index: string;
    value: string;
  }

  // TabPanel component to handle tab content
  const TabPanel = (props: TabPanelProps) => {
    const { children, value, index, ...other } = props;

    return (
      <div
        role="tabpanel"
        hidden={value !== index}
        id={`tabpanel-${index}`}
        aria-labelledby={`tab-${index}`}
        style={{ height: '100%', overflow: 'auto' }}
        {...other}
      >
        {value === index && (
          <Box sx={{ height: '100%', p: 1 }}>
            {children}
          </Box>
        )}
      </div>
    );
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const securityClient = SecurityClient.getInstance(window.location.origin);

  const handleWorkProductClick = async (event: React.MouseEvent<HTMLElement>, url: string) => {
    event.preventDefault();
    console.log('[TabbedPanel] handleWorkProductClick: Attempting to fetch URL:', url);
    try {
      const headers = securityClient.getAuthHeader();
      console.log('[TabbedPanel] handleWorkProductClick: Authorization Header:', headers ? headers['Authorization'] : 'No Authorization Header found');

      const response = await fetch(url, { headers });
      console.log('[TabbedPanel] handleWorkProductClick: Fetch response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TabbedPanel] handleWorkProductClick: Fetch response not OK. Status:', response.status, 'Text:', errorText);
        throw new Error(`Failed to fetch work product: ${response.status} ${response.statusText}. Body: ${errorText}`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[TabbedPanel] handleWorkProductClick: Error fetching work product:', error);
      alert('Failed to open work product. Please try again. Check console for details.');
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden'
    }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleChange}
          aria-label="conversation tabs"
          variant="fullWidth"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            icon={<ChatIcon />}
            iconPosition="start"
            label="Conversation"
            value="conversation"
            id="tab-conversation"
            aria-controls="tabpanel-conversation"
          />
          <Tab
            icon={<AssessmentIcon />}
            iconPosition="start"
            label="Results"
            value="results"
            id="tab-results"
            aria-controls="tabpanel-results"
          />
          <Tab
            icon={<AccountTreeIcon />}
            iconPosition="start"
            label="Agent Network"
            value="network"
            id="tab-network"
            aria-controls="tabpanel-network"
          />
          <Tab
            icon={<AttachFileIcon />}
            iconPosition="start"
            label="Files"
            value="files"
            id="tab-files"
            aria-controls="tabpanel-files"
          />
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <TabPanel value={activeTab} index="conversation">
          <ConversationHistory history={conversationHistory} />
        </TabPanel>

        <TabPanel value={activeTab} index="results">
          <TableContainer component={Paper} sx={{ maxHeight: '100%', overflow: 'auto' }}>
            <Table stickyHeader aria-label="work products table">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Work Product</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {workProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No work products available yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  workProducts.map((product, index) => (
                    <TableRow key={index} hover>
                      <TableCell>
                        <Typography variant="body2" color={product.type === 'Final' ? 'primary' : 'text.secondary'}>
                          {product.type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Link
                          component="button"
                          variant="body2"
                          onClick={(e) => handleWorkProductClick(e, product.url)}
                          sx={{
                            color: theme.palette.secondary.main,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            textAlign: 'left', // Ensure link text aligns like normal text
                          }}
                        >
                          {product.name}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={activeTab} index="network">
          <Box sx={{ height: '100%', width: '100%' }}>
            <NetworkGraph agentStatistics={agentStatistics} />
          </Box>
        </TabPanel>

        <TabPanel value={activeTab} index="files">
          {activeMissionId ? (
            <FileUpload missionId={activeMissionId} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No active mission. Create or load a mission to manage files.
            </Typography>
          )}
        </TabPanel>
      </Box>
    </Box>
  );
};

export default TabbedPanel;
