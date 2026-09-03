import { useState, useEffect } from 'react';
import { postJSON, fetchJSON, deleteResource } from '../utils/api';

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
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [name, setName] = useState('');
  const [plaintext, setPlaintext] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; plaintext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSecrets = async () => {
    try {
      const data = await fetchJSON<{ secrets: Secret[] }>('/api/vault/secrets');
      setSecrets(data.secrets);
    } catch (err) {
      setError('Failed to load secrets');
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await postJSON('/api/vault/secrets', { name, plaintext, tenantId });
      setName('');
      setPlaintext('');
      setTenantId('');
      await loadSecrets();
    } catch (err) {
      setError('Failed to create secret');
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async (id: string) => {
    try {
      const data = await fetchJSON<DecryptedSecret>(`/api/vault/secrets/${id}/decrypt`);
      setRevealedSecret({ id, plaintext: data.plaintext });
    } catch (err) {
      setError('Failed to decrypt secret');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteResource(`/api/vault/secrets/${id}`);
      if (revealedSecret?.id === id) {
        setRevealedSecret(null);
      }
      await loadSecrets();
    } catch (err) {
      setError('Failed to delete secret');
    }
  };

  return (
    <div className="page">
      <h1>Vault / Secrets Management</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        The Vault provides secure secrets management using AES-256-GCM envelope encryption.
        Create, store, and manage secrets used by agents, assistants, and tools.
        Secrets are encrypted at rest and can only be revealed on demand.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid two-col">
        <div className="card">
          <h3>Create Secret</h3>
          <form onSubmit={handleCreate} className="form">
            <input
              type="text"
              placeholder="Secret name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Tenant ID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
            />
            <textarea
              placeholder="Secret value"
              value={plaintext}
              onChange={(e) => setPlaintext(e.target.value)}
              required
              rows={3}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Secret'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Registered Secrets</h3>
          {secrets.length === 0 ? (
            <p style={{ color: '#999' }}>No secrets stored</p>
          ) : (
            <ul className="secret-list">
              {secrets.map((secret) => (
                <li key={secret.id} className="secret-item">
                  <div className="secret-info">
                    <strong>{secret.name}</strong>
                    <span className="secret-date">
                      Created: {new Date(secret.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="secret-actions">
                    <button onClick={() => handleReveal(secret.id)} className="btn-reveal">
                      Reveal
                    </button>
                    <button onClick={() => handleDelete(secret.id)} className="btn-delete">
                      Delete
                    </button>
                  </div>
                  {revealedSecret?.id === secret.id && (
                    <div className="secret-revealed">
                      <strong>Decrypted value:</strong>
                      <pre className="result">{revealedSecret.plaintext}</pre>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Vault;
