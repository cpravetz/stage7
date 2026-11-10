import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { putJSON, fetchJSON, deleteResource } from '../utils/api';

interface Secret {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface DecryptedSecret {
  plaintext: string;
}

const Vault = () => {
  const [searchParams] = useSearchParams();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [name, setName] = useState('');
  const [plaintext, setPlaintext] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const requestedName = searchParams.get('name');

  const loadSecrets = async () => {
    try {
      const data = await fetchJSON<{ secrets: Secret[] }>('/api/vault/secrets');
      setSecrets(data.secrets);
    } catch {
      setError('Failed to load secrets');
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  useEffect(() => {
    if (requestedName) setName(requestedName);
  }, [requestedName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await putJSON(`/api/vault/secrets/name/${encodeURIComponent(name)}`, { plaintext, tenantId: 'system' });
      setName('');
      setPlaintext('');
      await loadSecrets();
    } catch {
      setError('Failed to create secret');
    } finally {
      setLoading(false);
    }
  };

  const toggleShow = async (secret: Secret) => {
    if (revealed[secret.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[secret.id];
        return next;
      });
      return;
    }
    try {
      const data = await fetchJSON<DecryptedSecret>(`/api/vault/secrets/${secret.id}/decrypt`);
      setRevealed((prev) => ({ ...prev, [secret.id]: data.plaintext }));
    } catch {
      setError('Failed to decrypt secret');
    }
  };

  const handleEdit = async (secret: Secret) => {
    setError(null);
    setName(secret.name);
    try {
      const data = await fetchJSON<DecryptedSecret>(`/api/vault/secrets/${secret.id}/decrypt`);
      setPlaintext(data.plaintext);
    } catch {
      setPlaintext('');
      setError('Failed to load secret value for editing');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this secret? This cannot be undone.')) return;
    try {
      await deleteResource(`/api/vault/secrets/${id}`);
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadSecrets();
    } catch {
      setError('Failed to delete secret');
    }
  };

  const filteredSecrets = secrets.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page vault-page">
      <h1>Vault / Secrets Management</h1>
      <p className="hint">
        Secrets are encrypted at rest using AES-256-GCM envelope encryption and can only
        be shown on demand.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="vault-fixed">
        <div className="card vault-form-card">
          <h3>Create or Update Secret</h3>
          <form onSubmit={handleSave} className="form vault-form">
            <div className="vault-form-row">
              <input
                type="text"
                placeholder="Secret name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Saving…' : 'Save Secret'}
              </button>
            </div>
            <textarea
              placeholder="Secret value"
              value={plaintext}
              onChange={(e) => setPlaintext(e.target.value)}
              required
              rows={3}
            />
          </form>
        </div>

        <div className="card vault-search-card">
          <input
            type="search"
            className="vault-search"
            placeholder="Search secrets by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card vault-table-card">
        <h3>Stored Secrets</h3>
        <div className="vault-table-scroll table-container">
          {filteredSecrets.length === 0 ? (
            <p className="muted">{secrets.length === 0 ? 'No secrets stored' : 'No secrets match your search'}</p>
          ) : (
            <table className="data-table vault-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSecrets.map((secret) => (
                  <tr key={secret.id}>
                    <td>
                      <div className="vault-name-cell">
                        <strong>{secret.name}</strong>
                        {revealed[secret.id] !== undefined && (
                          <pre className="result vault-secret-value">{revealed[secret.id]}</pre>
                        )}
                      </div>
                    </td>
                    <td>{new Date(secret.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="vault-actions">
                        <button type="button" className="secondary small" onClick={() => toggleShow(secret)}>
                          {revealed[secret.id] !== undefined ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" className="secondary small" onClick={() => handleEdit(secret)}>
                          Edit
                        </button>
                        <button type="button" className="danger small" onClick={() => handleDelete(secret.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Vault;
