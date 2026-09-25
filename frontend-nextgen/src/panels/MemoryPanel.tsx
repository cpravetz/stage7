interface MemoryPanelProps {
  memoryContext: Record<string, unknown>;
  setMemoryContext: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}

export const MemoryPanel = ({ memoryContext, setMemoryContext }: MemoryPanelProps) => {
  return (
    <div className="card">
      <h3>Memory Context</h3>
      {Object.keys(memoryContext).length === 0 ? (
        <p className="muted">No memory persisted.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(memoryContext).map(([k, v]) => (
            <div key={k} className="input-row">
              <label style={{ width: 160 }}>{k}</label>
              <div style={{ flex: 1 }}>{String(typeof v === 'object' ? JSON.stringify(v) : v)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="button-row">
        <button onClick={() => setMemoryContext({ ...memoryContext, lastInteraction: new Date().toISOString() })}>
          Update Timestamp
        </button>
        <button className="secondary" onClick={() => setMemoryContext({})}>
          Clear Memory
        </button>
      </div>
    </div>
  );
};