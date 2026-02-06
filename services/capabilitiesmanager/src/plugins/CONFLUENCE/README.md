# CONFLUENCE Plugin

Comprehensive Confluence integration for documentation, knowledge management, and collaboration.

## Configuration

Set the following environment variables:

- `CONFLUENCE_URL`: Your Confluence instance URL (e.g., `https://your-domain.atlassian.net/wiki`)
- `CONFLUENCE_EMAIL`: Your Confluence user email
- `CONFLUENCE_API_TOKEN`: Your Confluence API token (generate from Atlassian account settings)

## Supported Actions

### createPage
Create a new Confluence page.

**Payload:**
```json
{
  "space": "TEAM",
  "title": "Page Title",
  "content": "<p>Page content in storage format</p>",
  "parentId": "123456"
}
```

### updatePage
Update an existing Confluence page.

**Payload:**
```json
{
  "pageId": "123456",
  "title": "Updated Title",
  "content": "<p>Updated content</p>",
  "version": 2
}
```

### searchContent
Search for Confluence content using CQL.

**Payload:**
```json
{
  "query": "type=page AND space=TEAM",
  "limit": 25
}
```

### getPageDetails
Get details of a specific page.

**Payload:**
```json
{
  "pageId": "123456",
  "expand": "body.storage,version,space"
}
```

### deletePage
Delete a Confluence page.

**Payload:**
```json
{
  "pageId": "123456"
}
```

### getSpaces
Get list of all accessible spaces.

**Payload:**
```json
{
  "limit": 25
}
```

### addAttachment
Add an attachment to a page (not yet implemented).

**Payload:**
```json
{
  "pageId": "123456"
}
```

## Usage Example

```json
{
  "action": "createPage",
  "payload": {
    "space": "TEAM",
    "title": "Meeting Notes - 2026-01-04",
    "content": "<h1>Meeting Notes</h1><p>Discussion points...</p>"
  }
}
```

