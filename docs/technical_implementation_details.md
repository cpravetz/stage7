# Technical Implementation Details

This document provides more specific technical details for implementing some of the key improvements identified in the main improvement plan.

## 1. Message Queue Implementation

### Technology Selection
- **Recommended**: RabbitMQ for its reliability and ease of integration with Node.js
- **Alternative**: Apache Kafka for higher throughput scenarios

### Implementation Steps

1. **Add RabbitMQ to Docker Compose**
```yaml
rabbitmq:
  image: rabbitmq:3-management
  ports:
    - "5672:5672"  # AMQP port
    - "15672:15672"  # Management UI
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
  environment:
    - RABBITMQ_DEFAULT_USER=stage7
    - RABBITMQ_DEFAULT_PASS=stage7password
```

2. **Create Shared Message Queue Client**
```typescript
// shared/src/messaging/queueClient.ts
import amqp from 'amqplib';

export class MessageQueueClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private url: string;

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672') {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      console.log('Connected to RabbitMQ');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async publishMessage(exchange: string, routingKey: string, message: any): Promise<boolean> {
    if (!this.channel) {
      await this.connect();
    }
    
    try {
      await this.channel!.assertExchange(exchange, 'topic', { durable: true });
      return this.channel!.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      console.error('Error publishing message:', error);
      return false;
    }
  }

  async subscribeToQueue(queueName: string, callback: (message: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    
    try {
      await this.channel!.assertQueue(queueName, { durable: true });
      await this.channel!.consume(queueName, async (msg) => {
        if (msg) {
          const content = JSON.parse(msg.content.toString());
          try {
            await callback(content);
            this.channel!.ack(msg);
          } catch (error) {
            console.error('Error processing message:', error);
            // Requeue the message if processing failed
            this.channel!.nack(msg, false, true);
          }
        }
      });
    } catch (error) {
      console.error('Error subscribing to queue:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}
```

3. **Modify PostOffice to Use Message Queue**
```typescript
// services/postoffice/src/PostOffice.ts
import { MessageQueueClient } from '@cktmcs/shared/dist/messaging/queueClient';

export class PostOffice {
  private messageQueue: MessageQueueClient;
  
  constructor() {
    // Initialize existing code
    
    this.messageQueue = new MessageQueueClient();
    this.initializeMessageQueue();
  }
  
  private async initializeMessageQueue() {
    try {
      await this.messageQueue.connect();
      
      // Subscribe to messages for this service
      await this.messageQueue.subscribeToQueue('postoffice', async (message) => {
        await this.processQueueMessage(message);
      });
      
      console.log('PostOffice connected to message queue');
    } catch (error) {
      console.error('Failed to initialize message queue:', error);
    }
  }
  
  private async processQueueMessage(message: any) {
    // Process incoming queue messages
    // This would replace some of the direct HTTP endpoints
  }
  
  async routeMessage(message: any) {
    // Existing message routing logic
    
    // Use queue for asynchronous messages
    if (!message.requiresSync) {
      await this.messageQueue.publishMessage(
        'stage7',
        `message.${message.recipient}`,
        message
      );
      return { status: 'queued' };
    }
    
    // Fall back to HTTP for synchronous messages
    // Existing HTTP routing code
  }
}
```

## 2. GitHub Integration for Plugins

### Implementation Steps

1. **Create GitHub Plugin Repository Client**
```typescript
// marketplace/src/repositories/GitHubPluginRepository.ts
import axios from 'axios';
import { PluginRepository } from './PluginRepository';
import { PluginManifest, PluginLocator } from '../types';

export class GitHubPluginRepository implements PluginRepository {
  private token: string;
  private owner: string;
  private repo: string;
  
  constructor(token: string, owner: string, repo: string) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
  }
  
  async list(): Promise<PluginLocator[]> {
    try {
      // Get contents of plugins directory in the repository
      const response = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/plugins`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
      
      // Map directory contents to plugin locators
      return response.data
        .filter((item: any) => item.type === 'dir')
        .map((item: any) => ({
          id: item.name,
          repository: {
            type: 'github',
            url: item.url
          }
        }));
    } catch (error) {
      console.error('Error listing GitHub plugins:', error);
      return [];
    }
  }
  
  async fetch(id: string): Promise<PluginManifest | undefined> {
    try {
      // Get plugin.js file from the repository
      const response = await axios.get(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/plugins/${id}/plugin.js`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
      
      // Decode content (base64 encoded)
      const content = Buffer.from(response.data.content, 'base64').toString();
      
      // Parse plugin definition
      // This is simplified - would need proper parsing in real implementation
      const pluginDef = eval(`(${content})`);
      
      return {
        ...pluginDef,
        repository: {
          type: 'github',
          url: response.data.html_url
        }
      };
    } catch (error) {
      console.error(`Error fetching GitHub plugin ${id}:`, error);
      return undefined;
    }
  }
  
  async fetchByVerb(verb: string): Promise<PluginManifest | undefined> {
    // This would require searching through all plugins
    // For efficiency, might want to maintain a local cache/index
    const plugins = await this.list();
    
    for (const plugin of plugins) {
      const manifest = await this.fetch(plugin.id);
      if (manifest && manifest.verb === verb) {
        return manifest;
      }
    }
    
    return undefined;
  }
  
  async store(plugin: PluginManifest): Promise<void> {
    // Implement GitHub commit logic to store a new plugin
    // This is more complex and would require multiple API calls
    // to create/update files in the repository
  }
}
```

2. **Integrate with PluginMarketplace**
```typescript
// marketplace/src/PluginMarketplace.ts
import { GitHubPluginRepository } from './repositories/GitHubPluginRepository';

// In constructor or init method
if (process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME && process.env.GITHUB_REPO) {
  const githubRepo = new GitHubPluginRepository(
    process.env.GITHUB_TOKEN,
    process.env.GITHUB_USERNAME,
    process.env.GITHUB_REPO
  );
  this.repositories.set('github', githubRepo);
}
```

## 3. Dynamic Model Performance Tracking

### Implementation Steps

1. **Create Model Performance Tracker**
```typescript
// services/brain/src/utils/performanceTracker.ts
import { LLMConversationType } from '@cktmcs/shared';

interface ModelUsageRecord {
  modelName: string;
  conversationType: LLMConversationType;
  startTime: number;
  endTime?: number;
  tokensUsed?: number;
  success: boolean;
  latency?: number;
  cost?: number;
}

interface ModelPerformanceMetrics {
  successRate: number;
  averageLatency: number;
  averageCost: number;
  usageCount: number;
}

export class ModelPerformanceTracker {
  private usageRecords: ModelUsageRecord[] = [];
  private performanceCache: Map<string, ModelPerformanceMetrics> = new Map();
  private updateInterval: NodeJS.Timeout;
  
  constructor() {
    // Update performance metrics every hour
    this.updateInterval = setInterval(() => this.updatePerformanceMetrics(), 60 * 60 * 1000);
  }
  
  startTracking(modelName: string, conversationType: LLMConversationType): string {
    const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    this.usageRecords.push({
      modelName,
      conversationType,
      startTime: Date.now(),
      success: false // Will be updated when completed
    });
    
    return recordId;
  }
  
  completeTracking(recordId: string, success: boolean, tokensUsed?: number, cost?: number): void {
    const record = this.usageRecords.find(r => r.startTime.toString() + r.modelName === recordId);
    
    if (record) {
      record.endTime = Date.now();
      record.success = success;
      record.tokensUsed = tokensUsed;
      record.cost = cost;
      record.latency = record.endTime - record.startTime;
      
      // Trigger update of performance metrics for this model
      this.updateModelMetrics(record.modelName, record.conversationType);
    }
  }
  
  private updateModelMetrics(modelName: string, conversationType: LLMConversationType): void {
    const key = `${modelName}-${conversationType}`;
    const relevantRecords = this.usageRecords.filter(
      r => r.modelName === modelName && 
           r.conversationType === conversationType &&
           r.endTime !== undefined
    );
    
    if (relevantRecords.length === 0) return;
    
    const successfulRecords = relevantRecords.filter(r => r.success);
    const successRate = successfulRecords.length / relevantRecords.length;
    
    const latencies = relevantRecords.map(r => r.latency || 0);
    const averageLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    
    const costs = relevantRecords.filter(r => r.cost !== undefined).map(r => r.cost || 0);
    const averageCost = costs.length > 0 
      ? costs.reduce((sum, val) => sum + val, 0) / costs.length
      : 0;
    
    this.performanceCache.set(key, {
      successRate,
      averageLatency,
      averageCost,
      usageCount: relevantRecords.length
    });
  }
  
  private updatePerformanceMetrics(): void {
    // Update all model metrics
    const modelConvTypes = new Set<string>();
    
    this.usageRecords.forEach(record => {
      modelConvTypes.add(`${record.modelName}-${record.conversationType}`);
    });
    
    modelConvTypes.forEach(key => {
      const [modelName, conversationType] = key.split('-');
      this.updateModelMetrics(modelName, conversationType as LLMConversationType);
    });
    
    // Prune old records (older than 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.usageRecords = this.usageRecords.filter(r => r.startTime >= thirtyDaysAgo);
  }
  
  getPerformanceMetrics(modelName: string, conversationType: LLMConversationType): ModelPerformanceMetrics {
    const key = `${modelName}-${conversationType}`;
    return this.performanceCache.get(key) || {
      successRate: 1, // Default to optimistic values for new models
      averageLatency: 0,
      averageCost: 0,
      usageCount: 0
    };
  }
  
  adjustModelScore(baseScore: number, modelName: string, conversationType: LLMConversationType): number {
    const metrics = this.getPerformanceMetrics(modelName, conversationType);
    
    // No adjustment for new models
    if (metrics.usageCount < 10) return baseScore;
    
    // Adjust score based on success rate
    const successFactor = metrics.successRate * 0.5; // Up to 50% impact
    
    // Adjust score based on usage (favor more used models slightly)
    const usageFactor = Math.min(metrics.usageCount / 1000, 0.2); // Up to 20% impact
    
    return baseScore * (1 + successFactor + usageFactor);
  }
}
```

2. **Integrate with ModelManager**
```typescript
// services/brain/src/utils/modelManager.ts
import { ModelPerformanceTracker } from './performanceTracker';

export class ModelManager {
  private models: Map<string, BaseModel> = new Map();
  private performanceTracker: ModelPerformanceTracker;
  
  constructor() {
    this.performanceTracker = new ModelPerformanceTracker();
    this.loadModels();
  }
  
  // Modify the calculateScore method to use performance data
  private calculateScore(model: BaseModel, optimization: OptimizationType, conversationType: LLMConversationType): number {
    const scores = model.getScoresForConversationType(conversationType);
    if (!scores) return -Infinity;
    
    let baseScore: number;
    
    switch (optimization) {
      case 'speed':
        baseScore = scores.speedScore;
        break;
      case 'accuracy':
        baseScore = scores.accuracyScore;
        break;
      case 'creativity':
        baseScore = scores.creativityScore;
        break;
      case 'cost':
        baseScore = -scores.costScore; // Invert cost score so lower cost is better
        break;
      case 'continuity':
        baseScore = (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
        break;
      default:
        baseScore = (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
    }
    
    // Adjust score based on actual performance
    return this.performanceTracker.adjustModelScore(baseScore, model.name, conversationType);
  }
  
  // Add tracking to model usage
  async useModel(model: BaseModel, conversationType: LLMConversationType, messages: any, options: any): Promise<string> {
    const trackingId = this.performanceTracker.startTracking(model.name, conversationType);
    
    try {
      const result = await model.chat(messages, options);
      
      // Estimate tokens used (simplified)
      const tokensUsed = this.estimateTokensUsed(messages, result);
      
      // Estimate cost (simplified)
      const cost = this.estimateCost(model.name, tokensUsed);
      
      this.performanceTracker.completeTracking(trackingId, true, tokensUsed, cost);
      return result;
    } catch (error) {
      this.performanceTracker.completeTracking(trackingId, false);
      throw error;
    }
  }
  
  private estimateTokensUsed(messages: any, result: string): number {
    // Simplified token estimation
    // In a real implementation, use a proper tokenizer
    const messageText = JSON.stringify(messages);
    return Math.ceil(messageText.length / 4) + Math.ceil(result.length / 4);
  }
  
  private estimateCost(modelName: string, tokens: number): number {
    // Simplified cost estimation
    // In a real implementation, use actual pricing for each model
    const costPerToken = {
      'gpt-4': 0.00003,
      'gpt-3.5-turbo': 0.000002,
      // Add other models
    };
    
    const defaultCost = 0.00001;
    const modelCost = costPerToken[modelName] || defaultCost;
    
    return tokens * modelCost;
  }
}
```

## 4. UI Modernization

### Implementation Steps

1. **Update Frontend Dependencies**
```json
{
  "dependencies": {
    "@cktmcs/errorhandler": "file:../../errorhandler",
    "@cktmcs/shared": "file:../../shared",
    "@emotion/react": "^11.10.6",
    "@emotion/styled": "^11.10.6",
    "@mui/icons-material": "^5.11.16",
    "@mui/material": "^5.12.1",
    "axios": "^1.7.7",
    "cross-spawn": "^7.0.6",
    "crypto-browserify": "^3.12.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-scripts": "^5.0.1",
    "typescript": "^5.6.3",
    "uuid": "^11.0.3",
    "vis-data": "^7.1.9",
    "vis-network": "^9.1.9"
  }
}
```

2. **Create Theme Provider**
```typescript
// services/mcsreact/src/theme/ThemeProvider.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, Theme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleTheme: () => {}
});

export const useTheme = () => useContext(ThemeContext);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');

  const toggleTheme = () => {
    setMode(prevMode => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: '#7e57c2', // Purple
          },
          secondary: {
            main: '#26a69a', // Teal
          },
          background: {
            default: mode === 'light' ? '#f5f5f5' : '#121212',
            paper: mode === 'light' ? '#ffffff' : '#1e1e1e',
          },
        },
        typography: {
          fontFamily: '"IBM Plex Sans", "Roboto", "Helvetica", "Arial", sans-serif',
          h1: {
            fontSize: '2.5rem',
            fontWeight: 600,
          },
          h2: {
            fontSize: '2rem',
            fontWeight: 600,
          },
          h3: {
            fontSize: '1.75rem',
            fontWeight: 600,
          },
          h4: {
            fontSize: '1.5rem',
            fontWeight: 500,
          },
          h5: {
            fontSize: '1.25rem',
            fontWeight: 500,
          },
          h6: {
            fontSize: '1rem',
            fontWeight: 500,
          },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 8,
                textTransform: 'none',
                fontWeight: 500,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 12,
                boxShadow: mode === 'light' 
                  ? '0 4px 6px rgba(0,0,0,0.1)' 
                  : '0 4px 6px rgba(0,0,0,0.3)',
              },
            },
          },
        },
      }),
    [mode],
  );

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
```

3. **Update App Component**
```tsx
// services/mcsreact/src/App.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ThemeProvider } from './theme/ThemeProvider';
import { Box, Container, Paper, Typography, useTheme } from '@mui/material';
import UserInputModal from './components/UserInputModal';
import TabbedPanel from './components/TabbedPanel';
import TextInput from './components/TextInput';
import MissionControls from './components/MissionControls';
import StatisticsWindow from './components/StatisticsWindow';
import SavedMissionsList from './components/SavedMissionsList';
import ErrorBoundary from './components/ErrorBoundary';
import LoginComponent from './components/Login';
import { AgentStatistics, MissionStatistics, MessageType, MapSerializer } from '@cktmcs/shared';
import { SecurityClient } from './SecurityClient';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Rest of the component remains similar but with Material UI components
// ...

return (
  <ThemeProvider>
    <ErrorBoundary>
      <Box className="app" sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Box className="main-panel" sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%' 
        }}>
          <Box className="tabbed-panel-container" sx={{ 
            flex: 1, 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column' 
          }}>
            <TabbedPanel 
              conversationHistory={conversationHistory}
              workProducts={workProducts}
              agentStatistics={agentStatistics}
            />
          </Box>
          <TextInput onSend={handleSendMessage} />
          <Paper className="mission-controls-container" sx={{ 
            position: 'sticky', 
            bottom: 0, 
            padding: 2, 
            borderTop: '1px solid', 
            borderColor: 'divider' 
          }}>
            <MissionControls 
              onControl={handleControlAction} 
              activeMission={activeMission} 
              missionName={activeMissionName}
              activeMissionId={activeMissionId}
              isPaused={isPaused}
            />
          </Paper>
        </Box>
        <Paper className="side-panel" sx={{ 
          width: 300, 
          height: '100vh', 
          overflow: 'auto', 
          borderLeft: '1px solid', 
          borderColor: 'divider' 
        }}>
          <Box className="side-panel-header" sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: 2 
          }}>
            <Typography variant="h5" className="app-name" sx={{ color: 'primary.main' }}>
              stage7
            </Typography>
            <Button onClick={handleLogout} variant="outlined" size="small">
              Logout
            </Button>
          </Box>
          {!showSavedMissions && (
            <StatisticsWindow 
              statistics={missionStatistics} 
              agentStatistics={agentStatistics}
              onShowSavedMissions={() => setShowSavedMissions(true)}
            />
          )}
          {showSavedMissions && (
            <SavedMissionsList 
              onMissionSelected={handleLoadMission}
              onBack={() => setShowSavedMissions(false)}
            />
          )}
        </Paper>
      </Box>
    </ErrorBoundary>
  </ThemeProvider>
);
```

These technical implementation details provide a starting point for implementing some of the key improvements identified in the main improvement plan. Each implementation would need to be further refined and integrated with the existing codebase, but these examples demonstrate the approach and architecture for these enhancements.
