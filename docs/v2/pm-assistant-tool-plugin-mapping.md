# Product Mgt Assistant Tool-to-Plugin Mapping

## Overview
This document maps Product Mgt Assistant SDK tools (L2) to their corresponding L1 plugins in the CapabilitiesManager.

## Architecture Flow
```
L3 (pm-assistant-api) 
  ↓ uses
L2 SDK Tools (JiraTool, ConfluenceTool, etc.)
  ↓ calls via HttpCoreEngineClient
L1 Core Engine (MissionControl)
  ↓ executes via CapabilitiesManager
L1 Plugins (JIRA, CONFLUENCE, etc.)
```

## Product Mgt Assistant Tools

### Current Product Mgt Assistant Configuration
From `agents/pm-assistant-api/src/index.ts`:
- **JiraTool** - Jira integration
- **ConfluenceTool** - Confluence documentation
- **DataAnalysisTool** - Data analysis and insights
- **DocumentationParserTool** - Parse and analyze documentation
- **FileManagementTool** - File operations

## Tool-to-Plugin Mapping

### 1. JiraTool → JIRA Plugin

**SDK Tool**: `sdk/src/tools/JiraTool.ts`
- Methods: `createIssue`, `getIssueDetails`, `updateIssueStatus`, `queryIssues`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/JIRA/`
- Actions: `create_issue`, `get_issue`, `update_issue`, `search_issues`, `add_comment`, `get_transitions`, `transition_issue`

**Mapping**:
| SDK Method | L1 Plugin Action | Status |
|------------|------------------|--------|
| createIssue | create_issue | ✅ Implemented |
| getIssueDetails | get_issue | ✅ Implemented |
| updateIssueStatus | transition_issue | ✅ Implemented |
| queryIssues | search_issues | ✅ Implemented |

### 2. ConfluenceTool → CONFLUENCE Plugin

**SDK Tool**: `sdk/src/tools/ConfluenceTool.ts`
- Methods: `createPage`, `getPageContent`, `updatePage`, `searchPages`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/CONFLUENCE/`
- Actions: `create_page`, `get_page`, `update_page`, `search_pages`, `get_space`, `list_pages`

**Mapping**:
| SDK Method | L1 Plugin Action | Status |
|------------|------------------|--------|
| createPage | create_page | ✅ Implemented |
| getPageContent | get_page | ✅ Implemented |
| updatePage | update_page | ✅ Implemented |
| searchPages | search_pages | ✅ Implemented |

### 3. DataAnalysisTool → DATA_ANALYSIS Plugin

**SDK Tool**: `sdk/src/tools/DataAnalysisTool.ts`
- Methods: `analyzeDataset`, `generateInsights`, `createVisualization`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/DATA_ANALYSIS/`
- Actions: `analyze_dataset`, `generate_insights`, `create_visualization`, `export_results`, `compare_datasets`

**Mapping**:
| SDK Method | L1 Plugin Action | Status |
|------------|------------------|--------|
| analyzeDataset | analyze_dataset | ✅ Implemented |
| generateInsights | generate_insights | ✅ Implemented |
| createVisualization | create_visualization | ✅ Implemented |

### 4. DocumentationParserTool → DOC_PARSER Plugin

**SDK Tool**: `sdk/src/tools/DocumentationParserTool.ts`
- Methods: `parseDocument`, `extractMetadata`, `analyzeStructure`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/DOC_PARSER/`
- Actions: `parse_document`, `extract_metadata`, `analyze_structure`, `extract_sections`

**Mapping**:
| SDK Method | L1 Plugin Action | Status |
|------------|------------------|--------|
| parseDocument | parse_document | ⚠️ Needs implementation |
| extractMetadata | extract_metadata | ⚠️ Needs implementation |
| analyzeStructure | analyze_structure | ⚠️ Needs implementation |

### 5. FileManagementTool → FILE_OPERATIONS Plugin

**SDK Tool**: `sdk/src/tools/FileManagementTool.ts`
- Methods: `readFile`, `writeFile`, `listFiles`, `deleteFile`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/FILE_OPERATIONS/`
- Actions: `read_file`, `write_file`, `list_files`, `delete_file`, `create_directory`, `move_file`

**Mapping**:
| SDK Method | L1 Plugin Action | Status |
|------------|------------------|--------|
| readFile | read_file | ✅ Implemented |
| writeFile | write_file | ✅ Implemented |
| listFiles | list_files | ✅ Implemented |
| deleteFile | delete_file | ✅ Implemented |

## Additional Product Mgt Assistant Tools (Recommended)

### 6. SlackTool → SLACK Plugin

**SDK Tool**: `sdk/src/tools/SlackTool.ts`
- Methods: `sendMessage`, `createChannel`, `getChannels`, `postToChannel`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/SLACK/`
- Actions: `send_message`, `create_channel`, `get_channels`, `post_to_channel`, `get_messages`, `add_reaction`

**Status**: ✅ Both implemented

### 7. CalendarTool → CALENDAR Plugin

**SDK Tool**: `sdk/src/tools/CalendarTool.ts`
- Methods: `createEvent`, `getEvents`, `updateEvent`, `deleteEvent`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/CALENDAR/`
- Actions: `create_event`, `get_events`, `update_event`, `delete_event`, `find_available_slots`

**Status**: ✅ Plugin implemented, SDK tool needs to be added to Product Mgt Assistant

### 8. ReportingTool → REPORT_GENERATION Plugin

**SDK Tool**: `sdk/src/tools/ReportingTool.ts`
- Methods: `createReport`, `exportPDF`, `exportHTML`

**L1 Plugin**: `services/capabilitiesmanager/src/plugins/REPORT_GENERATION/`
- Actions: `create_report`, `export_pdf`, `export_html`, `export_markdown`, `schedule_report`

**Status**: ✅ Plugin implemented, SDK tool needs to be added to Product Mgt Assistant

## Integration Pattern

### How SDK Tools Call L1 Plugins

1. **SDK Tool Method Called** (L2)
   ```typescript
   await jiraTool.createIssue(issueData, conversationId);
   ```

2. **Tool.execute() Called** (L2)
   ```typescript
   protected async execute(input: any, conversationId: string): Promise<any> {
     return this.coreEngineClient.executeToolAction(
       this.name,
       input,
       conversationId
     );
   }
   ```

3. **HttpCoreEngineClient Routes to L1** (L2)
   ```typescript
   POST /api/missions/{missionId}/tool-execution
   Body: { toolName: "JiraTool", input: {...} }
   ```

4. **MissionControl Delegates to CapabilitiesManager** (L1)
   ```typescript
   capabilitiesManager.executePlugin("JIRA", action, params)
   ```

5. **Plugin Executes Action** (L1)
   ```python
   # services/capabilitiesmanager/src/plugins/JIRA/main.py
   def execute_plugin(inputs):
       action = inputs.get('action')
       if action == 'create_issue':
           return create_issue(inputs)
   ```

## Next Steps

1. ✅ Verify all Product Mgt Assistant tools are registered
2. ⚠️ Implement missing DOC_PARSER actions
3. 📋 Add CalendarTool and ReportingTool to Product Mgt Assistant configuration
4. 🧪 Test each tool-to-plugin mapping end-to-end
5. 📝 Document any discrepancies or missing functionality

