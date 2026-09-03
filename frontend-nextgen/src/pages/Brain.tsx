import { useEffect, useState } from 'react';
import { fetchJSON, postJSON } from '../utils/api';

const Brain = () => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  const [cacheStats, setCacheStats] = useState<{ hits: number; misses: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJSON<{ models: Array<{ id: string; provider: string }> }>('/api/brain/models')
      .then((data) => {
        const raw = data.models || [];
        const filtered = raw.filter((m: any) => !m.id.startsWith('~'));
        const list = filtered.map((m) => {
          const provider = m.provider === 'openrouter' || m.provider === 'openwebui'
            ? m.provider
            : (m.id.split('/')[0] || m.provider || 'unknown');
          return { id: m.id, name: m.id, provider };
        });
        setModels(list);
      })
      .catch(() => {});
    fetchJSON<{ hits: number; misses: number }>('/api/brain/cache/stats')
      .then(setCacheStats)
      .catch(() => {});
  }, []);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = await postJSON<{ content: string; model: string; cached: boolean }>('/api/brain/complete', {
        prompt,
        options: model ? { model } : {},
      });
      setResult(data.content || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Brain / LLM Layer</h1>
      <div className="grid two-col">
        <div className="card">
          <h3>Completion</h3>
          <form onSubmit={handleComplete} className="form">
            <textarea
              placeholder="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
            />
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Auto-select (system optimized)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
              ))}
            </select>
            <p className="hint">The system auto-selects the best model based on task intent. Select a model above to override.</p>
            <button type="submit" disabled={loading}>{loading ? 'Running...' : 'Complete'}</button>
          </form>
          {result && <pre className="result">{result}</pre>}
        </div>
        <div className="card">
          <h3>Cache Stats</h3>
          {cacheStats ? (
            <div className="meta-grid">
              <div><strong>Hits:</strong> {cacheStats.hits}</div>
              <div><strong>Misses:</strong> {cacheStats.misses}</div>
            </div>
          ) : (
            <p>No cache stats available.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Brain;
