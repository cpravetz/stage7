import React, { useState } from 'react';
import ConversationHistory from './ConversationHistory';
import { AgentStatistics } from '@cktmcs/shared';
import { NetworkGraph } from './NetworkGraph';
import './TabbedPanel.css';

interface WorkProduct {
  type: 'Interim' | 'Final';
  name: string;
  url: string;
}

interface TabbedPanelProps {
  conversationHistory: string[];
  workProducts: WorkProduct[];
  agentStatistics: Map<string, Array<AgentStatistics>>;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({ 
  conversationHistory, 
  workProducts,
  agentStatistics 
}) => {
  const [activeTab, setActiveTab] = useState('conversation');

  return (
    <div className="tabbed-panel">
      <div className="tab-buttons">
        <button
          className={activeTab === 'conversation' ? 'active' : ''}
          onClick={() => setActiveTab('conversation')}
        >
          Conversation
        </button>
        <button
          className={activeTab === 'results' ? 'active' : ''}
          onClick={() => setActiveTab('results')}
        >
          Results
        </button>
        <button 
          className={activeTab === 'network' ? 'active' : ''} 
          onClick={() => setActiveTab('network')}
        >
          Agent Network
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'conversation' && (
          <ConversationHistory history={conversationHistory} />
        )}
        {activeTab === 'results' && (
          <div className="work-products">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Work Product</th>
                </tr>
              </thead>
              <tbody>
                {workProducts.map((product, index) => (
                  <tr key={index}>
                    <td>{product.type}</td>
                    <td>
                      <a href={product.url} target="_blank" rel="noopener noreferrer">
                        {product.name}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'network' && (
          <NetworkGraph agentStatistics={agentStatistics} />
        )}
      </div>
    </div>
  );
};

export default TabbedPanel;