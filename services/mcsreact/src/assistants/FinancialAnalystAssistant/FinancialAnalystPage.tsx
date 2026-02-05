import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { financeAssistantClient } from '../shared/assistantClients';
import BudgetingCenter from './BudgetingCenter';
import ForecastingDashboard from './ForecastingDashboard';
import FinancialStatementsAnalyzer from './FinancialStatementsAnalyzer';
import CashFlowAnalyzer from './CashFlowAnalyzer';
import { Box, Grid, Paper, Typography, Button, Chip } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState?: Record<string, any>;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
    conversationId?: string;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
}

const FinancialAnalystPageView: React.FC<AssistantRenderProps> = ({ 
    messages, 
    sendMessage, 
    sendEvent, 
    assistantState = {}, 
    getState = () => [], 
    mergeAssistantState = () => {}, 
    conversationId, 
    isLoading, 
    error, 
    humanInputRequired, 
    submitHumanInput, 
    clientId 
}) => {
    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
      if (conversationId) {
        const collections = ['budget', 'forecast', 'financialStatement', 'cashFlow'];
        collections.forEach(collection => {
          sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
        });
      }
    }, [conversationId, getState, sendEvent, buildEvent]);

    // Enhanced domain components with conversation integration
    const BudgetingCenterWithContext = () => {
        const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
        
        const handleBudgetAnalysis = (category: string) => {
            setSelectedCategory(category);
            sendEvent(buildEvent('domain.budget.analyze', { category }));
        };
        
        return (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" gutterBottom>
                  Budget Management
                </Typography>
                {selectedCategory && (
                  <Chip label={`Analyzing: ${selectedCategory}`} color="primary" size="small" />
                )}
              </Box>
              <BudgetingCenter />
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => handleBudgetAnalysis('Personnel')}
                >
                  Analyze Personnel
                </Button>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => handleBudgetAnalysis('Operations')}
                >
                  Analyze Operations
                </Button>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => handleBudgetAnalysis('Technology')}
                >
                  Analyze Technology
                </Button>
              </Box>
            </Box>
          );
        };

        const ForecastingDashboardWithContext = () => {
            const [forecastAction, setForecastAction] = useState<string | null>(null);
            
            const handleForecastAction = (action: string) => {
                setForecastAction(action);
                sendEvent(buildEvent('domain.forecast.generate', { scenario: action }));
            };
            
            return (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" gutterBottom>
                      Financial Forecasting
                    </Typography>
                    {forecastAction && (
                      <Chip label={`Scenario: ${forecastAction}`} color="secondary" size="small" />
                    )}
                  </Box>
                  <ForecastingDashboard />
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => handleForecastAction('Conservative')}
                    >
                      Conservative Forecast
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => handleForecastAction('Optimistic')}
                    >
                      Optimistic Forecast
                    </Button>
                  </Box>
                </Box>
              );
            };

            const FinancialStatementsAnalyzerWithContext = () => {
                const [selectedStatement, setSelectedStatement] = useState<string | null>(null);
                
                const handleStatementAnalysis = (statement: string) => {
                    setSelectedStatement(statement);
                    sendEvent(buildEvent('domain.financialStatement.analyze', { type: statement }));
                };
                
                return (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h5" gutterBottom>
                          Financial Statements
                        </Typography>
                        {selectedStatement && (
                          <Chip label={`Analyzing: ${selectedStatement}`} color="info" size="small" />
                        )}
                      </Box>
                      <FinancialStatementsAnalyzer />
                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          onClick={() => handleStatementAnalysis('Income Statement')}
                        >
                          Income Statement
                        </Button>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          onClick={() => handleStatementAnalysis('Balance Sheet')}
                        >
                          Balance Sheet
                        </Button>
                      </Box>
                    </Box>
                  );
                };

            const CashFlowAnalyzerWithContext = () => {
                const [cashFlowView, setCashFlowView] = useState<string | null>(null);
                
                const handleCashFlowView = (view: string) => {
                    setCashFlowView(view);
                    sendEvent(buildEvent('domain.cashFlow.analyze', { view }));
                };
                
                return (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h5" gutterBottom>
                          Cash Flow Analysis
                        </Typography>
                        {cashFlowView && (
                          <Chip label={`View: ${cashFlowView}`} color="info" size="small" />
                        )}
                      </Box>
                      <CashFlowAnalyzer />
                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          onClick={() => handleCashFlowView('Operating')}
                        >
                          Operating Cash Flow
                        </Button>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          onClick={() => handleCashFlowView('Free')}
                        >
                          Free Cash Flow
                        </Button>
                      </Box>
                    </Box>
                  );
                };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Grid container spacing={2} sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <BudgetingCenterWithContext />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <ForecastingDashboardWithContext />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <FinancialStatementsAnalyzerWithContext />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} sx={{ height: '100%' }}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', overflow: 'auto' }}>
            <CashFlowAnalyzerWithContext />
          </Paper>
        </Grid>
      </Grid>
      
      <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Financial Analyst Assistant" enableVoiceInput={true} />
    </Box>
  );
};

export const FinancialAnalystPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Financial Analyst Assistant"
      description="Analyze enterprise financial data, manage budgets, create forecasts, and generate financial reports. Get help with budgeting, financial statements, cash flow analysis, and regulatory compliance."
      client={financeAssistantClient}
      initialPrompt="Hello! I need help with enterprise financial analysis and reporting."
      clientId={clientId}
    >
      {(props) => <FinancialAnalystPageView {...props} clientId={clientId} />}
    </BaseAssistantPage>
  );
};

export default FinancialAnalystPage;


