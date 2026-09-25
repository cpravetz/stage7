import { useEffect, useState } from 'react';
import { useEntityStore, type Entity } from '../stores/entityStore';

interface Node {
  id: string;
  name: string;
  type: 'assistant' | 'agent';
  status: string;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
  sharedTools: string[];
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source?: string;
  scope?: string;
  origin?: string;
}

const toolNames = (entity: Entity): string[] =>
  (entity.tools || [])
    .map((t) => (typeof t === 'string' ? t : t.name))
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

/**
 * An edge is drawn only where two assistants genuinely share a tool binding.
 * The Canvas is a read-only view over real assistant state, so it must not
 * invent relationships that do not exist.
 */
const buildEdges = (entities: Entity[]): Edge[] => {
  const byTool = new Map<string, string[]>();
  for (const entity of entities) {
    for (const tool of toolNames(entity)) {
      const holders = byTool.get(tool) || [];
      holders.push(entity.id);
      byTool.set(tool, holders);
    }
  }

  const edges = new Map<string, Set<string>>();
  for (const [tool, holders] of byTool) {
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const [a, b] = holders[i] < holders[j] ? [holders[i], holders[j]] : [holders[j], holders[i]];
        const key = `${a}::${b}`;
        const set = edges.get(key) || new Set<string>();
        set.add(tool);
        edges.set(key, set);
      }
    }
  }

  return Array.from(edges.entries()).map(([key, tools]) => {
    const [from, to] = key.split('::');
    return { from, to, sharedTools: Array.from(tools) };
  });
};

const Canvas = () => {
  const { entities, fetchEntities } = useEntityStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[] | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    if (entities.length === 0) return;
    const width = 800;
    const height = 500;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 3;

    setNodes(entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length - Math.PI / 2;
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    }));
    setEdges(buildEdges(entities));
  }, [entities]);

  // Load exactly the knowledge this assistant is given at execution time.
  useEffect(() => {
    if (!selected) {
      setKnowledge(null);
      setKnowledgeError(null);
      return;
    }
    let cancelled = false;
    setKnowledge(null);
    setKnowledgeError(null);
    fetch(`/api/workers/assistants/${encodeURIComponent(selected)}/knowledge`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setKnowledge(data.knowledge || []);
      })
      .catch((err) => {
        if (!cancelled) setKnowledgeError(err instanceof Error ? err.message : 'Failed to load knowledge');
      });
    return () => { cancelled = true; };
  }, [selected]);

  const selectedEntity = entities.find((e) => e.id === selected);

  return (
    <div className="page canvas-page">
      <h1>Multi-Agent Canvas</h1>
      <div className="canvas-layout">
        <div className="canvas-container">
          <svg className="canvas-svg" viewBox="0 0 800 500">
            {edges.map((edge) => {
              const from = nodes.find((n) => n.id === edge.from);
              const to = nodes.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              const isConnected = selected === edge.from || selected === edge.to;
              return (
                <line
                  key={`${edge.from}::${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isConnected ? '#fbbf24' : '#4b5563'}
                  strokeWidth={isConnected ? 3 : 1}
                  opacity={selected && !isConnected ? 0.2 : 0.7}
                >
                  <title>{`${edge.sharedTools.length} shared tool(s): ${edge.sharedTools.join(', ')}`}</title>
                </line>
              );
            })}
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="20" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="#6366f1" />
              </marker>
            </defs>
            {nodes.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setSelected(node.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r="24"
                  fill={node.type === 'assistant' ? '#1e40af' : '#065f46'}
                  stroke={selected === node.id ? '#fbbf24' : '#374151'}
                  strokeWidth={selected === node.id ? 4 : 2}
                />
                <text textAnchor="middle" dy="5" fill="white" fontSize="10" fontWeight="bold">
                  {node.name.slice(0, 8)}
                </text>
              </g>
            ))}
          </svg>
          <p className="canvas-legend">
            {edges.length} connection{edges.length === 1 ? '' : 's'} — each line joins two assistants
            that share at least one tool binding. Hover a line to see which.
          </p>
        </div>
        <div className="canvas-sidebar">
          {selectedEntity ? (
            <div className="card">
              <h3>{selectedEntity.name}</h3>
              <span className={`badge ${selectedEntity.status}`}>{selectedEntity.status}</span>
              <p>{selectedEntity.description}</p>
              <div className="meta-grid">
                <div><strong>Type:</strong> {selectedEntity.type}</div>
                <div><strong>Tools:</strong> {toolNames(selectedEntity).length}</div>
              </div>

              <h4>Knowledge supplied to this assistant</h4>
              {knowledgeError && <p className="error-text">Failed to load knowledge: {knowledgeError}</p>}
              {!knowledgeError && knowledge === null && <p>Loading knowledge…</p>}
              {knowledge && knowledge.length === 0 && (
                <p>No knowledge recorded. This assistant runs without a knowledge block.</p>
              )}
              {knowledge && knowledge.length > 0 && (
                <ul className="knowledge-list">
                  {knowledge.map((entry) => (
                    <li key={entry.id}>
                      <div className="knowledge-header">
                        <strong>{entry.title}</strong>
                        {entry.scope && <span className="badge">{entry.scope}</span>}
                        {entry.origin && <span className="badge">{entry.origin}</span>}
                      </div>
                      {entry.source && <div className="knowledge-source">source: {entry.source}</div>}
                      <details>
                        <summary>{entry.content.length} characters</summary>
                        <pre className="knowledge-content">{entry.content}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="card">
              <h3>Select a Node</h3>
              <p>
                Click any assistant to see its details and the knowledge that is
                injected into its system prompt.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
