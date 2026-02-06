# Assistant Implementation Guide

This guide provides a comprehensive approach to implementing fully functional assistants that expose all agent capabilities.

## 🎯 Overview

The goal is to transform basic `BaseAssistantPage` implementations into comprehensive, domain-specific interfaces that fully expose the functionality of each agent as specified in their respective specification documents.

## 📋 Current Status

### 🟢 Partially Functional
Assistants that are somewhat working but may have some errors or missing functionality.
- **Educational Assistant** - Partially functional with some 503 errors in components.
- **Career Assistant** - Partially functional with some 503 errors in components.

### 🟡 Functional UI with Mock Data
Assistants that have a functional UI but are using mock data, with some backend services (like Chat) returning errors.
- **Content Creator** - Functional screen with mock data and a 503 for the Chat component.
- **Customer Support** - Functional screen with mock data and a 503 for the Chat component.
- **Event Planner** - Functional screen with mock data and a 503 for the Chat component.

### 🟠 Regressed to Mockup
Assistants that were previously functional but are now displaying a mockup.
- **PM Assistant** - Now returns a mockup instead of the fully functional version.

### 🔴 Service Unavailable (503)
Assistants that are currently inaccessible due to a 503 'Service Unavailable' error.
- **Marketing Assistant**
- **Scriptwriter**
- **Songwriter**
- **HR Assistant**

### ⚫ Not Found (404)
Assistants that are currently inaccessible and returning a 'Not Found' error.
- **Executive Coach**
- **Financial Analyst**
- **Healthcare Coordinator**
- **Sales assistant**
- **Sports Wager**
- **Investment Advisor**
- **Legal Assistant** - Displays page components with a 'Not Found' error below them.

## 🏗️ Implementation Pattern

### 1. File Structure

```
assistants/
  └── [AssistantName]/
      ├── [AssistantName].tsx              # Main entry point (updated)
      ├── [AssistantName]Page.tsx         # Comprehensive page component (new)
      └── components/                     # Domain-specific components (new)
          ├── Component1.tsx
          ├── Component2.tsx
          └── ...
```

### 2. Main Assistant File Update

**Before:**
```tsx
import React from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { [assistant]Client } from '../shared/assistantClients';

const [AssistantName] = () => {
  return (
    <BaseAssistantPage
      title="[Assistant Title]"
      description="[Description]"
      client={[assistant]Client}
      initialPrompt="[Initial Prompt]"
    />
  );
};

export default [AssistantName];
```

**After:**
```tsx
import React from 'react';
import [AssistantName]Page from './[AssistantName]Page';

const [AssistantName] = () => {
  return (
    <[AssistantName]Page />
  );
};

export default [AssistantName];
```

### 3. Comprehensive Page Structure

The comprehensive page follows this architecture:

```tsx
// services/mcsreact/src/assistants/[AssistantName]/[AssistantName]Page.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { [assistant]Client } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { Typography, Button, TextField, Box, /* MUI components */ } from '@mui/material';
import { /* MUI icons */ } from '@mui/icons-material';

// 1. HumanInputWidget - Enhanced human-in-the-loop component
const HumanInputWidget: React.FC<HumanInputWidgetProps> = ({ /* props */ }) => {
  // Implementation with support for ask, boolean, select, file types
};

// 2. Domain-Specific Components
const Component1: React.FC = () => { /* Implementation */ };
const Component2: React.FC = () => { /* Implementation */ };
// ... Additional components

// 3. Main Page Component
const [AssistantName]Page: React.FC = () => {
  // State management
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanInputRequired, setHumanInputRequired] = useState<HumanInputRequired | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const client = [assistant]Client;

  // WebSocket and message handling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

  // Conversation lifecycle
  useEffect(() => {
    if (!conversationId && !isLoading) {
      handleStartConversation();
    }
  }, []);

  // Message handlers
  const handleNewMessage = useCallback((msg: ConversationMessage) => {
    setMessages((prev) => [...prev, msg]);
    if (msg.sender === 'assistant' || msg.sender === 'tool') {
        setHumanInputRequired(null);
    }
  }, []);

  const handleHumanInputRequired = useCallback((data: any) => {
    setHumanInputRequired({ 
      prompt: data.prompt, 
      type: data.type, 
      metadata: data.metadata, 
      inputStepId: data.stepId 
    });
  }, []);

  // WebSocket subscriptions
  useEffect(() => {
    // Setup WebSocket subscriptions
    let unsubscribeMessage, unsubscribeHumanInput, unsubscribeError, unsubscribeEnd, unsubscribeConnected;

    if (conversationId) {
      client.getHistory(conversationId).then(setMessages).catch(console.error);
      
      unsubscribeMessage = client.on('message', handleNewMessage);
      unsubscribeHumanInput = client.on('human_input_required', handleHumanInputRequired);
      unsubscribeError = client.on('error', (err: any) => console.error('WebSocket Error:', err));
      unsubscribeEnd = client.on('end', (data: any) => {
        console.log('Conversation ended:', data);
        setHumanInputRequired(null);
      });
      unsubscribeConnected = client.on('connected', (data: any) => console.log('WS Connected:', data));
    }

    return () => {
      // Cleanup subscriptions
      if (unsubscribeMessage) unsubscribeMessage();
      if (unsubscribeHumanInput) unsubscribeHumanInput();
      if (unsubscribeError) unsubscribeError();
      if (unsubscribeEnd) unsubscribeEnd();
      if (unsubscribeConnected) unsubscribeConnected();
    };
  }, [conversationId, client, handleNewMessage, handleHumanInputRequired]);

  // Conversation actions
  const handleStartConversation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const id = await client.startConversation('[Initial prompt from spec]');
      setConversationId(id);
      setInput('');
    } catch (error) {
      console.error('Failed to start conversation:', error);
      setError(`Error starting conversation: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!conversationId || !input.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await client.sendMessage(conversationId, input);
      setMessages((prev) => [...prev, { sender: 'user', type: 'text', content: input, timestamp: new Date() }]);
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitHumanInput = async (response: string, inputStepId: string) => {
    if (!conversationId || !humanInputRequired) return;
    setIsLoading(true);
    setError(null);
    try {
      await client.submitHumanInput(conversationId, response, inputStepId);
      setHumanInputRequired(null);
    } catch (error) {
      console.error('Failed to submit human input:', error);
      setError(`Error submitting human input: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // UI toggle functions
  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  // Domain-specific action handlers
  const handleAction1 = () => {
    if (conversationId) {
      setInput('[Domain-specific prompt]');
      handleSendMessage();
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Left Panel - Navigation Tabs */}
      {(leftPanelOpen || !isMobile) && (
        <Box sx={{ width: leftPanelOpen ? { xs: '100%', md: 350 } : 0, transition: 'width 0.3s ease', overflow: 'hidden', display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' }, height: '100vh', borderRight: '1px solid #e0e0e0', overflowY: 'auto' }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              [Assistant Name] Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={(e, newValue) => setActiveTab(newValue)}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
            >
              <Tab label="[Tool 1]" icon={<Icon1 />} iconPosition="start" />
              <Tab label="[Tool 2]" icon={<Icon2 />} iconPosition="start" />
              {/* Additional tabs for each domain-specific tool */}
            </Tabs>
          </Box>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0', backgroundColor: theme.palette.background.paper, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5" fontWeight="bold">
            [Assistant Name]
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

        {/* Conversation Area */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2, backgroundColor: '#f9f9f9' }}>
          {error && (
            <Box sx={{ mb: 2, p: 2, backgroundColor: '#ffebee', borderRadius: 1, boxShadow: 1 }}>
              <Typography variant="body2" color="error">
                <strong>Error:</strong> {error}
              </Typography>
            </Box>
          )}
          
          <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {messages.map((msg, index) => (
              <Box key={index} sx={{ p: 2, borderRadius: 2, backgroundColor: msg.sender === 'user' ? '#e3f2fd' : theme.palette.background.default, alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', boxShadow: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  {msg.sender === 'user' ? 'You' : msg.sender === 'assistant' ? '[Assistant Name]' : 'Tool'} • {new Date(msg.timestamp).toLocaleTimeString()}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
                </Typography>
              </Box>
            ))}
            {isLoading && (
              <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#ffffff', alignSelf: 'flex-start', maxWidth: '80%', boxShadow: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  <em>Thinking...</em>
                </Typography>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input Area */}
          {humanInputRequired ? (
            <Box sx={{ mt: 2 }}>
              <HumanInputWidget
                prompt={humanInputRequired.prompt}
                type={humanInputRequired.type}
                metadata={humanInputRequired.metadata}
                inputStepId={humanInputRequired.inputStepId}
                onSubmit={handleSubmitHumanInput}
                onCancel={() => setHumanInputRequired(null)}
              />
            </Box>
          ) : (
            <Box sx={{ mt: 2, display: 'flex', gap: 1, pt: 2, borderTop: '1px solid #e0e0e0' }}>
              <TextField
                fullWidth
                size="small"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading || !conversationId}
                sx={{ flexGrow: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleSendMessage}
                disabled={isLoading || input.trim().length === 0 || !conversationId}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Send
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Right Panel - Active Tool Content */}
      {(rightPanelOpen || !isMobile) && (
        <Box sx={{ width: rightPanelOpen ? { xs: '100%', md: 400 } : 0, transition: 'width 0.3s ease', overflow: 'hidden', display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' }, height: '100vh', borderLeft: '1px solid #e0e0e0', overflowY: 'auto', p: 2 }}>
          {activeTab === 0 && <Component1 />}
          {activeTab === 1 && <Component2 />}
          {/* Additional component renderings */}
        </Box>
      )}
    </Box>
  );
};

export default [AssistantName]Page;
```

## 🎨 Component Design Guidelines

### 1. HumanInputWidget
- **Purpose**: Handle all human-in-the-loop interactions
- **Types Supported**: `ask`, `boolean`, `select`, `file`
- **Features**: Validation, error handling, metadata support
- **Integration**: Connects to `client.submitHumanInput()`

### 2. Domain-Specific Components
Each component should:
- **Be self-contained** with its own state management
- **Use real data** from the assistant client (not mock data)
- **Follow Material-UI design patterns** for consistency
- **Include proper error handling** and loading states
- **Support responsive design** for mobile and desktop

### 3. Common Component Types
Based on the specifications, most assistants need these component types:

#### Data Management Components
- **Dashboards**: Overview with key metrics and visualizations
- **Tables**: Data display with sorting, filtering, and pagination
- **Charts**: Visual representations of data trends

#### Workflow Components
- **Wizards**: Step-by-step guides for complex processes
- **Forms**: Data input with validation
- **Calendars**: Scheduling and time management

#### Collaboration Components
- **Chat Interfaces**: Real-time communication
- **Document Repositories**: File management
- **Knowledge Bases**: Information retrieval

## 📚 Implementation Checklist

### For Each Assistant:
1. [ ] Read the specification document in `/docs/v2/`
2. [ ] Identify all required UI components from section 5
3. [ ] Create the comprehensive page component
4. [ ] Implement the HumanInputWidget
5. [ ] Implement each domain-specific component
6. [ ] Update the main assistant file
7. [ ] Test all functionality
8. [ ] Ensure responsive design works

### Component Implementation:
1. [ ] Use real data from the assistant client
2. [ ] Implement proper error handling
3. [ ] Add loading states
4. [ ] Ensure accessibility compliance
5. [ ] Follow Material-UI design system
6. [ ] Add proper TypeScript types
7. [ ] Include comprehensive comments

## 🔧 Technical Requirements

### Dependencies
```bash
# Ensure these are in your package.json
@mui/material: ^5.0.0
@mui/icons-material: ^5.0.0
@cktmcs/sdk: latest
react: ^18.0.0
```

### TypeScript Types
```typescript
import { ConversationMessage } from '@cktmcs/sdk';
import { AssistantClient } from '../shared/AssistantClient';
```

### WebSocket Integration
All assistants use the same WebSocket pattern:
- `client.on('message', handler)` - For incoming messages
- `client.on('human_input_required', handler)` - For human-in-the-loop prompts
- `client.on('error', handler)` - For error handling
- `client.on('end', handler)` - For conversation end events

## 🚀 Quick Start Template

For rapid implementation, use this template structure and replace placeholders:

```tsx
// 1. Import required dependencies
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { [assistant]Client } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { /* MUI components */ } from '@mui/material';
import { /* MUI icons */ } from '@mui/icons-material';

// 2. Implement HumanInputWidget (copy from existing implementations)

// 3. Implement domain-specific components based on specification

// 4. Implement main page component following the established pattern

// 5. Export the component
export default [AssistantName]Page;
```

## 📁 File Organization Best Practices

1. **Component Files**: Keep each component in its own file
2. **Naming**: Use descriptive names (e.g., `BudgetDashboard.tsx`)
3. **Size**: Keep files under 500 lines when possible
4. **Organization**: Group related components in subdirectories
5. **Exports**: Use named exports for components

## 🧪 Testing Recommendations

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test complete user flows
4. **Responsive Tests**: Test on different screen sizes
5. **Accessibility Tests**: Ensure WCAG compliance

## 🎓 Learning Resources

- **EventPlannerAssistantPage.tsx**: Complete event planning implementation
- **ContentCreatorAssistantPage.tsx**: Complete content creation implementation
- **CustomerSupportAgentPage.tsx**: Complete support management implementation
- **PmAssistant/PmAssistantPage.tsx**: Reference implementation with different pattern
- **Material-UI Documentation**: https://mui.com/
- **React Documentation**: https://react.dev/

## 📋 Priority Recommendations

Based on business value and complexity, here's the recommended implementation order:

1. **FinancialAnalystAssistant** - High business value, complex data requirements
2. **MarketingCampaignManager** - High business value, complex workflows
3. **HRRecruitmentAssistant** - High business value, complex processes
4. **SalesCRMAssistant** - High business value, data-intensive
5. **ExecutiveCoachAssistant** - Medium complexity, high user engagement
6. **HealthcarePatientCoordinator** - Medium complexity, specialized domain
7. **HotelOperationsAssistant** - Medium complexity, industry-specific
8. **RestaurantOperationsAssistant** - Medium complexity, industry-specific
9. **EducationalTutorAssistant** - Lower complexity, educational focus
10. **LegalAssistant** - Lower complexity, document-focused
11. **ScriptwriterAssistant** - Lower complexity, creative focus
12. **SongwriterAssistant** - Lower complexity, creative focus
13. **SportsWagerAdvisor** - Lower complexity, niche focus

## 🎯 Success Metrics

A successfully implemented assistant should:
- ✅ Expose 100% of the agent's functionality as per specification
- ✅ Provide an intuitive, domain-specific user interface
- ✅ Handle all human-in-the-loop interactions properly
- ✅ Use real data from the backend (no mock data)
- ✅ Work seamlessly on mobile and desktop
- ✅ Follow the established design patterns
- ✅ Include comprehensive error handling
- ✅ Maintain consistent performance

## 🔄 Maintenance Guidelines

1. **Updates**: Keep components updated with latest MUI versions
2. **Refactoring**: Regularly review and refactor complex components
3. **Performance**: Monitor and optimize component performance
4. **Documentation**: Keep component documentation up to date
5. **Dependencies**: Regularly update dependencies

This guide provides everything needed to systematically enhance all remaining assistants to fully expose their functionality while maintaining consistency across the platform.