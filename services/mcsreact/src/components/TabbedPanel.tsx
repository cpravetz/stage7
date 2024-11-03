import React, { useState } from 'react';
import ConversationHistory from './ConversationHistory';
import './TabbedPanel.css';

interface WorkProduct {
  type: 'Interim' | 'Final';
  name: string;
  url: string;
}

interface Props {
  conversationHistory: string[];
  workProducts: WorkProduct[];
}

const TabbedPanel: React.FC<Props> = ({ conversationHistory, workProducts }) => {
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
      </div>
    </div>
  );
};

export default TabbedPanel;