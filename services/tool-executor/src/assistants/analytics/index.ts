import { Tool } from '../../types';

import { createWorkflow, AssistantWorkflow } from '../../adk/workflow-common';
import { ANALYTICS_ADHOC_QUERY_EVALUATOR } from './skills/analytics-adhoc-query-evaluator';
import { ANALYTICS_SCHEDULED_TREND_MONITOR } from './skills/analytics-scheduled-trend-monitor';
import { ANALYTICS_CONFIG_SCHEMA } from './analytics-contract';
ANALYTICS_SCHEDULED_TREND_MONITOR.configSchema = ANALYTICS_CONFIG_SCHEMA;
ANALYTICS_SCHEDULED_TREND_MONITOR.tier = 'advise';
ANALYTICS_SCHEDULED_TREND_MONITOR.isSkill = true;
ANALYTICS_SCHEDULED_TREND_MONITOR.domainKnowledge = 'Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks';
ANALYTICS_ADHOC_QUERY_EVALUATOR.configSchema = ANALYTICS_CONFIG_SCHEMA;
ANALYTICS_ADHOC_QUERY_EVALUATOR.tier = 'advise';
ANALYTICS_ADHOC_QUERY_EVALUATOR.isSkill = true;
ANALYTICS_ADHOC_QUERY_EVALUATOR.domainKnowledge = 'Business intelligence architectures, SQL/data modeling principles, statistical trend analysis, cross-functional KPI frameworks';
  
export const analyticsSkills: Tool[] = [ANALYTICS_SCHEDULED_TREND_MONITOR, ANALYTICS_ADHOC_QUERY_EVALUATOR];
  
 
export const analyticsWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Analytics',
  productObject: 'metric / insight',
  flow: 'report → analyze → query',
  skills: analyticsSkills,
});
