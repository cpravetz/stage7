# JIRA Plugin

Comprehensive Jira integration for issue management, project tracking, and workflow automation.

## Configuration

Set the following environment variables:

- `JIRA_URL`: Your Jira instance URL (e.g., `https://your-domain.atlassian.net`)
- `JIRA_EMAIL`: Your Jira user email
- `JIRA_API_TOKEN`: Your Jira API token (generate from Atlassian account settings)

## Supported Actions

### createIssue
Create a new Jira issue.

**Payload:**
```json
{
  "project": "PROJ",
  "summary": "Issue summary",
  "description": "Issue description",
  "issueType": "Task",
  "assignee": "user-id",
  "priority": "High",
  "labels": ["label1", "label2"]
}
```

### updateIssue
Update an existing Jira issue.

**Payload:**
```json
{
  "issueKey": "PROJ-123",
  "fields": {
    "summary": "Updated summary",
    "description": "Updated description"
  }
}
```

### searchIssues
Search for issues using JQL.

**Payload:**
```json
{
  "jql": "project = PROJ AND status = Open",
  "maxResults": 50,
  "startAt": 0,
  "fields": ["summary", "status", "assignee"]
}
```

### getIssueDetails
Get details of a specific issue.

**Payload:**
```json
{
  "issueKey": "PROJ-123"
}
```

### addComment
Add a comment to an issue.

**Payload:**
```json
{
  "issueKey": "PROJ-123",
  "comment": "This is a comment"
}
```

### transitionIssue
Transition an issue to a new status.

**Payload:**
```json
{
  "issueKey": "PROJ-123",
  "transitionId": "31"
}
```

### getProjects
Get list of all accessible projects.

**Payload:**
```json
{}
```

## Usage Example

```json
{
  "action": "createIssue",
  "payload": {
    "project": "PROJ",
    "summary": "New bug found",
    "description": "Description of the bug",
    "issueType": "Bug",
    "priority": "High"
  }
}
```

