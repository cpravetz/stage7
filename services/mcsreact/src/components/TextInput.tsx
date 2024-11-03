import React, { useState } from 'react';
import './TextInput.css';

interface Props {
  onSend: (message: string) => void;
}

const TextInput: React.FC<Props> = ({ onSend }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  return (
    <div className="text-input">
      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message..."
          rows={3}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default TextInput;