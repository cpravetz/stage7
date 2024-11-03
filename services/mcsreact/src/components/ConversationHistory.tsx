import React from 'react';
import './ConversationHistory.css';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = ({ history }) => {
  return (
    <div className="conversation-history">
      <h3>Conversation History</h3>
      <div className="history-list">
        {history.map((message, index) => (
          <div key={index} className="history-item">
            {message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversationHistory;
