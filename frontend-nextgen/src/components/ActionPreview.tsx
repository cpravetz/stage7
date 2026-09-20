import React from 'react';
import { postJSON } from '../utils/api';

interface ActionPreviewProps {
  toolId: string;
  input: Record<string, unknown>;
}

interface PreviewSummary {
  toolName: string;
  action: string;
  object: string | undefined;
  scope: Record<string, unknown>;
  confirmBeforeSend: boolean;
  requiresConfirmation: boolean;
  dryRun: boolean;
  affectedRecords: number;
  expectedSideEffects: string[];
}

export const ActionPreview: React.FC<ActionPreviewProps> = ({ toolId, input }) => {
  const [summary, setSummary] = React.useState<PreviewSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    postJSON<{ summary: PreviewSummary }>(`/api/tool-executor/tools/${encodeURIComponent(toolId)}/preview`, { input })
      .then((data) => setSummary(data.summary))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [toolId, JSON.stringify(input)]);

  if (loading) return <div style={{ padding: 16 }}>Loading preview…</div>;
  if (!summary) return null;

  return (
    <div className="action-preview" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <h4 style={{ margin: '0 0 12px 0' }}>Action Preview</h4>
      <div style={{ marginBottom: 8 }}>
        <strong>{summary.toolName}</strong>
        {' — '}
        <span style={{ color: '#6b7280' }}>{summary.action}</span>
      </div>
      {summary.object && (
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          Object: <strong>{summary.object}</strong>
        </div>
      )}
      {summary.affectedRecords > 0 && (
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          Affected records: <strong>{summary.affectedRecords}</strong>
        </div>
      )}
      {summary.expectedSideEffects.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Expected side effects:</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {summary.expectedSideEffects.map((effect, i) => (
              <li key={i}>{effect}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.requiresConfirmation && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fefce8', borderRadius: 4, fontSize: 13 }}>
          ⚠️ Confirmation required before execution
        </div>
      )}
      {summary.dryRun && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 4, fontSize: 13 }}>
          Preview only — no changes will be persisted
        </div>
      )}
    </div>
  );
};

export default ActionPreview;