import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { projectManagerAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import {
  Project,
  Task,
  TimelineItem,
  Resource,
  Risk,
  ProjectAnalytics,
  BudgetItem,
  StakeholderCommunication,
  CalendarEvent
} from './ProjectManagerAssistantPage';
import ProjectDashboard from './components/ProjectDashboard';
import TaskManagementCenter from './components/TaskManagementCenter';
import TimelineAndGanttChart from './components/TimelineAndGanttChart';
import ResourceAllocationTool from './components/ResourceAllocationTool';
import RiskAssessmentTool from './components/RiskAssessmentTool';
import ProjectAnalyticsDashboard from './components/ProjectAnalyticsDashboard';
import BudgetAndFinancialTracking from './components/BudgetAndFinancialTracking';
import StakeholderCommunicationHub from './components/StakeholderCommunicationHub';
import ProjectCalendarAndScheduling from './components/ProjectCalendarAndScheduling';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Separate component to hold the state and render logic
const ProjectManagerAssistantContent: React.FC<{
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent?: (event: any) => Promise<void>;
  assistantState?: Record<string, any>;
  conversationId?: string;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}> = ({
    messages, sendMessage, sendEvent = async () => {}, assistantState = {}, conversationId, isLoading, error, clientId
  }) => {
    const [tabValue, setTabValue] = useState(0);

    // Helper to build events with proper structure
    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    // Load initial state from Librarian on mount
    useEffect(() => {
      if (conversationId) {
        const collections = ['project', 'task', 'timelineItem', 'resource', 'risk', 'budgetItem', 'stakeholderCommunication', 'calendarEvent'];
        collections.forEach(collection => {
          sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
        });
      }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    // Extract state from assistantState
    const projects = useMemo<Project[]>(() => 
      assistantState?.project || [],
      [assistantState]
    );

    const tasks = useMemo<Task[]>(() => 
      assistantState?.task || [],
      [assistantState]
    );

    const timelineItems = useMemo<TimelineItem[]>(() => 
      assistantState?.timelineItem || [],
      [assistantState]
    );

    const resources = useMemo<Resource[]>(() => 
      assistantState?.resource || [],
      [assistantState]
    );

    const risks = useMemo<Risk[]>(() => 
      assistantState?.risk || [],
      [assistantState]
    );

    const budgetItems = useMemo<BudgetItem[]>(() => 
      assistantState?.budgetItem || [],
      [assistantState]
    );

    const stakeholderCommunications = useMemo<StakeholderCommunication[]>(() => 
      assistantState?.stakeholderCommunication || [],
      [assistantState]
    );

    const calendarEvents = useMemo<CalendarEvent[]>(() => 
      assistantState?.calendarEvent || [],
      [assistantState]
    );

    const projectAnalytics = useMemo<ProjectAnalytics>(() => {
        const analytics = assistantState.projectAnalytics;
        if (analytics && typeof analytics === 'object') {
            return analytics as ProjectAnalytics;
        }
        return {
            totalProjects: projects.length,
            activeProjects: projects.filter(p => p.status === 'active').length,
            completedProjects: projects.filter(p => p.status === 'completed').length,
            onTimeDeliveryRate: 0,
            budgetComplianceRate: 0,
            resourceUtilization: 0,
            productivityMetrics: {
                tasksCompleted: tasks.filter(t => t.status === 'completed').length,
                tasksOverdue: tasks.filter(t => new Date(t.endDate) < new Date() && t.status !== 'completed').length,
                averageCompletionTime: 0,
            },
            riskDistribution: {},
        };
    }, [assistantState, projects, tasks]);

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
                <Box component="div" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        indicatorColor="primary"
                        textColor="primary"
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label="project manager assistant features tabs"
                    >
                        <Tab label="Project Dashboard" />
                        <Tab label="Task Management" />
                        <Tab label="Timeline & Gantt" />
                        <Tab label="Resource Allocation" />
                        <Tab label="Risk Assessment" />
                        <Tab label="Project Analytics" />
                        <Tab label="Budget Tracking" />
                        <Tab label="Stakeholder Communication" />
                        <Tab label="Calendar & Scheduling" />
                    </Tabs>
                </Box>

                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <ProjectDashboard
                                projects={projects}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <TaskManagementCenter
                                tasks={tasks}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <TimelineAndGanttChart
                                timelineItems={timelineItems}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <ResourceAllocationTool
                                resources={resources}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <RiskAssessmentTool
                                risks={risks}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <ProjectAnalyticsDashboard
                                projectAnalytics={projectAnalytics}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <BudgetAndFinancialTracking
                                budgetItems={budgetItems}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <StakeholderCommunicationHub
                                stakeholderCommunications={stakeholderCommunications}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 8}>
                    {tabValue === 8 && (
                        <Box sx={{ p: 3 }}>
                            <ProjectCalendarAndScheduling
                                calendarEvents={calendarEvents}
                                sendMessage={sendMessage}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Project Manager Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const ProjectManagerAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Project Manager Assistant"
      description="Comprehensive project management assistance with task tracking, resource allocation, risk assessment, and project analytics."
      client={projectManagerAssistantClient}
      initialPrompt="Hello! I need help managing a project."
      clientId={clientId}
    >
      {({ messages, sendMessage, sendEvent, assistantState, isLoading, error, humanInputRequired, submitHumanInput }) => (
        <ProjectManagerAssistantContent
          messages={messages}
          sendMessage={sendMessage}
          sendEvent={sendEvent}
          assistantState={assistantState}
          isLoading={isLoading}
          error={error}
          clientId={clientId}
        />
      )}
    </BaseAssistantPage>
  );
};

export default ProjectManagerAssistant;


