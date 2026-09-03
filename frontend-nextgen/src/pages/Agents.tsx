import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, postJSON, deleteResource } from '../utils/api';

const Agents = () => {
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description: string; type: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('worker');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agentsData = await fetchJSON<{ agents: Array<{ id: string; name: string; description: string; type: string; status: string }> }>('/api/agent-runtime/agents');
         setAgents(agentsData.agents || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    };
    loadAgents();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setError(null);
    try {
      const data = await postJSON<{ agent: { id: string; name: string; description: string; type: string; status: string } }>('/api/agent-runtime/agents', {
        id: id || `agent-${Date.now()}`,
        tenantId: 'tenant-1',
        name,
        description,
        type,
        systemPrompt: 'You are a helpful agent.',
        tools: [],
        metadata: {},
      });
      setAgents([...agents, data.agent]);
      setId('');
      setName('');
      setDescription('');
      setType('worker');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setRegistering(false);
    }
  };

  const handleDeregister = async (agentId: string) => {
    setError(null);
    try {
      await deleteResource(`/api/agent-runtime/agents/${agentId}`);
      setAgents(agents.filter((a) => a.id !== agentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deregister agent');
    }
  };

  return (
    <div className="page">
      <h1>Agents</h1>
      {error && <div className="error-banner">{error}</div>}
      <div className="grid two-col">
        <div className="card">
          <h3>Register Agent</h3>
          <form onSubmit={handleRegister} className="form">
            <input type="text" placeholder="ID (optional)" value={id} onChange={(e) => setId(e.target.value)} />
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="text" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="worker">worker</option>
              <option value="supervisor">supervisor</option>
              <option value="coordinator">coordinator</option>
            </select>
            <button type="submit" disabled={registering}>{registering ? 'Registering...' : 'Register'}</button>
          </form>
        </div>
        <div className="card">
          <h3>Agent Registry</h3>
          {loading ? <p>Loading...</p> : (
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td><Link to={`/entity/${a.id}`}>{a.name}</Link></td>
                      <td>{a.type}</td>
                      <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                      <td>
                        <Link to={`/entity/${a.id}`} className="link-button">Workspace</Link>
                        <button onClick={() => handleDeregister(a.id)}>Deregister</button>
                      </td>
                    </tr>
                  ))}
                  {agents.length === 0 && <tr><td colSpan={4}>No agents found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Agents;
