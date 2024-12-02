import React, { useEffect, useRef } from 'react';
import './ConversationHistory.css';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = ({ history }) => {
  const historyListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (historyListRef.current) {
      historyListRef.current.scrollTop = historyListRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div className="conversation-history">
      <h3>Conversation History</h3>
      <div className="history-list" ref={historyListRef}>
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