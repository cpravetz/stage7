import { useState } from 'react';

interface WatchControlsProps {
  skillId: string;
  defaultQuery?: string;
}

const WatchControls = ({ skillId, defaultQuery = '' }: WatchControlsProps) => {
  const [name, setName] = useState(`Watch for ${skillId}`);
  const [cadence, setCadence] = useState('daily');
  const [companiesText, setCompaniesText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createWatch(runNow: boolean) {
    setCreating(true);
    setMessage(null);
    const companies = companiesText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    try {
      const body = {
        ownerUserId: 'default',
        name,
        query: defaultQuery || '',
        companies: companies.length ? companies : undefined,
        cadence,
        enabled,
        autoApply: false,
      };

      const res = await fetch('/api/tool-executor/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Create watch failed (${res.status})`);
      const data = await res.json();
      setMessage('Watch created');

      if (runNow) {
        try {
          await fetch(`/api/temporal/watches/${encodeURIComponent(data.id)}/run`, { method: 'POST' });
         } catch {
          // best-effort
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create watch');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e6eef8' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Watch name" style={{ flex: 1 }} />
        <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="hourly">Hourly</option>
          <option value="weekly">Weekly</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <textarea value={companiesText} onChange={(e) => setCompaniesText(e.target.value)} placeholder="Companies (one per line) — leave blank for broad search" style={{ width: '100%', minHeight: 60 }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={() => createWatch(false)} disabled={creating}>{creating ? 'Creating…' : 'Create Watch'}</button>
        <button onClick={() => createWatch(true)} disabled={creating}>{creating ? 'Creating…' : 'Create & Run Now'}</button>
        {message && <div style={{ marginLeft: 8 }}>{message}</div>}
      </div>
    </div>
  );
}

export default WatchControls;
