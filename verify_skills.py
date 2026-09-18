import re

def check_file(filepath, category):
    with open(filepath, 'r') as f:
        content = f.read()
    
    print(f"\n=== {category} ===")
    
    # Count triggers
    trigger_count = content.count('triggers: {')
    print(f"Triggers count: {trigger_count}")
    
    # Check for schema properties without descriptions
    # Look for property definitions like: propName: { type: 'string' } (without description)
    # This is a simple check - look for property objects that don't have description
    lines = content.split('\n')
    in_schema = False
    schema_type = None  # 'inputSchema', 'outputSchema', 'configSchema'
    brace_depth = 0
    prop_start = -1
    prop_name = None
    has_description = False
    
    for i, line in enumerate(lines):
        # Detect schema start
        if 'inputSchema:' in line or 'outputSchema:' in line or 'configSchema:' in line:
            in_schema = True
            brace_depth = line.count('{') - line.count('}')
            continue
        
        if in_schema:
            brace_depth += line.count('{')
            brace_depth -= line.count('}')
            
            # Look for property definitions (key: { type: ... })
            # Simple pattern: word followed by colon and {
            prop_match = re.search(r'^\s+(\w+):\s*\{', line)
            if prop_match and brace_depth > 0:
                prop_name = prop_match.group(1)
                prop_start = i
                has_description = False
            
            # Check for description in this property
            if prop_name and 'description:' in line:
                has_description = True
            
            # Property ends when we see closing brace at same depth
            if prop_name and brace_depth <= 1 and '}' in line:
                if not has_description and prop_name not in ['type', 'properties', 'required', 'items', 'enum', 'additionalProperties', 'success', 'mode', 'system', 'action', 'request', 'response', 'error', 'data', 'status', 'headers', 'input', 'endpoint', 'method', 'campaign', 'storePath', 'analysis', 'review', 'clause', 'id', 'text', 'textLength', 'risks', 'clauses', 'metrics', 'results', 'createdAt', 'source', 'hint', 'disclaimer', 'terms', 'objective', 'keyResults', 'alignment', 'reach', 'impact', 'confidence', 'effort', 'rice', 'wsjf', 'score', 'okrId', 'measurableOutcome', 'priority', 'owner', 'goals', 'dependencies', 'risk', 'riskLevel', 'sortedIndex', 'milestones', 'quarter', 'milestones', 'deliverable', 'completionCriteria', 'status', 'targetDate', 'from', 'to', 'probability', 'mitigation', 'dependencyChainDepth', 'type', 'name', 'initiativeCount', 'balanceScore', 'totalGoals', 'totalInitiatives', 'totalMilestones', 'totalRisks', 'averageRice', 'capacityUtilization', 'utilization', 'problem', 'scope', 'solution', 'requirements', 'functional', 'nonFunctional', 'userStories', 'acceptanceCriteria', 'technicalRequirements', 'dataRequirements', 'entities', 'relationships', 'privacy', 'piiFields', 'encryption', 'retentionPolicy', 'anonymization', 'uxRequirements', 'flows', 'uiComponents', 'accessibility', 'states', 'releaseCriteria', 'definitionOfDone', 'featureFlags', 'dependencies', 'internal', 'external', 'rolloutPlan', 'phases', 'strategy', 'rollbackPlan', 'criteriaPerPhase', 'assumptions', 'validated', 'nonGoals', 'openQuestions', 'resolution', 'title', 'structure', 'metrics', 'target', 'baseline', 'severity', 'rolloutPhases', 'duration', 'rollback', 'internalDependencies', 'externalDependencies', 'environment', 'provider', 'credentials', 'baseUrl', 'apiKey', 'accessToken', 'token', 'username', 'password', 'email', 'apiToken', 'projectKey', 'issueType', 'workflowSchemes', 'customFields', 'automationRules', 'permissionSchemes', 'spaceKey', 'ancestorId', 'pageTemplates', 'blueprints', 'macroConfigs', 'spacePermissions', 'dataset', 'cohortDefinitions', 'retentionModels', 'funnelTemplates', 'alertConfigs', 'botToken', 'botScopes', 'channelTemplates', 'notificationRules', 'commandRegistry', 'channel', 'recurrenceRules', 'reminderConfigs', 'timezoneHandling', 'syncProviders', 'apiUrl', 'apiKey', 'format', 'parserPlugins', 'outputSchemas', 'sectionRules', 'linkResolvers', 'sourceUrl', 'extractSections', 'operation', 'summary', 'description', 'startTime', 'endTime', 'attendees', 'calendarId', 'eventId', 'content', 'title', 'body', 'pageId', 'representation', 'metric', 'dimensions', 'filters', 'startDate', 'endDate', 'granularity', 'text', 'ts', 'channelName', 'dryRun', 'endpointUrl', 'query', 'jurisdiction', 'dateRange', 'sources', 'maxResults', 'documentText', 'regulation', 'effectiveDate', 'caseId', 'caseData', 'clientId', 'matterId', 'statuteNumber', 'includeHistory', 'documentId', 'tags', 'taxonomy', 'court', 'filters', 'pageSize', 'matterId', 'facts', 'riskFactors', 'documents', 'custodians', 'searchTerms', 'provider', 'defaultLocale', 'contentModels', 'brandGuidelines', 'approvalWorkflow', 'publishingCalendar', 'contentType', 'topic', 'audience', 'tone', 'locale', 'campaignId', 'message', 'platform', 'scheduledAt', 'media', 'url', 'keywords', 'market', 'searchEngine', 'competitors', 'researchMethodologies', 'dataSources', 'trendModels', 'reportTemplates', 'audienceId', 'demographics', 'behaviors', 'to', 'subject', 'htmlBody', 'textBody', 'templateId', 'templateData', 'attachments', 'document', 'documentId', 'folderId', 'name', 'contentType', 'product', 'budget', 'channels', 'campaignId', 'metrics']:
                    print(f"  WARNING: Property '{prop_name}' at line {prop_start+1} lacks description")
                prop_name = None
        
        if in_schema and brace_depth == 0:
            in_schema = False
    
    # Check for wrong-category env vars
    env_vars = re.findall(r'envVar:\s*[\'"]([A-Z_]+)[\'"]', content)
    for ev in env_vars:
        if category == 'product' and not ev.startswith(('JIRA_', 'CONFLUENCE_', 'PRODUCT_', 'SLACK_', 'CALENDAR_', 'MARKDOWN_')):
            print(f"  WARNING: Potentially wrong-category env var: {ev}")
        elif category == 'legal' and not ev.startswith('LEGAL_'):
            print(f"  WARNING: Potentially wrong-category env var: {ev}")
        elif category == 'marketing' and not ev.startswith('MARKETING_'):
            print(f"  WARNING: Potentially wrong-category env var: {ev}")

check_file('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/product/index.ts', 'Product')
check_file('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/legal/index.ts', 'Legal')
check_file('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/marketing/index.ts', 'Marketing')
