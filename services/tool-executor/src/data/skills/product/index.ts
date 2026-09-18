import { Tool } from '../../../types';
import { DOCUMENT_INGESTION } from './document-ingestion';
import { ROADMAP_PRD_DRAFTING } from './roadmap-prd-drafting';
import { DELIVERY_TRACKING } from './delivery-tracking';
import { PRODUCT_ANALYTICS_INSIGHT } from './product-analytics-insight';
import { TEAM_COORDINATION } from './team-coordination';

export const productSkills: Tool[] = [
  DOCUMENT_INGESTION,
  { ...ROADMAP_PRD_DRAFTING, isSkill: false },
  DELIVERY_TRACKING,
  PRODUCT_ANALYTICS_INSIGHT,
  TEAM_COORDINATION,
];
