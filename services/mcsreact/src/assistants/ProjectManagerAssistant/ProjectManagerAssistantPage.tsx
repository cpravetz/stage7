import React, { useState, useEffect, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { projectManagerAssistantClient } from '../shared/assistantClients';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, Dashboard as DashboardIcon, Task as TaskIcon, Timeline as TimelineIcon, People as PeopleIcon, Assessment as AssessmentIcon, Analytics as AnalyticsIcon, AttachMoney as AttachMoneyIcon, BarChart as BarChartIcon, CalendarToday as CalendarTodayIcon, Search as SearchIcon } from '@mui/icons-material';
import { ConversationMessage } from '@cktmcs/sdk';

// Import domain-specific components (these would be created as needed)
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

// Define types for project management domain
export interface Project {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  progress: number;
  budget: number;
  teamSize: number;
  priority: 'low' | 'medium' | 'high';
}

export interface Task {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  progress: number;
  dependencies: string[];
}

export interface TimelineItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: 'milestone' | 'phase' | 'task';
  status: string;
  progress: number;
}

export interface Resource {
  id: string;
  name: string;
  role: string;
  allocation: number;
  availability: number;
  projects: string[];
  skills: string[];
}

export interface Risk {
  id: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  status: string;
  mitigationPlan: string;
  owner: string;
}

export interface ProjectAnalytics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onTimeDeliveryRate: number;
  budgetComplianceRate: number;
  resourceUtilization: number;
  productivityMetrics: {
    tasksCompleted: number;
    tasksOverdue: number;
    averageCompletionTime: number;
  };
  riskDistribution: Record<string, number>;
}

export interface BudgetItem {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
  variance: number;
}

export interface StakeholderCommunication {
  id: string;
  stakeholder: string;
  subject: string;
  date: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  type: 'meeting' | 'email' | 'report';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'meeting' | 'deadline' | 'milestone';
  attendees: string[];
  location: string;
  description: string;
}

const ProjectManagerAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [projectAnalytics, setProjectAnalytics] = useState<ProjectAnalytics>({
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    onTimeDeliveryRate: 0,
    budgetComplianceRate: 0,
    resourceUtilization: 0,
    productivityMetrics: {
      tasksCompleted: 0,
      tasksOverdue: 0,
      averageCompletionTime: 0,
    },
    riskDistribution: {},
  });
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [stakeholderCommunications, setStakeholderCommunications] = useState<StakeholderCommunication[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <BaseAssistantPage
      title="Project Manager Assistant"
      description="Comprehensive project management assistance with task tracking, resource allocation, risk assessment, and project analytics."
      client={projectManagerAssistantClient}
      initialPrompt="Hello! I need help managing a project."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
        // Extract data from messages
        const extractLatestToolOutput = useCallback(<T,>(toolName: string, msgList: ConversationMessage[]): T | null => {
          const relevantMessages = msgList.filter(
            (msg) => msg.sender === 'tool' && (msg.content as any)?.tool === toolName
          );
          if (relevantMessages.length > 0) {
            return (relevantMessages[relevantMessages.length - 1].content as any) as T;
          }
          return null;
        }, []);

        // Update data when messages change
        useEffect(() => {
          setProjects(extractLatestToolOutput<{ projects: Project[] }>('ProjectManagementTool', messages)?.projects || []);
          setTasks(extractLatestToolOutput<{ tasks: Task[] }>('TaskManagementTool', messages)?.tasks || []);
          setTimelineItems(extractLatestToolOutput<{ timelineItems: TimelineItem[] }>('TimelineTool', messages)?.timelineItems || []);
          setResources(extractLatestToolOutput<{ resources: Resource[] }>('ResourceAllocationTool', messages)?.resources || []);
          setRisks(extractLatestToolOutput<{ risks: Risk[] }>('RiskAssessmentTool', messages)?.risks || []);
          setProjectAnalytics(extractLatestToolOutput<{ projectAnalytics: ProjectAnalytics }>('AnalyticsTool', messages)?.projectAnalytics || {
            totalProjects: 0,
            activeProjects: 0,
            completedProjects: 0,
            onTimeDeliveryRate: 0,
            budgetComplianceRate: 0,
            resourceUtilization: 0,
            productivityMetrics: {
              tasksCompleted: 0,
              tasksOverdue: 0,
              averageCompletionTime: 0,
            },
            riskDistribution: {},
          });
          setBudgetItems(extractLatestToolOutput<{ budgetItems: BudgetItem[] }>('BudgetTrackerTool', messages)?.budgetItems || []);
          setStakeholderCommunications(extractLatestToolOutput<{ stakeholderCommunications: StakeholderCommunication[] }>('CommunicationTool', messages)?.stakeholderCommunications || []);
          setCalendarEvents(extractLatestToolOutput<{ calendarEvents: CalendarEvent[] }>('CalendarTool', messages)?.calendarEvents || []);
        }, [messages, extractLatestToolOutput]);

        return (
          <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left Panel - Project Management Tools */}
            {(leftPanelOpen || !isMobile) && (
              <Box sx={{
                width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100%',
                borderRight: '1px solid #e0e0e0',
                overflowY: 'auto'
              }}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Project Management Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                    aria-label="project management tools tabs"
                  >
                    <Tab label="Project Dashboard" icon={<DashboardIcon />} iconPosition="start" />
                    <Tab label="Task Management" icon={<TaskIcon />} iconPosition="start" />
                    <Tab label="Timeline & Gantt" icon={<TimelineIcon />} iconPosition="start" />
                    <Tab label="Resource Allocation" icon={<PeopleIcon />} iconPosition="start" />
                    <Tab label="Risk Assessment" icon={<AssessmentIcon />} iconPosition="start" />
                    <Tab label="Project Analytics" icon={<AnalyticsIcon />} iconPosition="start" />
                    <Tab label="Budget Tracking" icon={<AttachMoneyIcon />} iconPosition="start" />
                    <Tab label="Stakeholder Comm" icon={<BarChartIcon />} iconPosition="start" />
                    <Tab label="Calendar & Scheduling" icon={<CalendarTodayIcon />} iconPosition="start" />
                  </Tabs>
                </Box>
              </Box>
            )}

            {/* Main Content Area */}
            <Box sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}>
              {/* Header with Title and Panel Toggles */}
              <Box sx={{
                p: 2,
                borderBottom: '1px solid #e0e0e0',
                backgroundColor: theme.palette.background.paper,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <Typography variant="h5" fontWeight="bold">
                  Project Manager Assistant
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

              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Project Manager Assistant" enableVoiceInput={true} />
            </Box>

            {/* Right Panel - Active Tool Content */}
            {(rightPanelOpen || !isMobile) && (
              <Box sx={{
                width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100%',
                borderLeft: '1px solid #e0e0e0',
                overflowY: 'auto',
                p: 2
              }}>
                {activeTab === 0 && <ProjectDashboard projects={projects} sendMessage={sendMessage} />}
                {activeTab === 1 && <TaskManagementCenter tasks={tasks} sendMessage={sendMessage} />}
                {activeTab === 2 && <TimelineAndGanttChart timelineItems={timelineItems} sendMessage={sendMessage} />}
                {activeTab === 3 && <ResourceAllocationTool resources={resources} sendMessage={sendMessage} />}
                {activeTab === 4 && <RiskAssessmentTool risks={risks} sendMessage={sendMessage} />}
                {activeTab === 5 && <ProjectAnalyticsDashboard projectAnalytics={projectAnalytics} sendMessage={sendMessage} />}
                {activeTab === 6 && <BudgetAndFinancialTracking budgetItems={budgetItems} sendMessage={sendMessage} />}
                {activeTab === 7 && <StakeholderCommunicationHub stakeholderCommunications={stakeholderCommunications} sendMessage={sendMessage} />}
                {activeTab === 8 && <ProjectCalendarAndScheduling calendarEvents={calendarEvents} sendMessage={sendMessage} />}
              </Box>
            )}
          </Box>
        );
      }}
    </BaseAssistantPage>
  );
};

export default ProjectManagerAssistantPage;


