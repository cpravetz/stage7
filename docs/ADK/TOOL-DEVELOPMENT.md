# Tool Development Guide

Complete guide for building and integrating tools with the Agent Development Kit.

## What are Tools?

Tools are the "actions" or "capabilities" your assistant can perform. They bridge the assistant to external systems, databases, APIs, or computation.

**Examples:**
- CRM lookup (Salesforce API integration)
- Email sending (SMTP integration)
- Data analysis (computation)
- Document generation (template rendering)
- Calendar management (Google Calendar API)
- Jira ticket creation (project management)

## Creating a Tool

### Step 1: Extend the Tool Base Class

```typescript
import { Tool } from '@cktmcs/sdk';

export class MyCustomTool extends Tool {
  constructor() {
    super();
    this.name = 'my-custom-tool';
    this.description = 'Performs a specific useful action for the domain';
  }

  async execute(args: Record<string, any>): Promise<any> {
    // Your implementation
  }
}
```

### Step 2: Implement execute() Method

```typescript
export class EmailSenderTool extends Tool {
  constructor(private smtpConfig: SmtpConfig) {
    super();
    this.name = 'send-email';
    this.description = 'Sends an email to a specified recipient';
  }

  async execute(args: {
    to: string;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; success: boolean }> {
    try {
      // Validate inputs
      if (!this.isValidEmail(args.to)) {
        throw new Error(`Invalid email address: ${args.to}`);
      }

      // Perform the action
      const transporter = nodemailer.createTransport(this.smtpConfig);
      const result = await transporter.sendMail({
        from: this.smtpConfig.from,
        to: args.to,
        subject: args.subject,
        html: args.body,
      });

      // Return structured result
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      throw new ToolExecutionError(
        this.name,
        `Failed to send email: ${error.message}`,
        error
      );
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
```

### Step 3: Register Tool with Assistant

In your assistant's `src/index.ts`:

```typescript
import { createQuickAssistant } from '@cktmcs/sdk';
import { EmailSenderTool } from './tools/EmailSenderTool';

createQuickAssistant({
  id: 'email-assistant',
  name: 'Email Assistant',
  role: 'Helps with email communication',
  personality: 'Professional and efficient',
  tools: async (coreEngineClient) => {
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      from: process.env.SMTP_FROM,
    };

    return [
      new EmailSenderTool(smtpConfig),
      // ... other tools
    ];
  },
  port: 3000,
}).catch(error => process.exit(1));
```

## Tool Best Practices

### 1. Single Responsibility
Each tool should do ONE thing well. Don't create a "CRMTool" that does 50 things. Instead:
- ✅ `CreateOpportunityTool`
- ✅ `UpdateContactTool`
- ✅ `LookupAccountTool`
- ❌ `CRMTool` (too broad)

### 2. Clear Input/Output Contracts
```typescript
interface EmailToolArgs {
  to: string;                    // Recipient email
  subject: string;               // Email subject
  body: string;                  // Email body (HTML)
  cc?: string[];                 // Optional CC recipients
  attachments?: Attachment[];    // Optional attachments
}

interface EmailToolResult {
  success: boolean;              // Whether email was sent
  messageId: string;             // SMTP message ID
  timestamp: string;             // When it was sent
  errors?: string[];             // Any non-fatal warnings
}
```

### 3. Comprehensive Error Handling
```typescript
async execute(args: EmailToolArgs): Promise<EmailToolResult> {
  try {
    // Validate all inputs
    this.validateInputs(args);
    
    // Attempt operation with retry logic
    let attempts = 0;
    while (attempts < 3) {
      try {
        return await this.sendEmail(args);
      } catch (error) {
        attempts++;
        if (attempts >= 3) throw error;
        await this.delay(1000 * attempts);  // Exponential backoff
      }
    }
  } catch (error) {
    // Provide actionable error message
    if (error.code === 'ECONNREFUSED') {
      throw new ToolExecutionError(
        this.name,
        'SMTP server unreachable. Check SMTP_HOST configuration.',
        error
      );
    }
    throw error;
  }
}
```

### 4. Timeout Management
```typescript
async execute(args: any): Promise<any> {
  return Promise.race([
    this.performOperation(args),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Tool execution timeout after 30s')),
        30000  // 30 second timeout
      )
    ),
  ]);
}
```

### 5. Appropriate Logging
```typescript
async execute(args: CrmArgs): Promise<any> {
  console.log(`[${this.name}] Fetching CRM record: ${args.accountId}`);
  
  try {
    const result = await this.crmClient.getAccount(args.accountId);
    console.log(
      `[${this.name}] Successfully fetched account: ${result.name}`
    );
    return result;
  } catch (error) {
    console.error(
      `[${this.name}] Failed to fetch account ${args.accountId}:`,
      error.message
    );
    throw error;
  }
}
```

### 6. Stateless Operation
Tools should not maintain conversation state. State belongs in the Assistant:

```typescript
// ❌ WRONG: Tool storing state
class BadTool extends Tool {
  private conversationHistory: Message[] = [];  // Don't do this
  
  async execute(args: any) {
    this.conversationHistory.push(...);  // WRONG
  }
}

// ✅ RIGHT: Assistant manages state, tool is stateless
class GoodTool extends Tool {
  async execute(args: any) {
    // Just perform the action, return the result
    // Assistant handles storing it
  }
}
```

### 7. Configuration from Environment
```typescript
// ✅ Good
export class ExternalApiTool extends Tool {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    super();
    this.apiKey = process.env.EXTERNAL_API_KEY || '';
    this.baseUrl = process.env.EXTERNAL_API_URL || 'https://api.example.com';
    
    if (!this.apiKey) {
      throw new Error('EXTERNAL_API_KEY environment variable not set');
    }
  }
}

// ❌ Avoid: Hardcoded credentials
export class BadTool extends Tool {
  private apiKey = 'sk-1234567890abcdef';  // NEVER hardcode!
}
```

## Tool Configuration & Secrets

### Environment Variable Pattern

Each tool should be configured via environment variables:

```bash
# In .env or deployment config
EXTERNAL_API_KEY=sk_live_xxxxx
EXTERNAL_API_URL=https://api.example.com
EXTERNAL_API_TIMEOUT=30000
DATABASE_URL=postgresql://user:pass@localhost/db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=app-specific-password
```

### Tool Factory Pattern

Use async tool factory for dynamic initialization:

```typescript
tools: async (coreEngineClient) => {
  // Load configuration at startup
  const apiConfig = {
    apiKey: process.env.EXTERNAL_API_KEY,
    baseUrl: process.env.EXTERNAL_API_URL,
    timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || '30000'),
  };

  const dbConfig = {
    url: process.env.DATABASE_URL,
  };

  // Validate configuration
  if (!apiConfig.apiKey) {
    throw new Error('EXTERNAL_API_KEY not configured');
  }

  // Create configured tool instances
  return [
    new ExternalApiTool(apiConfig),
    new DatabaseTool(dbConfig),
    new EmailSenderTool({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    }),
  ];
}
```

## Tool Integration Examples

### Example 1: CRM Integration (Salesforce)

```typescript
import { Tool } from '@cktmcs/sdk';
import * as salesforce from 'salesforce-api';

export class SalesforceOpportunityTool extends Tool {
  constructor(private sfConfig: SalesforceConfig) {
    super();
    this.name = 'create-salesforce-opportunity';
    this.description = 'Creates a new opportunity in Salesforce';
  }

  async execute(args: {
    accountId: string;
    opportunityName: string;
    amount: number;
    stage: string;
  }): Promise<any> {
    try {
      const client = new salesforce.Client(this.sfConfig);
      
      const opportunity = await client.create('Opportunity', {
        AccountId: args.accountId,
        Name: args.opportunityName,
        Amount: args.amount,
        StageName: args.stage,
      });

      return {
        success: true,
        opportunityId: opportunity.id,
        message: `Created opportunity ${opportunity.id}`,
      };
    } catch (error) {
      throw new ToolExecutionError(
        this.name,
        `Salesforce API error: ${error.message}`,
        error
      );
    }
  }
}
```

### Example 2: Data Analysis

```typescript
export class DataAnalysisTool extends Tool {
  constructor() {
    super();
    this.name = 'analyze-data';
    this.description = 'Performs statistical analysis on provided data';
  }

  async execute(args: {
    data: number[];
    analysisType: 'mean' | 'median' | 'stdev' | 'correlation';
  }): Promise<any> {
    try {
      const stats = require('simple-statistics');

      const result = {
        mean: stats.mean(args.data),
        median: stats.median(args.data),
        standardDeviation: stats.standardDeviation(args.data),
        min: Math.min(...args.data),
        max: Math.max(...args.data),
        count: args.data.length,
      };

      return {
        success: true,
        analysis: result,
      };
    } catch (error) {
      throw new ToolExecutionError(
        this.name,
        `Analysis failed: ${error.message}`,
        error
      );
    }
  }
}
```

### Example 3: Document Generation

```typescript
export class DocumentGenerationTool extends Tool {
  constructor(private templateDir: string) {
    super();
    this.name = 'generate-document';
    this.description = 'Generates documents from templates with provided data';
  }

  async execute(args: {
    templateName: string;
    data: Record<string, any>;
  }): Promise<any> {
    try {
      const handlebars = require('handlebars');
      const fs = require('fs').promises;
      const path = require('path');

      // Load and compile template
      const templatePath = path.join(this.templateDir, `${args.templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);

      // Generate document
      const output = template(args.data);

      return {
        success: true,
        document: output,
        characterCount: output.length,
      };
    } catch (error) {
      throw new ToolExecutionError(
        this.name,
        `Document generation failed: ${error.message}`,
        error
      );
    }
  }
}
```

## Testing Tools

### Unit Test Example

```typescript
import { EmailSenderTool } from './EmailSenderTool';

describe('EmailSenderTool', () => {
  let tool: EmailSenderTool;
  let mockTransporter: any;

  beforeEach(() => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
    };

    tool = new EmailSenderTool({
      ...defaultConfig,
      // Override with mock
      transporter: mockTransporter,
    });
  });

  it('should send email successfully', async () => {
    const result = await tool.execute({
      to: 'test@example.com',
      subject: 'Test',
      body: '<p>Test email</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
    expect(mockTransporter.sendMail).toHaveBeenCalled();
  });

  it('should reject invalid email address', async () => {
    await expect(
      tool.execute({
        to: 'invalid-email',
        subject: 'Test',
        body: 'Test',
      })
    ).rejects.toThrow('Invalid email address');
  });

  it('should handle SMTP errors gracefully', async () => {
    mockTransporter.sendMail.mockRejectedValue(
      new Error('SMTP connection failed')
    );

    await expect(
      tool.execute({
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test',
      })
    ).rejects.toThrow('ToolExecutionError');
  });
});
```

## Deploying Custom Tools

1. **Create tool file** in `agents/[assistant-api]/src/tools/`
2. **Register in assistant** `src/index.ts`
3. **Build**: `npm run build`
4. **Test**: `npm test`
5. **Run**: `npm start`

Tools are automatically discovered and registered with the LLM when the assistant starts.

---

See [README.md](./README.md) for integration examples.
