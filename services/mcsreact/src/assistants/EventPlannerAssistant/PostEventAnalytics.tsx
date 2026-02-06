import React from 'react';
import { TableRow, Box, Typography, Card, Button, Table, TableBody, TableCell, TableContainer, Paper, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { Analytics as AnalyticsIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { AnalyticsData } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface PostEventAnalyticsProps {
  analytics: AnalyticsData;
  sendMessage: (message: string) => Promise<void>;
}

const PostEventAnalytics: React.FC<PostEventAnalyticsProps> = ({ analytics, sendMessage }) => {

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <AnalyticsIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Post-Event Analytics
      </Typography>

      <Box display="flex" justifyContent="space-around" sx={{ mb: 3 }}>
        <Box textAlign="center">
          <Typography variant="h4" fontWeight="bold">{analytics.overallRating}</Typography>
          <Typography variant="body2" color="text.secondary">Overall Rating</Typography>
          <Typography variant="body2" color="text.secondary">/5</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h4" fontWeight="bold">{analytics.attendeeSatisfaction}%</Typography>
          <Typography variant="body2" color="text.secondary">Attendee Satisfaction</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h4" fontWeight="bold">{analytics.budgetAccuracy}%</Typography>
          <Typography variant="body2" color="text.secondary">Budget Accuracy</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h4" fontWeight="bold">{analytics.vendorPerformance}</Typography>
          <Typography variant="body2" color="text.secondary">Vendor Performance</Typography>
          <Typography variant="body2" color="text.secondary">/5</Typography>
        </Box>
      </Box>

      <Typography variant="subtitle2" gutterBottom>
        Key Event Metrics
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableBody>
            {analytics.keyMetrics.map((metric, index) => (
              <TableRow key={index}>
                <TableCell>{metric.name}</TableCell>
                <TableCell>{metric.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle2" gutterBottom>
        Attendee Feedback ({analytics.feedbackCount} responses)
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>What went well?</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2">
              • Excellent venue selection and layout
              • High-quality catering and food variety
              • Smooth check-in process
              • Engaging speakers and content
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Areas for improvement</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2">
              • Some AV technical issues during presentations
              • Limited vegetarian options
              • Could use more networking opportunities
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'event-report', { trackBy: 'analytics' });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Generate Full Report
      </Button>
    </Card>
  );
};

export default PostEventAnalytics;

