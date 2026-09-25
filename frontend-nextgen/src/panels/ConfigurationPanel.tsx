import { CONFIG_LABEL_MAP } from '../utils/workspaceHelpers';
import { sfHumanizeKey as humanizeKey } from '../components/SchemaFields';

interface ConfigurationPanelProps {
  editingSystemPrompt: string;
  setEditingSystemPrompt: (value: string) => void;
  transactionGuidanceEntries: string[];
  transactionInput: string;
  setTransactionInput: (value: string) => void;
  addTransactionGuidance: () => void;
  removeTransactionGuidance: (idx: number) => void;
  knowledgeEntries: Array<{ id: string; title: string; content: string; source?: string }>;
  knowledgeTitle: string;
  setKnowledgeTitle: (value: string) => void;
  knowledgeContent: string;
  setKnowledgeContent: (value: string) => void;
  knowledgeSource: string;
  setKnowledgeSource: (value: string) => void;
  addKnowledgeEntry: () => void;
  removeKnowledgeEntry: (idx: number) => void;
  metadataConfig: Record<string, unknown>;
  setMetadataConfig: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  saving: boolean;
  saveError: string | null;
  saveConfiguration: () => void;
}

export const ConfigurationPanel = ({
  editingSystemPrompt,
  setEditingSystemPrompt,
  transactionGuidanceEntries,
  transactionInput,
  setTransactionInput,
  addTransactionGuidance,
  removeTransactionGuidance,
  knowledgeEntries,
  knowledgeTitle,
  setKnowledgeTitle,
  knowledgeContent,
  setKnowledgeContent,
  knowledgeSource,
  setKnowledgeSource,
  addKnowledgeEntry,
  removeKnowledgeEntry,
  metadataConfig,
  setMetadataConfig,
  saving,
  saveError,
  saveConfiguration,
}: ConfigurationPanelProps) => {
  return (
    <div>
      <div className="grid two-col">
        <div className="card">
          <h3>System Prompt</h3>
          <p className="hint">
            Edit the base system prompt for this assistant. Domain-specific knowledge
            and transaction guidance are appended at execution time.
          </p>
          <textarea
            placeholder="System prompt"
            value={editingSystemPrompt}
            onChange={(e) => setEditingSystemPrompt(e.target.value)}
            rows={8}
          />
        </div>

        <div className="card">
          <h3>Transaction Guidance</h3>
          <p className="hint">
            Rules that are injected into the system prompt at execution time to guide
            transaction-level behavior (e.g. "always confirm before booking").
          </p>
          <div className="input-row">
            <input
              type="text"
              placeholder="Guidance rule"
              value={transactionInput}
              onChange={(e) => setTransactionInput(e.target.value)}
              className="flex-grow"
            />
            <button type="button" onClick={addTransactionGuidance}>
              Add
            </button>
          </div>
          {transactionGuidanceEntries.length > 0 ? (
            <ul className="tool-list">
              {transactionGuidanceEntries.map((g, idx) => (
                <li key={idx}>
                  {g}
                  <button type="button" onClick={() => removeTransactionGuidance(idx)} className="remove-btn">
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No transaction guidance rules.</p>
          )}
        </div>
      </div>

      <div className="grid two-col">
        <div className="card">
          <h3>Knowledge Base</h3>
          <p className="hint">
            Add domain-specific knowledge that will be injected into the assistant's
            context at execution time.
          </p>
          <div className="input-row">
            <input
              type="text"
              placeholder="Title"
              value={knowledgeTitle}
              onChange={(e) => setKnowledgeTitle(e.target.value)}
              className="flex-grow"
            />
            <input
              type="text"
              placeholder="Source (optional)"
              value={knowledgeSource}
              onChange={(e) => setKnowledgeSource(e.target.value)}
              className="flex-grow"
            />
          </div>
          <textarea
            placeholder="Knowledge content"
            value={knowledgeContent}
            onChange={(e) => setKnowledgeContent(e.target.value)}
            rows={3}
          />
          <button type="button" onClick={addKnowledgeEntry} className="secondary">
            Add Knowledge
          </button>
          {knowledgeEntries.length > 0 ? (
            <ul className="tool-list">
              {knowledgeEntries.map((k, idx) => (
                <li key={k.id || idx}>
                  <div>
                    <strong>{k.title}</strong>
                    <p>{k.content.slice(0, 120)}{k.content.length > 120 ? '…' : ''}</p>
                    {k.source && <p className="muted">Source: {k.source}</p>}
                  </div>
                  <button type="button" onClick={() => removeKnowledgeEntry(idx)} className="remove-btn">
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No knowledge entries.</p>
          )}
        </div>

        <div className="card">
          <h3>Assistant Configuration</h3>
          <p className="hint">
            Configure execution parameters and metadata for this assistant.
            These are stored in the assistant definition's metadata.
          </p>
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {Object.entries(metadataConfig).length === 0 ? (
              <p className="muted">No metadata configured.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(metadataConfig).filter(([k]) => !['category', 'catalog', 'source'].includes(k.toLowerCase())).map(([k, v]) => (
                  <div key={k} className="input-row">
                    <label style={{ width: 160 }}>{CONFIG_LABEL_MAP[k] || humanizeKey(k)}</label>
                    <input type="text" value={String(v ?? '')} onChange={(e) => setMetadataConfig((prev) => ({ ...prev, [k]: e.target.value }))} />
                    <button className="remove-btn" onClick={() => { const n = { ...metadataConfig }; delete n[k]; setMetadataConfig(n); }}>&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="input-row">
            <input
              type="text"
              placeholder="Metadata key"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const key = (e.target as HTMLInputElement).value.trim();
                  if (key) {
                    setMetadataConfig({ ...metadataConfig, [key]: '' });
                    e.currentTarget.value = '';
                  }
                }
              }}
            />
          </div>
          <button type="button" onClick={() => {
            const newMeta = { ...metadataConfig };
            const maxIters = Number(newMeta.maxIterations) || 8;
            newMeta.maxIterations = maxIters;
            setMetadataConfig(newMeta);
          }} className="secondary">
            Set maxIterations
          </button>
          <div className="button-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={saveConfiguration} disabled={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
          {saveError && <div className="error-banner">{saveError}</div>}
        </div>
      </div>
    </div>
  );
};