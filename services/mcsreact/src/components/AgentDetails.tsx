import React from 'react';

interface Agent {
  id: string;
  name: string;
  status: string;
  currentTask: string;
}

interface AgentDetailsProps {
  agents: Agent[];
}

const AgentDetails: React.FC<AgentDetailsProps> = ({ agents }) => {
  return (
    <div className="agent-details">
      <h2>Agent Details</h2>
      {agents.length === 0 ? (
        <p>No agents currently active.</p>
      ) : (
        <ul>
          {agents.map((agent) => (
            <li key={agent.id} className={`agent-item status-${agent.status.toLowerCase()}`}>
              <h3>{agent.name}</h3>
              <p>Status: {agent.status}</p>
              <p>Current Task: {agent.currentTask || 'None'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgentDetails;