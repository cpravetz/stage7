import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Link, useTheme } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ConversationHistory from './ConversationHistory';
import { AgentStatistics } from '../shared-browser';
import { NetworkGraph } from './NetworkGraph';
import { MissionFile } from '../context/WebSocketContext';
import { SecurityClient } from '../SecurityClient';
import FileUpload from './FileUpload';

interface WorkProduct {
  type: 'Interim' | 'Final' | 'Plan';
  name: string;
  url: string;
  workproduct: any;
}

interface TabbedPanelProps {
  conversationHistory: string[];
  workProducts: WorkProduct[];
  sharedFiles: MissionFile[];
  agentStatistics: Map<string, Array<AgentStatistics>>;
  activeMissionId?: string;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  conversationHistory,
  workProducts,
  sharedFiles,
  agentStatistics,
  activeMissionId
}) => {
  const [activeTab, setActiveTab] = useState('conversation');
  const theme = useTheme();
  const [descriptionDialog, setDescriptionDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  interface TabPanelProps {
    children?: React.ReactNode;
    index: string;
    value: string;
  }

  const TabPanel = React.memo((props: TabPanelProps) => {
    const { children, value, index, ...other } = props;
    const isActive = value === index;

    return (
      <div
        role="tabpanel"
        hidden={value !== index}
        id={`tabpanel-${index}`}
        aria-labelledby={`tab-${index}`}
        style={{ display: value === index ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}
        {...other}
      >
        <Box key={index} sx={{ height: '100%', p: 1, flexGrow: 1, display: 'flex', flexDirection: 'column' }}> 
          {children}
        </Box>
      </div>
    );
  }, (prevProps, nextProps) => {
    return prevProps.value === nextProps.value;
  });

  const handleChange = React.useCallback((_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  }, []);

  const securityClient = SecurityClient.getInstance(window.location.origin);

  const handleWorkProductClick = React.useCallback(async (event: React.MouseEvent<HTMLElement>, url: string) => {
    event.preventDefault();
    try {
      const apiClient = securityClient.getApi();
      const response = await apiClient.get(url, { responseType: 'blob' });
      const blob = response.data;
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error('[TabbedPanel] handleWorkProductClick: Error fetching work product:', error);
      alert('Failed to open work product. See console for details.');
    }
  }, [securityClient]);

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
          <Tab icon={<ChatIcon />} iconPosition="start" label="Conversation" value="conversation" />
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="Results" value="results" />
          <Tab icon={<AccountTreeIcon />} iconPosition="start" label="Agent Network" value="network" />
          <Tab icon={<AttachFileIcon />} iconPosition="start" label="Files" value="files" />
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <TabPanel value={activeTab} index="conversation">
          {React.useMemo(() => <ConversationHistory history={conversationHistory} />, [conversationHistory])}
        </TabPanel>

        <TabPanel value={activeTab} index="results">
          {React.useMemo(() => <TableContainer component={Paper} sx={{ maxHeight: '100%' }}>
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
                      <TableCell>{product.type}</TableCell>
                      <TableCell>
                        <Link component="button" variant="body2" onClick={(e) => handleWorkProductClick(e, product.url)}>
                          {product.name}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>, [workProducts, handleWorkProductClick])}
        </TabPanel>

        <TabPanel value={activeTab} index="network">
            {React.useMemo(() => <NetworkGraph agentStatistics={agentStatistics} zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan} />, [agentStatistics, zoom, pan])}
        </TabPanel>

        <TabPanel value={activeTab} index="files">
          {React.useMemo(() => activeMissionId ? (
            <FileUpload
              missionId={activeMissionId}
              sharedFiles={sharedFiles}
              onFilesChanged={() => { /* handle file changes, e.g., reload files list */ }}
              // Pass lifted dialog state and setters as props
              descriptionDialog={descriptionDialog}
              setDescriptionDialog={setDescriptionDialog}
              pendingFiles={pendingFiles}
              setPendingFiles={setPendingFiles}
              description={description}
              setDescription={setDescription}
            />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No active mission. Create or load a mission to manage files.
            </Typography>
          ), [activeMissionId, sharedFiles, descriptionDialog, pendingFiles, description])}
        </TabPanel>
      </Box>
    </Box>
  );
};

export default TabbedPanel;