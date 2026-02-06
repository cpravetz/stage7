// services/mcsreact/src/assistants/ProjectManagerAssistant/components/RiskAssessmentTool.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, ListItemAvatar, Avatar, Grid, Button, TextField, MenuItem, Select, FormControl, InputLabel, Paper, IconButton, Tooltip } from '@mui/material';
import { Risk } from '../ProjectManagerAssistantPage';
import { Person as PersonIcon, Warning as WarningIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon, Info as InfoIcon, Add as AddIcon, Edit as EditIcon, Assessment as AssessmentIcon, Shield as ShieldIcon, PriorityHigh as PriorityHighIcon } from '@mui/icons-material';

interface RiskAssessmentToolProps {
  risks: Risk[];
  sendMessage: (message: string) => void;
}

const RiskAssessmentTool: React.FC<RiskAssessmentToolProps> = ({ risks, sendMessage }) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLikelihood, setFilterLikelihood] = useState('all');
  const [filterImpact, setFilterImpact] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);

  const getLikelihoodColor = (likelihood: 'low' | 'medium' | 'high') => {
    switch (likelihood) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getImpactColor = (impact: 'low' | 'medium' | 'high') => {
    switch (impact) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'mitigated': return 'success';
      case 'active': return 'error';
      case 'monitoring': return 'warning';
      case 'closed': return 'default';
      default: return 'default';
    }
  };

  const calculateRiskScore = (risk: Risk) => {
    const likelihoodScore = risk.likelihood === 'high' ? 3 : risk.likelihood === 'medium' ? 2 : 1;
    const impactScore = risk.impact === 'high' ? 3 : risk.impact === 'medium' ? 2 : 1;
    return likelihoodScore * impactScore;
  };

  const filteredRisks = risks.filter(risk => {
    const statusMatch = filterStatus === 'all' || risk.status.toLowerCase() === filterStatus;
    const likelihoodMatch = filterLikelihood === 'all' || risk.likelihood === filterLikelihood;
    const impactMatch = filterImpact === 'all' || risk.impact === filterImpact;
    const searchMatch = risk.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       risk.owner.toLowerCase().includes(searchTerm.toLowerCase());
    return statusMatch && likelihoodMatch && impactMatch && searchMatch;
  });

  const highRisks = risks.filter(r => calculateRiskScore(r) >= 6);
  const activeRisks = risks.filter(r => r.status.toLowerCase() === 'active');
  const mitigatedRisks = risks.filter(r => r.status.toLowerCase() === 'mitigated');

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Risk Assessment Tool
      </Typography>

      {/* Filters and Search */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Search Risks"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by description or owner..."
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as string)}
                label="Status"
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="monitoring">Monitoring</MenuItem>
                <MenuItem value="mitigated">Mitigated</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Likelihood</InputLabel>
              <Select
                value={filterLikelihood}
                onChange={(e) => setFilterLikelihood(e.target.value as 'low' | 'medium' | 'high' | 'all')}
                label="Likelihood"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Impact</InputLabel>
              <Select
                value={filterImpact}
                onChange={(e) => setFilterImpact(e.target.value as 'low' | 'medium' | 'high' | 'all')}
                label="Impact"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <Button 
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Identify and add new project risks')}
              size="medium"
            >
              Add Risk
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Total Risks
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {risks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                High Risks
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="error.main">
                {highRisks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Active Risks
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {activeRisks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Mitigated
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {mitigatedRisks.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {Math.round((mitigatedRisks.length / risks.length) * 100 || 0)}% resolved
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Risk List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Project Risks ({filteredRisks.length})
      </Typography>

      {highRisks.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="caption" color="error" fontWeight="medium">
            {highRisks.length} high-risk item(s) require immediate attention
          </Typography>
        </Box>
      )}

      <List sx={{ mb: 3 }}>
        {filteredRisks.map((risk) => (
          <React.Fragment key={risk.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update risk ${risk.description} status`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => setSelectedRisk(risk)}> 
                    <AssessmentIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2, cursor: 'pointer' }}
              onClick={() => setSelectedRisk(risk)}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: getStatusColor(risk.status) }}>
                  {calculateRiskScore(risk) >= 6 ? <PriorityHighIcon fontSize="small" /> : <WarningIcon fontSize="small" />}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {risk.description}
                    </Typography>
                    <Chip 
                      label={`Score: ${calculateRiskScore(risk)}`}
                      color={calculateRiskScore(risk) >= 6 ? 'error' : calculateRiskScore(risk) >= 4 ? 'warning' : 'success'}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={risk.status}
                      color={getStatusColor(risk.status)}
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Chip 
                        label={`Likelihood: ${risk.likelihood}`}
                        color={getLikelihoodColor(risk.likelihood)}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Chip 
                        label={`Impact: ${risk.impact}`}
                        color={getImpactColor(risk.impact)}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="caption" color="textSecondary">
                        Owner: {risk.owner}
                      </Typography>
                    </Box>

                    {risk.mitigationPlan && (
                      <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                        <Typography variant="caption" fontWeight="medium" color="primary">
                          Mitigation Plan:
                        </Typography>
                        <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                          {risk.mitigationPlan}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

      {/* Selected Risk Details */}
      {selectedRisk && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Risk Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedRisk.description}
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={`Risk Score: ${calculateRiskScore(selectedRisk)}`}
                      color={calculateRiskScore(selectedRisk) >= 6 ? 'error' : calculateRiskScore(selectedRisk) >= 4 ? 'warning' : 'success'}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`Status: ${selectedRisk.status}`}
                      color={getStatusColor(selectedRisk.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`Likelihood: ${selectedRisk.likelihood}`}
                      color={getLikelihoodColor(selectedRisk.likelihood)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`Impact: ${selectedRisk.impact}`}
                      color={getImpactColor(selectedRisk.impact)}
                      size="small"
                    />
                  </Box>

                  {/* Risk Matrix Visualization */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Risk Assessment Matrix
                  </Typography>
                  <Paper elevation={1} sx={{ p: 2, mb: 2, textAlign: 'center' }}>
                    <Grid container spacing={1} justifyContent="center">
                      <Grid item xs={4}>
                        <Typography variant="caption" fontWeight="bold">Impact →</Typography>
                      </Grid>
                      <Grid item xs={2}><Typography variant="caption">Low</Typography></Grid>
                      <Grid item xs={2}><Typography variant="caption">Medium</Typography></Grid>
                      <Grid item xs={2}><Typography variant="caption">High</Typography></Grid>
                    </Grid>
                    <Grid container spacing={1} justifyContent="center" sx={{ mt: 1 }}>
                      <Grid item xs={4}><Typography variant="caption">High</Typography></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'warning.light' }}>6</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'error.light' }}>9</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'error.main', color: 'white' }}>9</Paper></Grid>
                    </Grid>
                    <Grid container spacing={1} justifyContent="center">
                      <Grid item xs={4}><Typography variant="caption">Medium</Typography></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'success.light' }}>2</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'warning.light' }}>4</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'error.light' }}>6</Paper></Grid>
                    </Grid>
                    <Grid container spacing={1} justifyContent="center">
                      <Grid item xs={4}><Typography variant="caption">Low</Typography></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'success.light' }}>1</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'success.light' }}>2</Paper></Grid>
                      <Grid item xs={2}><Paper sx={{ p: 1, bgcolor: 'warning.light' }}>3</Paper></Grid>
                    </Grid>
                    <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                      ↑ Likelihood
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                      Your risk score: {calculateRiskScore(selectedRisk)}
                    </Typography>
                  </Paper>

                  {/* Mitigation Plan */}
                  {selectedRisk.mitigationPlan && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Mitigation Plan
                      </Typography>
                      <Paper sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid #e0e0e0' }}>
                        <Typography variant="body2">
                          {selectedRisk.mitigationPlan}
                        </Typography>
                      </Paper>
                    </Box>
                  )}

                  {/* Owner */}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Risk Owner
                    </Typography>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ width: 24, height: 24, mr: 1, bgcolor: 'primary.main' }}>
                        <PersonIcon fontSize="small" />
                      </Avatar>
                      <Typography variant="body2">
                        {selectedRisk.owner}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Actions */}
                  <Box display="flex" justifyContent="space-between" sx={{ mt: 3 }}>
                    <Button 
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<ShieldIcon />}
                      onClick={() => sendMessage(`Develop mitigation strategy for risk: ${selectedRisk.description}`)}
                    >
                      Develop Mitigation
                    </Button>
                    <Button 
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => sendMessage(`Mark risk as mitigated: ${selectedRisk.description}`)}
                    >
                      Mark Mitigated
                    </Button>
                    <Button 
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setSelectedRisk(null)}
                    >
                      Close
                    </Button>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Quick Actions */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom fontWeight="medium">
          Quick Actions
        </Typography>
        <Grid container spacing={1}>
          <Grid item>
            <Button 
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AssessmentIcon />}
              onClick={() => sendMessage('Perform comprehensive risk assessment for all projects')}
            >
              Full Assessment
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<WarningIcon />}
              onClick={() => sendMessage('Identify and prioritize top risks')}
            >
              Prioritize Risks
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="success"
              size="small"
              startIcon={<CheckCircleIcon />}
              onClick={() => sendMessage('Generate risk mitigation report')}
            >
              Generate Report
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default RiskAssessmentTool;

