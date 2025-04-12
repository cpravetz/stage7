import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Link, useTheme } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ConversationHistory from './ConversationHistory';
import { AgentStatistics } from '../shared-browser';
import { NetworkGraph } from './NetworkGraph';

interface WorkProduct {
  type: 'Interim' | 'Final';
  name: string;
  url: string;
}

interface TabbedPanelProps {
  conversationHistory: string[];
  workProducts: WorkProduct[];
  agentStatistics: Map<string, Array<AgentStatistics>>;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  conversationHistory,
  workProducts,
  agentStatistics
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
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          color="secondary"
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
      </Box>
    </Box>
  );
};

export default TabbedPanel;