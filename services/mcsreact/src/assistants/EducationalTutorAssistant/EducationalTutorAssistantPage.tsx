import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme, useMediaQuery, Box, Typography, Paper, Grid, Button, TextField, List, ListItem, ListItemText, Divider, Chip, Tabs, Tab, Card, CardContent, LinearProgress, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, Accordion, AccordionSummary, AccordionDetails, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Snackbar, Alert, FormControl, InputLabel, Select, MenuItem, FormHelperText } from '@mui/material/index.js';
import { Business as BusinessIcon, FilterList, Download, Share, Help, Chat, Visibility, VisibilityOff, Email, Phone, CalendarToday, CloudUpload, Search, Feedback, AttachFile, Schedule, School, Analytics, People, Assessment, LibraryBooks, Cancel, CheckCircle, Add, Edit, Delete, Save,ExpandMore } from '@mui/icons-material';
import { educationAssistantClient } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import CollaborativeTeachingTools from './CollaborativeTeachingTools';
import PersonalizedTutoringCenter from './PersonalizedTutoringCenter';
import StudentProgressTimeline from './StudentProgressTimeline';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import CurriculumPlanningHub from './CurriculumPlanningHub';
import PerformanceAnalyticsDashboard from './PerformanceAnalyticsDashboard';
import ResourceOrganizationDashboard from './ResourceOrganizationDashboard';
import StudentEngagementCenter from './StudentEngagementCenter'; // Assuming this is also a separate component
import AssessmentManagementSystem from './AssessmentManagementSystem'; // Assuming this is also a separate component
import ContentCreationStudio from './ContentCreationStudio'; // Assuming this is also a separate component


const EducationalTutorAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [learningPlans, setLearningPlans] = useState<Array<{
    id: string;
    topic: string;
    level: string;
    status: 'Not Started' | 'In Progress' | 'Completed';
    dueDate: string;
    resources: string[];
    studentId: string;
  }>>([]);
  const [students, setStudents] = useState<Array<{
    id: string; name: string; email: string; grade: string; subjects: string[]
  }>>([]);
  const [assessments, setAssessments] = useState<Array<{
    id: string;
    topic: string;
    score: number;
    maxScore: number;
    date: string;
  }>>([]);
  const [curriculumItems, setCurriculumItems] = useState<Array<{
    id: string; title: string; subject: string; gradeLevel: string; standards: string[]
  }>>([]);
  const [resources, setResources] = useState<Array<{
    id: string; title: string; type: string; url: string; subject: string
  }>>([]);
  const [lessons, setLessons] = useState<Array<{
    id: string; title: string; planId: string; date: string; duration: string; objectives: string; materials: string[]
  }>>([]);
  const [engagementTools, setEngagementTools] = useState<Array<{
    id: string; name: string; type: string; description: string
  }>>([]);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string; name: string; email: string; grade: string; subjects: string[]
  } | null>(null);
  const [selectedLearningPlan, setSelectedLearningPlan] = useState<{
    id: string;
    topic: string;
    level: string;
    status: 'Not Started' | 'In Progress' | 'Completed';
    dueDate: string;
    resources: string[];
    studentId: string;
  } | null>(null);
  const [newLearningPlan, setNewLearningPlan] = useState({ title: '', topic: '', level: '', status: 'Not Started' as const, dueDate: '', resources: [], studentId: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: '', content: null as string | null });
  const [progressData, setProgressData] = useState({ completion: 0, performance: 0, engagement: 0 });
  const [analyticsData, setAnalyticsData] = useState({ averageScore: 0, completionRate: 0, timeSpent: 0 });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? student.name : 'Unknown Student';
  };

  return (
    <BaseAssistantPage
      title="Educational Tutor Assistant"
      description="Your AI-powered tutor and teaching assistant."
      client={educationAssistantClient}
      initialPrompt="Hello! I need help with educational tutoring."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
        // Update conversationId from messages metadata
        React.useEffect(() => {
          if (messages.length > 0 && messages[0].metadata?.conversationId) {
            setConversationId(messages[0].metadata.conversationId);
          }
        }, [messages]);

        // Load real data from backend
        useEffect(() => {
          const loadData = async () => {
            try {
              if (!conversationId) {
                console.log('No conversation ID available yet for data loading.');
                // Fallback to minimal sample data if API fails or no conversation yet
                setLearningPlans([
                  { id: '1', topic: 'Sample Learning Plan', level: 'Intermediate', status: 'Not Started', dueDate: '2026-02-15', resources: [], studentId: 'student1' }
                ]);
                setStudents([
                  { id: 'student1', name: 'Sample Student', email: 'student@example.com', grade: '10', subjects: ['General Studies'] }
                ]);
                setAssessments([]);
                setCurriculumItems([
                  { id: '1', title: 'Sample Curriculum', subject: 'General', gradeLevel: '10', standards: ['General.Standards'] }
                ]);
                setResources([
                  { id: '1', title: 'Sample Resource', type: 'Document', url: '#', subject: 'General' }
                ]);
                setLessons([
                  { id: '1', title: 'Sample Lesson', planId: '1', date: '2026-01-05', duration: '60 min', objectives: 'Learn basics', materials: ['General Materials'] }
                ]);
                setEngagementTools([
                  { id: '1', name: 'Sample Tool', type: 'General', description: 'Sample engagement tool' }
                ]);
                setProgressData({ completion: 75, performance: 82, engagement: 68 });
                setAnalyticsData({ averageScore: 85, completionRate: 88, timeSpent: 125 });
                return;
              }

              // Skip context loading for now - use sample data
              // Future: Integrate with actual context API when available
              const contextData = { contextItems: [] };

              // Extract data from context or use default empty arrays
              const learningPlans = contextData.contextItems
                .filter((item: any) => item.type === 'learning_plan')
                .map((plan: any) => ({
                  id: plan.id,
                  topic: plan.title,
                  level: 'Intermediate',
                  status: 'Not Started' as const,
                  dueDate: '2026-02-15',
                  resources: [],
                  studentId: 'student1'
                }));

              const students = contextData.contextItems
                .filter((item: any) => item.type === 'student')
                .map((student: any) => ({
                  id: student.id,
                  name: student.title,
                  email: 'student@example.com',
                  grade: '10',
                  subjects: ['General Studies']
                }));

              const assessments = contextData.contextItems
                .filter((item: any) => item.type === 'assessment')
                .map((assessment: any) => ({
                  id: assessment.id,
                  topic: assessment.title,
                  score: 0,
                  maxScore: 100,
                  date: '2026-01-15'
                }));

              const curriculum = contextData.contextItems
                .filter((item: any) => item.type === 'curriculum')
                .map((item: any) => ({
                  id: item.id,
                  title: item.title,
                  subject: 'General', // Placeholder - would come from actual data
                  gradeLevel: '10', // Placeholder - would come from actual data
                  standards: ['General.Standards'] // Placeholder - would come from actual data
                }));

              const resources = contextData.contextItems
                .filter((item: any) => item.type === 'resource')
                .map((resource: any) => ({
                  id: resource.id,
                  title: resource.title,
                  type: 'Document', // Placeholder - would come from actual data
                  url: resource.link || '#',
                  subject: 'General' // Placeholder - would come from actual data
                }));

              const lessons = contextData.contextItems
                .filter((item: any) => item.type === 'lesson')
                .map((lesson: any) => ({
                  id: lesson.id,
                  title: lesson.title,
                  planId: '1', // Placeholder - would come from actual data
                  date: '2026-01-05', // Placeholder - would come from actual data
                  duration: '60 min', // Placeholder - would come from actual data
                  objectives: lesson.preview || '',
                  materials: ['General Materials'] // Placeholder - would come from actual data
                }));

              const engagementTools = contextData.contextItems
                .filter((item: any) => item.type === 'tool')
                .map((tool: any) => ({
                  id: tool.id,
                  name: tool.title,
                  type: 'General', // Placeholder - would come from actual data
                  description: tool.preview || ''
                }));

              // Set the loaded data
              setLearningPlans(learningPlans.length > 0 ? learningPlans : [
                { id: '1', topic: 'Sample Learning Plan', level: 'Intermediate', status: 'Not Started', dueDate: '2026-02-15', resources: [], studentId: 'student1' }
              ]);

              setStudents(students.length > 0 ? students : [
                { id: 'student1', name: 'Sample Student', email: 'student@example.com', grade: '10', subjects: ['General Studies'] }
              ]);

              setAssessments(assessments);

              setCurriculumItems(curriculum.length > 0 ? curriculum : [
                { id: '1', title: 'Sample Curriculum', subject: 'General', gradeLevel: '10', standards: ['General.Standards'] }
              ]);

              setResources(resources.length > 0 ? resources : [
                { id: '1', title: 'Sample Resource', type: 'Document', url: '#', subject: 'General' }
              ]);

              setLessons(lessons.length > 0 ? lessons : [
                { id: '1', title: 'Sample Lesson', planId: '1', date: '2026-01-05', duration: '60 min', objectives: 'Learn basics', materials: ['General Materials'] }
              ]);

              setEngagementTools(engagementTools.length > 0 ? engagementTools : [
                { id: '1', name: 'Sample Tool', type: 'General', description: 'Sample engagement tool' }
              ]);

              setProgressData({ completion: 75, performance: 82, engagement: 68 });
              setAnalyticsData({ averageScore: 85, completionRate: 88, timeSpent: 125 });

            } catch (error) {
              console.error('Error loading educational data:', error);
              setSnackbarMessage('Failed to load educational data from backend');
              setSnackbarSeverity('error');
              setSnackbarOpen(true);
              
              // Fallback to minimal sample data if API fails
              setLearningPlans([
                { id: '1', topic: 'Sample Learning Plan', level: 'Intermediate', status: 'Not Started', dueDate: '2026-02-15', resources: [], studentId: 'student1' }
              ]);
              setStudents([
                { id: 'student1', name: 'Sample Student', email: 'student@example.com', grade: '10', subjects: ['General Studies'] }
              ]);
              setAssessments([]);
              setCurriculumItems([
                { id: '1', title: 'Sample Curriculum', subject: 'General', gradeLevel: '10', standards: ['General.Standards'] }
              ]);
              setResources([
                { id: '1', title: 'Sample Resource', type: 'Document', url: '#', subject: 'General' }
              ]);
              setLessons([
                { id: '1', title: 'Sample Lesson', planId: '1', date: '2026-01-05', duration: '60 min', objectives: 'Learn basics', materials: ['General Materials'] }
              ]);
              setEngagementTools([
                { id: '1', name: 'Sample Tool', type: 'General', description: 'Sample engagement tool' }
              ]);
              setProgressData({ completion: 75, performance: 82, engagement: 68 });
              setAnalyticsData({ averageScore: 85, completionRate: 88, timeSpent: 125 });
            }
          };
      
          loadData();
        }, [conversationId]);


        const handleCreateLearningPlan = () => {
          if (!newLearningPlan.title || !newLearningPlan.studentId) {
            setSnackbarMessage('Title and Student are required');
            setSnackbarSeverity('warning');
            setSnackbarOpen(true);
            return;
          }
      
          const newPlan = {
            ...newLearningPlan,
            id: Date.now().toString(),
            progress: 0
          };
      
          setLearningPlans([...learningPlans, newPlan]);
          setNewLearningPlan({ title: '', topic: '', level: '', status: 'Not Started' as const, dueDate: '', resources: [], studentId: '' });
          setSnackbarMessage('Learning plan created successfully');
          setSnackbarSeverity('success');
          setSnackbarOpen(true);
        };
      
        const handleUpdateLearningPlan = () => {
          if (!selectedLearningPlan) return;
      
          setLearningPlans(learningPlans.map(plan => 
            plan.id === selectedLearningPlan.id ? selectedLearningPlan : plan
          ));
          setSelectedLearningPlan(null);
          setSnackbarMessage('Learning plan updated successfully');
          setSnackbarSeverity('success');
          setSnackbarOpen(true);
        };
      
        const handleDeleteLearningPlan = (planId: string) => {
          setLearningPlans(learningPlans.filter(plan => plan.id !== planId));
          setSnackbarMessage('Learning plan deleted');
          setSnackbarSeverity('info');
          setSnackbarOpen(true);
        };
      
        const handleStudentSelect = (student: any) => { // Type student properly
          setSelectedStudent(student);
          // Filter learning plans for this student
          const studentPlans = learningPlans.filter(plan => plan.studentId === student.id);
          if (studentPlans.length > 0) {
            setSelectedLearningPlan(studentPlans[0]);
          }
        };
      
        const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
          setSearchTerm(e.target.value);
        };
      
        const handleAssistantInteraction = async (prompt: string) => {
          try {
            // Set loading state
            setAssistantLoading(true);
            
            // Send the prompt to the assistant via the sendMessage from BaseAssistantPage
            await sendMessage(prompt);
            
            // The assistant's response will come through the WebSocket message handler
          } catch (error) {
            console.error('Error interacting with assistant:', error);
            setSnackbarMessage('Error interacting with educational assistant');
            setSnackbarSeverity('error');
            setSnackbarOpen(true);
          } finally {
            setAssistantLoading(false);
          }
        };
      
        const filteredLearningPlans = learningPlans.filter(plan => 
          plan.topic.toLowerCase().includes(searchTerm.toLowerCase())
        );
      
        const filteredStudents = students.filter(student => 
          student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.email.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const renderLearningPlanBuilder = () => (
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              <School sx={{ mr: 1, verticalAlign: 'middle' }} />
              Learning Plan Builder
            </Typography>
      
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                {selectedLearningPlan ? 'Edit Learning Plan' : 'Create New Learning Plan'}
              </Typography>
      
              <Grid container spacing={3}>
                <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                  <TextField
                    fullWidth
                    label="Topic"
                    value={selectedLearningPlan ? selectedLearningPlan.topic : ''}
                    onChange={(e) => {
                      if (selectedLearningPlan) {
                        setSelectedLearningPlan({...selectedLearningPlan, topic: e.target.value});
                      }
                    }}
                    margin="normal"
                    required
                  />
                </Grid>
      
                <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                  <TextField
                    fullWidth
                    label="Level"
                    select
                    value={selectedLearningPlan ? selectedLearningPlan.level : ''}
                    onChange={(e) => {
                      if (selectedLearningPlan) {
                        setSelectedLearningPlan({...selectedLearningPlan, level: e.target.value});
                      }
                    }}
                    margin="normal"
                    required
                    SelectProps={{ native: true }}
                  >
                    <option value="">Select level</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </TextField>
                </Grid>
      
                <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                  <TextField
                    fullWidth
                    label="Status"
                    select
                    value={selectedLearningPlan ? selectedLearningPlan.status : ''}
                    onChange={(e) => {
                      if (selectedLearningPlan) {
                        setSelectedLearningPlan({...selectedLearningPlan, status: e.target.value as 'Not Started' | 'In Progress' | 'Completed'});
                      }
                    }}
                    margin="normal"
                    required
                    SelectProps={{ native: true }}
                  >
                    <option value="">Select status</option>
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </TextField>
                </Grid>
      
                <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                  <TextField
                    fullWidth
                    label="Due Date"
                    type="date"
                    value={selectedLearningPlan ? selectedLearningPlan.dueDate : ''}
                    onChange={(e) => {
                      if (selectedLearningPlan) {
                        setSelectedLearningPlan({...selectedLearningPlan, dueDate: e.target.value});
                      }
                    }}
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid {...({ xs: 12, item: true } as any)}>
                  <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                    {selectedLearningPlan ? (
                      <>
                        <Button 
                          variant="contained"
                          color="primary"
                          startIcon={<Save />}
                          onClick={() => {}}
                          disabled={assistantLoading}
                        >
                          Update Learning Plan
                        </Button>
                        <Button 
                          variant="outlined"
                          startIcon={<Cancel />}
                          onClick={() => setSelectedLearningPlan(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                  </Box>
                </Grid>
              </Grid>
            </Paper>
      
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Existing Learning Plans
              </Typography>
      
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <TextField
                  placeholder="Search learning plans..."
                  variant="outlined"
                  size="small"
                  value={searchTerm}
                  onChange={handleSearch}
                  InputProps={{ startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} /> }}
                  sx={{ width: 300 }}
                />
              </Box>
      
              {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : filteredLearningPlans.length === 0 ? (
                <Typography color="textSecondary" align="center" sx={{ p: 4 }}>
                  No learning plans found. Create your first learning plan!
                </Typography>
              ) : (
                <List>
                  {filteredLearningPlans.map((plan) => (
                    <React.Fragment key={plan.id}>
                      <ListItem 
                        secondaryAction={
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Edit plan">
                              <IconButton edge="end" onClick={() => setSelectedLearningPlan(plan)}>
                                <Edit color="primary" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete plan">
                              <IconButton edge="end" onClick={() => handleDeleteLearningPlan(plan.id)}>
                                <Delete color="error" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        }
                      >
                        <ListItemText
                          primary={plan.topic}
                          secondary={
                            <React.Fragment>
                              <Typography component="span" variant="body2" color="textPrimary">
                                {plan.level} • {plan.status}
                              </Typography>
                              <br />
                              <Typography component="span" variant="body2" color="textSecondary">
                                Due: {plan.dueDate}
                              </Typography>
                            </React.Fragment>
                          }
                        />
                      </ListItem>
                      <Divider component="li" />
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Paper>
            {/* Personalized Tutoring Center integration */}
            <PersonalizedTutoringCenter 
              learningPlans={learningPlans} // Pass the fetched learning plans
            />
          </Box>
        );
      
        const renderStudentProgressTracker = () => (
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              <People sx={{ mr: 1, verticalAlign: 'middle' }} />
              Student Progress Tracker
            </Typography>
      
            <Grid container spacing={3}>
              <Grid {...({ xs: 12, md: 4, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Student Selection
                  </Typography>
      
                  <List>
                    {filteredStudents.map((student) => (
                      <ListItem 
                        key={student.id}
                        button
                        selected={selectedStudent?.id === student.id}
                        onClick={() => handleStudentSelect(student)}
                        sx={{ borderRadius: 1, mb: 1 }}
                      >
                        <ListItemText
                          primary={student.name}
                          secondary={`Grade ${student.subjects.join(', ')}`}
                        />
                        {selectedStudent?.id === student.id && <CheckCircle color="primary" />}
                      </ListItem>
                    ))}
                  </List>
      
                  <Button 
                    variant="outlined"
                    startIcon={<Add />}
                    fullWidth
                    sx={{ mt: 2 }}
                    onClick={() => setDialogOpen(true)} // Open generic dialog for now
                  >
                    Add Student
                  </Button>
                </Paper>
              </Grid>
      
              <Grid {...({ xs: 12, md: 8, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  {selectedStudent ? (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h6">
                          {selectedStudent.name}'s Progress
                        </Typography>
                        <Chip 
                          label={`Grade ${selectedStudent.grade}`}
                          color="primary"
                          variant="outlined"
                        />
                      </Box>
      
                      <Grid container spacing={3}>
                        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                          <Typography variant="subtitle1" gutterBottom>
                            Overall Progress
                          </Typography>
                          <LinearProgress 
                            variant="determinate"
                            value={progressData.completion}
                            sx={{ height: 10, borderRadius: 5, mb: 2 }}
                          />
                          <Typography variant="body2" color="textSecondary">
                            {progressData.completion}% completion rate
                          </Typography>
                        </Grid>
      
                        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                          <Typography variant="subtitle1" gutterBottom>
                            Performance Score
                          </Typography>
                          <LinearProgress 
                            variant="determinate"
                            value={progressData.performance}
                            color="success"
                            sx={{ height: 10, borderRadius: 5, mb: 2 }}
                          />
                          <Typography variant="body2" color="textSecondary">
                            {progressData.performance}/100 average score
                          </Typography>
                        </Grid>
      
                        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                          <Typography variant="subtitle1" gutterBottom>
                            Engagement Level
                          </Typography>
                          <LinearProgress 
                            variant="determinate"
                            value={progressData.engagement}
                            color="info"
                            sx={{ height: 10, borderRadius: 5, mb: 2 }}
                          />
                          <Typography variant="body2" color="textSecondary">
                            {progressData.engagement}% engagement
                          </Typography>
                        </Grid>
      
                        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                          <Typography variant="subtitle1" gutterBottom>
                            Time Spent Learning
                          </Typography>
                          <Typography variant="h4" color="primary">
                            {analyticsData.timeSpent} hours
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            This month
                          </Typography>
                        </Grid>
                      </Grid>
      
                      <Divider sx={{ my: 3 }} />
      
                      <Typography variant="subtitle1" gutterBottom>
                        Recent Activity
                      </Typography>
      
                      <StudentProgressTimeline 
                        conversationId={conversationId}
                        client={educationAssistantClient} 
                        setError={() => {}} // setError prop is no longer needed
                        selectedStudent={selectedStudent} 
                      />
                    </>
                  ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                      <Typography color="textSecondary">
                        Select a student to view progress
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        );
      
        const renderAssessmentManagement = () => (
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
              Assessment Management
            </Typography>
            <AssessmentManagementSystem
              conversationId={conversationId}
              client={educationAssistantClient}
              setError={() => {}}
              assessments={assessments}
            />
          </Box>
        );
      
        const renderLessonPlanner = () => (
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              <Schedule sx={{ mr: 1, verticalAlign: 'middle' }} />
              Lesson Planner
            </Typography>
      
            <Grid container spacing={3}>
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Upcoming Lessons
                  </Typography>
      
                  <List>
                    {lessons.slice(0, 5).map((lesson) => (
                      <React.Fragment key={lesson.id}>
                        <ListItem 
                          secondaryAction={
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="Edit lesson">
                                <IconButton edge="end" onClick={() => setDialogContent({ 
                                  title: 'Edit Lesson', 
                                  content: 'Lesson editing form would be implemented here'
                                })}
                                >
                                  <Edit color="primary" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="View details">
                                <IconButton edge="end" onClick={() => setDialogContent({ 
                                  title: lesson.title, 
                                  content: 'Detailed lesson information would be displayed here'
                                })}
                                >
                                  <Visibility color="info" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          }
                        >
                          <ListItemText
                            primary={lesson.title}
                            secondary={
                              <>
                                <Typography component="span" variant="body2" color="textPrimary">
                                  {lesson.date} • {lesson.duration}
                                </Typography>
                                <br />
                                <Typography component="span" variant="body2" color="textSecondary">
                                  {lesson.objectives}
                                </Typography>
                              </>
                            }
                          />
                        </ListItem>
                        <Divider component="li" />
                      </React.Fragment>
                    ))}
                  </List>
      
                  <Button 
                    variant="contained"
                    startIcon={<Add />}
                    fullWidth
                    sx={{ mt: 2 }}
                    onClick={() => setDialogContent({ 
                      title: 'Create New Lesson', 
                      content: 'Lesson creation form would be implemented here'
                    })}
                  >
                    Schedule New Lesson
                  </Button>
                </Paper>
              </Grid>
      
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Weekly Schedule
                  </Typography>
      
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[...Array(5)].map((_, dayIndex) => {
                      const day = new Date();
                      day.setDate(day.getDate() + dayIndex);
                      const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });
                      const dayLessons = lessons.filter(lesson => {
                        const lessonDate = new Date(lesson.date);
                        return lessonDate.toDateString() === day.toDateString();
                      });
      
                      return (
                        <Card key={dayIndex} variant="outlined">
                          <CardContent>
                            <Typography variant="subtitle1" gutterBottom>
                              {dayName} - {day.toLocaleDateString()}
                            </Typography>
      
                            {dayLessons.length > 0 ? (
                              <List dense>
                                {dayLessons.map((lesson) => (
                                  <ListItem key={lesson.id} sx={{ py: 0.5 }}>
                                    <ListItemText
                                      primary={lesson.title}
                                      secondary={`${lesson.duration} • ${lesson.objectives}`}
                                    />
                                  </ListItem>
                                ))}
                              </List>
                            ) : (
                              <Typography variant="body2" color="textSecondary">
                                No lessons scheduled
                              </Typography>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
      
            <Box sx={{ mt: 3 }}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Lesson Planning Tools
                </Typography>
      
                <Grid container spacing={3}>
                  <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                    <Card>
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          <Add sx={{ mr: 1, verticalAlign: 'middle', color: 'primary.main' }} />
                          Quick Lesson Creation
                        </Typography>
                        <Typography variant="body2" color="textSecondary" paragraph>
                          Create lessons quickly with templates and AI assistance
                        </Typography>
                        <Button 
                          variant="outlined"
                          startIcon={<Add />}
                          onClick={() => setDialogOpen(true)}
                        >
                          Create Quick Lesson
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
      
                  <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                    <Card>
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          <Schedule sx={{ mr: 1, verticalAlign: 'middle', color: 'success.main' }} />
                          Schedule Management
                        </Typography>
                        <Typography variant="body2" color="textSecondary" paragraph>
                          Manage your weekly and monthly lesson schedules
                        </Typography>
                        <Button 
                          variant="outlined"
                          startIcon={<CalendarToday />}
                          onClick={() => setDialogOpen(true)}
                        >
                          Manage Schedule
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          </Box>
        );

        const renderHumanInTheLoop = () => (
          <Box sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              <Help sx={{ mr: 1, verticalAlign: 'middle' }} />
              Human-in-the-Loop Support
            </Typography>
      
            <Grid container spacing={3}>
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    AI Assistant Chat
                  </Typography>
      
                  <Typography variant="body2" color="textSecondary" paragraph>
                    Get real-time assistance from the educational AI assistant
                  </Typography>
      
                  <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <TextField
                      fullWidth
                      placeholder="Ask the educational assistant..."
                      variant="outlined"
                      size="small"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.target as HTMLInputElement;
                          handleAssistantInteraction(input.value);
                          input.value = '';
                        }
                      }}
                    />
                    <Button 
                      variant="contained"
                      startIcon={<Chat />}
                      disabled={assistantLoading}
                    >
                      Send
                    </Button>
                  </Box>
      
                  {isLoading ? ( // Use isLoading from BaseAssistantPage
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <CircularProgress size={20} />
                      <Typography variant="body2" color="textSecondary">
                        Assistant is thinking...
                      </Typography>
                    </Box>
                  ) : (messages.length > 0 && messages[messages.length - 1].sender === 'assistant') ? ( // Display last assistant message
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        {(messages[messages.length - 1].content as any)?.text || (messages[messages.length - 1].content as any)?.title || '...'}
                      </Typography>
                    </Alert>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      Ask questions about lesson planning, student assessment, curriculum development, or any educational topic
                    </Typography>
                  )}
      
                  <Divider sx={{ my: 3 }} />
      
                  <Typography variant="subtitle1" gutterBottom>
                    Quick Actions
                  </Typography>
      
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Button 
                      variant="outlined"
                      startIcon={<School />}
                      onClick={() => handleAssistantInteraction('Help me create a learning plan for advanced mathematics')}
                    >
                      Create Learning Plan
                    </Button>
                    <Button 
                      variant="outlined"
                      startIcon={<Assessment />}
                      onClick={() => handleAssistantInteraction('Generate assessment questions for literature analysis')}
                    >
                      Generate Assessment
                    </Button>
                    <Button 
                      variant="outlined"
                      startIcon={<LibraryBooks />}
                      onClick={() => handleAssistantInteraction('Find curriculum resources for computer science')}
                    >
                      Find Curriculum Resources
                    </Button>
                  </Box>
                </Paper>
              </Grid>
      
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Support Resources
                  </Typography>
      
                  <List>
                    <ListItem>
                      <ListItemText 
                        primary="Educational Best Practices Guide"
                        secondary="Comprehensive guide to effective teaching methods"
                      />
                      <Button variant="outlined" size="small">View</Button>
                    </ListItem>
      
                    <ListItem>
                      <ListItemText 
                        primary="Assessment Design Handbook"
                        secondary="Guide to creating effective assessments"
                      />
                      <Button variant="outlined" size="small">View</Button>
                    </ListItem>
      
                    <ListItem>
                      <ListItemText 
                        primary="Curriculum Standards Reference"
                        secondary="Complete reference for educational standards"
                      />
                      <Button variant="outlined" size="small">View</Button>
                    </ListItem>
                  </List>
      
                  <Divider sx={{ my: 3 }} />
      
                  <Typography variant="subtitle1" gutterBottom>
                    Contact Support
                  </Typography>
      
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button 
                      variant="contained"
                      startIcon={<Chat />}
                      color="success"
                      onClick={() => setDialogOpen(true)}
                    >
                      Live Chat Support
                    </Button>
      
                    <Button 
                      variant="outlined"
                      startIcon={<Email />}
                      onClick={() => setDialogOpen(true)}
                    >
                      Email Support
                    </Button>
      
                    <Button 
                      variant="outlined"
                      startIcon={<Phone />}
                      onClick={() => setDialogOpen(true)}
                    >
                      Phone Support
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
      
            <Box sx={{ mt: 3 }}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Recent Support Requests
                </Typography>
      
                <List>
                  <ListItem>
                    <ListItemText 
                      primary="Help with assessment grading"
                      secondary="Jan 5, 2026 • Resolved"
                    />
                    <Chip label="Resolved" color="success" size="small" />
                  </ListItem>
      
                  <ListItem>
                    <ListItemText 
                      primary="Curriculum alignment question"
                      secondary="Jan 3, 2026 • Resolved"
                    />
                    <Chip label="Resolved" color="success" size="small" />
                  </ListItem>
      
                  <ListItem>
                    <ListItemText 
                      primary="Learning plan optimization"
                      secondary="Dec 28, 2025 • Resolved"
                    />
                    <Chip label="Resolved" color="success" size="small" />
                  </ListItem>
                </List>
              </Paper>
            </Box>
          </Box>
        );

        return (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, pb: 2 }}>
              <Typography variant="h4" gutterBottom>
                <School sx={{ mr: 1, verticalAlign: 'middle' }} />
                Educational Tutor Assistant
              </Typography>
              <Typography variant="subtitle1" color="textSecondary">
                Create personalized learning plans, manage assessments, track student progress, and develop educational content
              </Typography>
            </Box>
      
            <Box sx={{ px: 3, mb: 2 }}>
              <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
                <Tab label="Learning Plan Builder" icon={<School />} iconPosition="start" />
                <Tab label="Student Progress" icon={<People />} iconPosition="start" />
                <Tab label="Assessment Management" icon={<Assessment />} iconPosition="start" />
                <Tab label="Curriculum Library" icon={<LibraryBooks />} iconPosition="start" />
                <Tab label="Performance Analytics" icon={<Analytics />} iconPosition="start" />
                <Tab label="Resource Repository" icon={<AttachFile />} iconPosition="start" />
                <Tab label="Lesson Planner" icon={<Schedule />} iconPosition="start" />
                <Tab label="Engagement Tools" icon={<Feedback />} iconPosition="start" />
                <Tab label="Support" icon={<Help />} iconPosition="start" />
              </Tabs>
            </Box>
      
            <Divider />
      
            <Grid container sx={{ flex: 1, overflow: 'hidden' }}>
              {/* Left Panel - Chat */}
              <Grid {...({ xs: 12, md: 6, component: "div", sx: {
                  height: '100%',
                  borderRight: '1px solid #e0e0e0',
                  overflowY: 'auto'
                }, item: true } as any)}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Educational Tutor" enableVoiceInput={true} />
              </Grid>
      
              {/* Right Panel - Active Tool Content */}
              <Grid {...({ xs: 12, md: 6, component: "div", sx: {
                  height: '100%',
                  overflowY: 'auto',
                  backgroundColor: theme.palette.background.default
                }, item: true } as any)}>
                <Box sx={{ p: 1, width: '100%', height: '100%' }}>
                  {activeTab === 0 && renderLearningPlanBuilder()}
                  {activeTab === 1 && renderStudentProgressTracker()}
                  {activeTab === 2 && renderAssessmentManagement()}
                  {activeTab === 3 && <CurriculumPlanningHub
                    conversationId={conversationId}
                    client={educationAssistantClient}
                    setError={() => {}}
                  />}
                  {activeTab === 4 && <PerformanceAnalyticsDashboard
                    conversationId={conversationId}
                    client={educationAssistantClient}
                    setError={() => {}}
                  />}
                  {activeTab === 5 && <ResourceOrganizationDashboard
                    conversationId={conversationId}
                    client={educationAssistantClient}
                    setError={() => {}}
                  />}
                  {activeTab === 6 && renderLessonPlanner()}
                  {activeTab === 7 && <CollaborativeTeachingTools
                    conversationId={conversationId}
                    client={educationAssistantClient}
                    setError={() => {}}
                  />}
                  {activeTab === 8 && renderHumanInTheLoop()}
                </Box>
              </Grid>
            </Grid>
      
            <Dialog 
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              fullWidth
              maxWidth="md"
            >
              <DialogTitle>{dialogContent.title}</DialogTitle>
              <DialogContent>
                <Typography variant="body1" sx={{ mt: 2 }}>
                  {dialogContent.content}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDialogOpen(false)}>Close</Button>
              </DialogActions>
            </Dialog>
      
            <Snackbar 
              open={snackbarOpen}
              autoHideDuration={6000}
              onClose={() => setSnackbarOpen(false)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
              <Alert 
                onClose={() => setSnackbarOpen(false)}
                severity={snackbarSeverity}
                sx={{ width: '100%' }}
              >
                {snackbarMessage}
              </Alert>
            </Snackbar>
          </Box>
        );
      }}
    </BaseAssistantPage>
  );
};

export default EducationalTutorAssistantPage;


