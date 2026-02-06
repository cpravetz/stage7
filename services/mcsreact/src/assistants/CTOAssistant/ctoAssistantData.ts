import { DoraMetrics, Incident, SecurityAlert, CloudSpend } from '@cktmcs/sdk';

// --- Initial Placeholder Data ---

export const INITIAL_DORA_METRICS: DoraMetrics = {
  deploymentFrequency: { value: 'N/A', trend: 0 },
  leadTime: { value: 'N/A', trend: 0 },
  changeFailureRate: { value: 'N/A', trend: 0 },
  timeToRestore: { value: 'N/A', trend: 0 },
};

export const INITIAL_INCIDENTS: Incident[] = [];

export const INITIAL_SECURITY_ALERTS: SecurityAlert[] = [];

export const INITIAL_CLOUD_SPEND: CloudSpend = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  datasets: [
    {
      label: 'This Year',
      data: [0, 0, 0, 0, 0, 0],
      color: '#1976d2',
    },
    {
      label: 'Last Year',
      data: [0, 0, 0, 0, 0, 0],
      color: '#757575',
    },
  ],
};