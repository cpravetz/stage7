import { useEffect, useState } from 'react';
import { useEntityStore } from '../stores/entityStore';

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
  type: 'delegation' | 'collaboration' | 'tool';
}

const Canvas = () => {
  const { entities, fetchEntities } = useEntityStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

    const newNodes: Node[] = entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length - Math.PI / 2;
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    const newEdges: Edge[] = [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        if (Math.random() > 0.6) {
          newEdges.push({
            from: entities[i].id,
            to: entities[j].id,
            type: Math.random() > 0.5 ? 'collaboration' : 'tool',
          });
        }
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [entities]);

  const selectedEntity = entities.find((e) => e.id === selected);

  return (
    <div className="page canvas-page">
      <h1>Multi-Agent Canvas</h1>
      <div className="canvas-layout">
        <div className="canvas-container">
          <svg className="canvas-svg" viewBox="0 0 800 500">
            {edges.map((edge, i) => {
              const from = nodes.find((n) => n.id === edge.from);
              const to = nodes.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={edge.type === 'delegation' ? '#f59e0b' : '#6366f1'}
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />
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
        </div>
        <div className="canvas-sidebar">
          {selectedEntity ? (
            <div className="card">
              <h3>{selectedEntity.name}</h3>
              <span className={`badge ${selectedEntity.status}`}>{selectedEntity.status}</span>
              <p>{selectedEntity.description}</p>
              <div className="meta-grid">
                <div><strong>Type:</strong> {selectedEntity.type}</div>
                <div><strong>Model:</strong> {selectedEntity.model}</div>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3>Select a Node</h3>
              <p>Click on any node in the canvas to view entity details and live feed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
