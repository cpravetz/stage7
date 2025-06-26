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
        style={{ height: '100%', overflow: 'auto', display: value === index ? 'flex' : 'none', flexDirection: 'column' }}
        {...other}
      >
        {value === index && (
          <Box sx={{ height: '100%', p: 1, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
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
    console.log('[TabbedPanel] handleWorkProductClick: Attempting to fetch URL with securityClient.getApi():', url);
    try {
      const apiClient = securityClient.getApi();
      // The Authorization header is now automatically added by the apiClient's interceptor
      console.log('[TabbedPanel] handleWorkProductClick: Using apiClient.get(). Auth header will be injected by interceptor.');

      const response = await apiClient.get(url, {
          responseType: 'blob' // Important for handling file downloads
      });

      console.log('[TabbedPanel] handleWorkProductClick: Axios response status:', response.status);
      // Axios typically throws an error for non-2xx responses, so explicit !response.ok might not be needed
      // However, if SecurityClient's interceptor is configured to not throw on 401 for some reason,
      // or if other non-2xx statuses that don't throw by default are possible, an explicit check is safer.
      // For now, assuming Axios default behavior (throws on 4xx/5xx).

      const blob = response.data; // response.data is already a Blob due to responseType: 'blob'
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) { // Catching as any to access error.response
      console.error('[TabbedPanel] handleWorkProductClick: Error fetching work product via apiClient:', error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('[TabbedPanel] Error Data:', error.response.data);
        console.error('[TabbedPanel] Error Status:', error.response.status);
        console.error('[TabbedPanel] Error Headers:', error.response.headers);
        // Attempt to read error response if it's a blob containing JSON or text
        if (error.response.data instanceof Blob) {
          try {
            const errorBlobText = await error.response.data.text();
            console.error('[TabbedPanel] Error Blob Text:', errorBlobText);
            alert(`Failed to open work product: Server responded with status ${error.response.status}. Details: ${errorBlobText.substring(0,100)}... Check console.`);
            return;
          } catch (blobError) {
            console.error('[TabbedPanel] Error reading error blob:', blobError);
          }
        }
        alert(`Failed to open work product: Server responded with status ${error.response.status}. Check console for details.`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('[TabbedPanel] Error Request:', error.request);
        alert('Failed to open work product: No response from server. Check console for details.');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('[TabbedPanel] Error Message:', error.message);
        alert('Failed to open work product. Check console for details.');
      }
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
          <Box sx={{ height: '100%', width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
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
