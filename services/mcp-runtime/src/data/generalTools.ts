/**
 * NOTE: This is a LOCAL MIRROR of `services/tool-executor/src/data/generalTools.ts`.
 *
 * These definitions are only used as a startup FALLBACK when the tool-executor
 * service cannot be reached. At startup `src/index.ts` prefers
 * `GET ${TOOL_EXECUTOR_URL}/api/tool-executor/tools` as the single source of truth
 * and only falls back to this array if that fetch fails. Keep this file in sync
 * with the tool-executor copy.
 *
 * Do NOT reintroduce `type: 'mcp'` entries whose `manifest.server` points at an
 * MCP server: no such servers exist in this system. Every tool here is
 * `type: 'native'` with a real in-process `manifest.executor` and is runnable
 * through the tool-executor that mcp-runtime forwards `tools/call` to.
 */

export interface Tool {
  id: string;
  name: string;
  description: string;
  type: 'native' | 'mcp' | 'openapi' | 'code';
  manifest: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  isSkill?: boolean;
}

export const legacyGeneralTools: Tool[] = [
  {
    id: 'jira_issue_track',
    name: 'Jira Issue Tracker',
    description: 'Create, query, and transition Jira issues via the Jira REST API. Requires the `jiraUrl` credential (Jira base URL, e.g. jira_url) and a `jiraToken` API token (or `apiToken`) for HTTP Basic auth. Supports create_issue, query_issues, and transition operations.',
    type: 'native',
    manifest: { executor: 'vendor', type: 'native', vendor: 'jira', capabilities: ['issue.create', 'issue.query', 'issue.transition'] },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create_issue', 'query_issues', 'transition'], description: 'Jira REST operation to perform' },
        projectKey: { type: 'string', description: 'Jira project key, e.g. PROJ (required for create_issue)' },
        summary: { type: 'string', description: 'Issue summary/title (required for create_issue)' },
        description: { type: 'string', description: 'Issue description body (for create_issue)' },
        issueType: { type: 'string', description: 'Issue type name, e.g. Task, Bug, Story (for create_issue; defaults to Task)' },
        priority: { type: 'string', description: 'Priority name, e.g. High, Medium, Low (for create_issue)' },
        assignee: { type: 'string', description: 'Assignee account identifier (for create_issue)' },
        jql: { type: 'string', description: 'Jira Query Language statement (for query_issues; defaults to "order by created DESC")' },
        maxResults: { type: 'integer', minimum: 1, description: 'Maximum issues to return (for query_issues; default 50)' },
        issueKey: { type: 'string', description: 'Issue key, e.g. PROJ-123 (required for transition)' },
        transitionName: { type: 'string', description: 'Workflow transition name (for transition)' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'object', description: 'Created or transitioned issue object' },
        issues: { type: 'array', description: 'List of matching issues (for query_issues)' },
        total: { type: 'integer', description: 'Total matching issue count (for query_issues)' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'confluence_docs',
    name: 'Confluence Documentation',
    description: 'Create pages and search Confluence content via the Confluence Cloud REST API v2. Requires the `confluenceUrl` credential (Confluence base URL, e.g. confluence_url) and a `confluenceToken` API token (or `apiToken`) for HTTP Basic auth. Supports create_page and search operations.',
    type: 'native',
    manifest: { executor: 'vendor', type: 'native', vendor: 'confluence', capabilities: ['page.create', 'page.search'] },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create_page', 'search'], description: 'Confluence REST operation to perform' },
        spaceId: { type: 'string', description: 'Space ID or key (required for create_page)' },
        title: { type: 'string', description: 'Page title (required for create_page)' },
        content: { type: 'string', description: 'Page body in Confluence storage/wiki format (for create_page)' },
        cql: { type: 'string', description: 'Confluence Query Language statement (for search; defaults to "type=page")' },
        limit: { type: 'integer', minimum: 1, description: 'Maximum pages to return (for search; default 25)' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        page: { type: 'object', description: 'Created page object (for create_page)' },
        pages: { type: 'array', description: 'Search results (for search)' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'data_analysis',
    name: 'Data Analysis',
    description: 'Analyze datasets with statistical summaries, trend detection, correlation, and distribution histograms. Accepts a dataset as CSV text, a JSON string, or an array of record objects. No operator credentials required.',
    type: 'native',
    manifest: { executor: 'data_analysis', type: 'native', capabilities: ['analysis.summary', 'analysis.trend', 'analysis.correlation', 'analysis.distribution'] },
    inputSchema: {
      type: 'object',
      properties: {
        dataset: { description: 'Dataset as CSV text, a JSON string (array of objects, or an object with a rows/data/records/items array), or an array of record objects' },
        analysisType: { type: 'string', enum: ['summary', 'trend', 'correlation', 'distribution'], description: 'Type of analysis to run (default summary)' },
        xColumn: { type: 'string', description: 'Independent variable column for trend analysis (defaults to first date/numeric column)' },
        yColumn: { type: 'string', description: 'Dependent variable column for trend analysis (defaults to first numeric column)' },
        targetColumn: { type: 'string', description: 'Column to describe for distribution analysis (defaults to first numeric column)' },
        topValuesLimit: { type: 'integer', minimum: 1, description: 'Max top values reported for categorical columns (default 5)' },
      },
      required: ['dataset'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the analysis completed without error' },
        summary: { type: 'object', description: 'Per-column stats plus optional trend/correlation/distribution results' },
        insights: { type: 'array', description: 'Human-readable insight strings' },
        analysisType: { type: 'string', description: 'The analysisType that was run' },
        rowCount: { type: 'integer', description: 'Number of rows analyzed' },
        columnCount: { type: 'integer', description: 'Number of columns analyzed' },
        error: { type: 'string', description: 'Error message, if the analysis failed' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'email_sender',
    name: 'Email Sender',
    description: 'Send emails via SMTP using nodemailer. Requires the `smtp_host`, `smtp_user`, and `smtp_pass` credentials (smtp_port and from_address are optional, defaulting via SMTP_PORT/SMTP_FROM env vars). No message queueing or scheduling support; sends immediately.',
    type: 'native',
    manifest: { executor: 'email', type: 'native', capabilities: ['email.send'] },
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: ['string', 'array'], items: { type: 'string' }, description: 'Recipient email address(es), as a string or array of strings' },
        subject: { type: 'string', description: 'Email subject line (required)' },
        text: { type: 'string', description: 'Plain text body' },
        html: { type: 'string', description: 'HTML body' },
        from: { type: 'string', description: 'Sender address (defaults to smtp_user or from_address)' },
        attachments: { type: 'array', items: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' }, path: { type: 'string' } }, required: ['filename'] }, description: 'File attachments' },
      },
      required: ['to', 'subject'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the email was sent' },
        messageId: { type: 'string', description: 'Message ID assigned by the SMTP server' },
        error: { type: 'string', description: 'Error message, if sending failed' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'calendar_manager',
    name: 'Calendar Manager',
    description: 'Manage calendar events stored as RFC 5545 .ics files (base path via CALENDAR_BASE_PATH, default /tmp/stage7-calendars). Create, update, list, delete, export, and check availability of events. No operator credentials required.',
    type: 'native',
    manifest: { executor: 'calendar', type: 'native', capabilities: ['event.create', 'event.update', 'event.list', 'event.delete', 'event.export', 'availability.check'] },
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'list', 'delete', 'check_availability', 'export'], description: 'Calendar action to perform (required)' },
        calendarPath: { type: 'string', description: 'Calendar .ics file name (must end in .ics; defaults to default.ics)' },
        summary: { type: 'string', description: 'Event summary/title (required for create; used as a lookup key for update if uid is omitted)' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        start: { type: 'string', description: 'Event start time as an ISO 8601 string (required for create; used as windowStart for check_availability if windowStart is omitted)' },
        end: { type: 'string', description: 'Event end time as an ISO 8601 string' },
        durationMinutes: { type: 'integer', minimum: 1, description: 'Event duration in minutes (used when end is omitted)' },
        attendees: { type: 'array', items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } }, required: ['email'] }, description: 'Event attendees (each requires an email)' },
        uid: { type: 'string', description: 'Event UID (required for update and delete)' },
        rangeStart: { type: 'string', description: 'Filter events ending at or after this ISO date (for list)' },
        rangeEnd: { type: 'string', description: 'Filter events starting at or before this ISO date (for list)' },
        windowStart: { type: 'string', description: 'Availability window start (for check_availability)' },
        windowEnd: { type: 'string', description: 'Availability window end (for check_availability)' },
        slotMinutes: { type: 'integer', minimum: 1, description: 'Availability slot duration in minutes (default 30)' },
        busy: { type: 'array', items: { type: 'object', properties: { attendee: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['start', 'end'] }, description: 'Known busy intervals to mark as occupied (for check_availability)' },
      },
      required: ['action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the action completed' },
        event: { type: 'object', description: 'Created/updated/deleted/exported event' },
        events: { type: 'array', description: 'Listed events (for list and export)' },
        availability: { type: 'object', description: 'Free/busy availability slots (for check_availability)' },
        ics: { type: 'string', description: 'Serialized ICS document (for list and export)' },
        error: { type: 'string', description: 'Error message, if the action failed' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'slack_messaging',
    name: 'Slack Messaging',
    description: 'Send messages, list channels, and upload files to Slack via the Slack Web API. Requires the `slackToken` credential (Slack bot token, e.g. xoxb-...) for Bearer auth. Supports post_message, list_channels, and upload_file operations.',
    type: 'native',
    manifest: { executor: 'vendor', type: 'native', vendor: 'slack', capabilities: ['message.send', 'channel.list', 'file.upload'] },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['post_message', 'list_channels', 'upload_file'], description: 'Slack Web API operation to perform' },
        channel: { type: 'string', description: 'Channel ID or name (required for post_message and upload_file)' },
        text: { type: 'string', description: 'Message text (for post_message)' },
        blocks: { description: 'Slack Block Kit JSON array for rich message layouts (for post_message)' },
        content: { type: 'string', description: 'File content as a string (required for upload_file)' },
        filename: { type: 'string', description: 'Filename for the uploaded file (for upload_file; defaults to file.txt)' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean', description: 'Slack API success flag' },
        ts: { type: 'string', description: 'Message timestamp (for post_message)' },
        channel: { type: 'string', description: 'Channel where the message was posted or file uploaded' },
        channels: { type: 'array', description: 'List of channels (for list_channels)' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'github_integration',
    name: 'GitHub Integration',
    description: 'Create issues, list repository issues, and create pull requests via the GitHub REST API. Requires the `githubToken` credential (GitHub personal access token, e.g. ghp_...) for Bearer auth. Supports create_issue, list_issues, and create_pr operations.',
    type: 'native',
    manifest: { executor: 'vendor', type: 'native', vendor: 'github', capabilities: ['issue.create', 'issue.list', 'pr.create'] },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create_issue', 'list_issues', 'create_pr'], description: 'GitHub REST operation to perform' },
        repo: { type: 'string', description: 'Repository in "owner/repo" format (required for all operations)' },
        title: { type: 'string', description: 'Issue or pull request title (required for create_issue and create_pr)' },
        body: { type: 'string', description: 'Issue or pull request body/description' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names to apply (for create_issue)' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Assignee usernames (for create_issue)' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter (for list_issues; defaults to open)' },
        perPage: { type: 'integer', minimum: 1, description: 'Number of issues per page (for list_issues; default 50)' },
        head: { type: 'string', description: 'Head branch (required for create_pr)' },
        base: { type: 'string', description: 'Base branch (required for create_pr)' },
      },
      required: ['operation', 'repo'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'object', description: 'Created issue, issue list, or pull request object' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'database_query',
    name: 'Database Query',
    description: 'Execute SQL queries against SQLite, PostgreSQL, or MySQL databases. Requires a `connectionString` credential (e.g. postgresql://user:pass@host:5432/db) or individual `host`, `port`, `database`, `username`, `password` credentials for postgres/mysql. SQLite uses a local file path or ":memory:" and needs no credentials.',
    type: 'native',
    manifest: { executor: 'database', type: 'native', capabilities: ['query.execute'] },
    inputSchema: {
      type: 'object',
      properties: {
        engine: { type: 'string', enum: ['sqlite', 'postgres', 'mysql'], description: 'Database engine type (required)' },
        connectionString: { type: 'string', description: 'Full connection string (e.g. postgresql://user:pass@host:5432/db). If omitted, one is built from host/port/database/username/password or credentials' },
        host: { type: 'string', description: 'Database host (used to build a connection string when connectionString is omitted)' },
        port: { type: 'integer', description: 'Database port (defaults to 5432 for postgres, 3306 for mysql)' },
        database: { type: 'string', description: 'Database/schema name' },
        username: { type: 'string', description: 'Database username' },
        password: { type: 'string', description: 'Database password (sensitive)', sensitive: true },
        query: { type: 'string', description: 'SQL query to execute (required)' },
        params: { description: 'Positional query parameters for $1, $2, ... placeholders' },
        timeoutMs: { type: 'integer', minimum: 1, description: 'Query timeout in milliseconds (default 30000)' },
      },
      required: ['engine', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the query succeeded' },
        rows: { type: 'array', description: 'Result rows' },
        columns: { type: 'array', description: 'Column names' },
        rowCount: { type: 'integer', description: 'Number of rows returned' },
        error: { type: 'string', description: 'Error message, if the query failed' },
        durationMs: { type: 'integer', description: 'Execution time in milliseconds' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'file_storage',
    name: 'File Storage',
    description: 'Read, write, list, delete, check existence, and create directories in a secure sandboxed local file store rooted at FILE_STORAGE_BASE_PATH (default /tmp/stage7-filestore). Supports optional buckets for logical separation. No operator credentials required.',
    type: 'native',
    manifest: { executor: 'files', type: 'native', capabilities: ['file.read', 'file.write', 'file.list', 'file.delete', 'file.exists', 'dir.mkdir'] },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'exists', 'mkdir'], description: 'File operation to perform (required)' },
        path: { type: 'string', description: 'File or directory path relative to the base path or bucket (required)' },
        content: { type: 'string', description: 'Content to write (for write)' },
        bucket: { type: 'string', description: 'Optional bucket name for logical separation' },
      },
      required: ['operation', 'path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the operation succeeded' },
        data: { type: 'object', description: 'Operation result (path, bytes, listing, or exists flag)' },
        error: { type: 'string', description: 'Error message, if the operation failed' },
        durationMs: { type: 'integer', description: 'Execution time in milliseconds' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
  {
    id: 'webhook_dispatcher',
    name: 'Webhook Dispatcher',
    description: 'Send HTTP webhooks with retry, signing, and event tracking. No operator credentials required; the target URL is provided per call. Supports configurable HTTP methods, headers, JSON bodies, and retry with backoff.',
    type: 'native',
    manifest: { executor: 'webhook', type: 'native', capabilities: ['webhook.send'] },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target webhook URL (required)' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method (default POST)' },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Additional HTTP request headers' },
        body: { description: 'Request body, sent as JSON' },
        secret: { type: 'string', description: 'Secret token added as the X-Webhook-Secret header (sensitive)', sensitive: true },
        event: { type: 'string', description: 'Event name added as the X-Webhook-Event header' },
        retries: { type: 'integer', minimum: 1, description: 'Number of delivery attempts (default 3)' },
        timeoutMs: { type: 'integer', minimum: 1, description: 'Per-attempt timeout in milliseconds (default 10000)' },
      },
      required: ['url'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether delivery succeeded' },
        statusCode: { type: 'integer', description: 'HTTP status code of the response' },
        response: { description: 'Response body, parsed as JSON if possible' },
        error: { type: 'string', description: 'Error message, if delivery failed after retries' },
        durationMs: { type: 'integer', description: 'Total execution time in milliseconds' },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  },
];
