import React from 'react';
import { Box, Typography, Paper, Grid, Card, Button } from '@mui/material/index.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AttachMoney as AttachMoneyIcon, Add as AddIcon } from '@mui/icons-material';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface BudgetCategory {
  name: string;
  amount: number;
  spent?: number; // Added spent for more realistic budget tracking
}

interface BudgetData {
  totalBudget: number;
  spent: number;
  remaining: number;
  categories: BudgetCategory[];
}

interface BudgetDashboardProps {
  budgetData: BudgetData;
  sendMessage: (message: string) => Promise<void>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF00FF'];

const BudgetDashboard: React.FC<BudgetDashboardProps> = ({ budgetData, sendMessage }) => {
  const totalAllocated = budgetData.categories.reduce((sum, cat) => sum + cat.amount, 0);
  const totalSpent = budgetData.categories.reduce((sum, cat) => sum + (cat.spent || 0), 0); // Use optional spent
  const overallProgress = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  if (budgetData.categories.length === 0) {
    return (
      <Card sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          <AttachMoneyIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
          Budget Dashboard
        </Typography>
        <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
          <Typography variant="body1">No budget data found. Start planning your event budget!</Typography>
        </Paper>
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          startIcon={<AddIcon />}
          onClick={() => {
            const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
            const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'budget-tracking', { flagIssues: true });
            sendMessage(JSON.stringify(msg));
          }}
        >
          Add Budget Item
        </Button>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <AttachMoneyIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Budget Dashboard
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Overall Budget Progress
        </Typography>
        <Box sx={{ height: 10, backgroundColor: '#e0e0e0', borderRadius: 5, mb: 1, overflow: 'hidden' }}>
          <Box sx={{ 
            height: '100%', 
            width: `${overallProgress}%`, 
            backgroundColor: overallProgress > 90 ? '#f44336' : overallProgress > 70 ? '#ff9800' : '#4caf50',
            transition: 'width 0.3s ease'
          }} />
        </Box>
        <Typography variant="body2">
          ${totalSpent.toLocaleString()} / ${totalAllocated.toLocaleString()} ({Math.round(overallProgress)}%)
        </Typography>
      </Box>

      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Budget Breakdown by Category
      </Typography>

      {budgetData.categories.map((category, index) => {
        const progress = (category.spent || 0) / category.amount * 100;
        const isOverBudget = (category.spent || 0) > category.amount;

        return (
          <Box key={index} sx={{ mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="body2" fontWeight="medium">
                {category.name}
              </Typography>
              <Typography variant="body2">
                ${(category.spent || 0).toLocaleString()} / ${category.amount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
              <Box sx={{ 
                height: '100%', 
                width: `${progress > 100 ? 100 : progress}%`, 
                backgroundColor: isOverBudget ? '#f44336' : progress > 80 ? '#ff9800' : '#4caf50'
              }} />
            </Box>
            {isOverBudget && (
              <Typography variant="caption" color="error">
                Over budget by ${((category.spent || 0) - category.amount).toLocaleString()}
              </Typography>
            )}
          </Box>
        );
      })}

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        startIcon={<AddIcon />}
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'budget-tracking', { flagIssues: true });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Add Budget Item
      </Button>
    </Card>
  );
};

export default BudgetDashboard;


