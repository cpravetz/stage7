// Mark the 5 external integrations as lower-order base tools (isSkill:false)
export const PRODUCT_EXTERNAL_TOOL_IDS = new Set([
  'product-jira', 'product-confluence', 'product-slack', 'product-calendar', 'product-markdown-parsing',
]);

// Set Advise/Aid/Represent tiers and confirmBeforeSend for all Product skills
export const PRODUCT_TIER: Record<string, 'advise' | 'aid' | 'represent'> = {
  'create-roadmap': 'advise',
  'write-prd': 'aid',
  'product-data-analysis-user': 'advise',
  'product-insights-scheduled': 'advise',
  'product-jira': 'represent',
  'product-confluence': 'aid',
  'product-slack': 'represent',
  'product-calendar': 'represent',
  'product-markdown-parsing': 'aid',
};

export const PRODUCT_DOMAIN_KNOWLEDGE = 'Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation';
