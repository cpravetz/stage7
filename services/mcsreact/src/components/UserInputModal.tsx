import React, { useState } from 'react';
import axios from 'axios';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });



interface UserInputModalProps {
    requestId: string;
    question: string;
    choices?: string[];
    answerType: 'text' | 'number' | 'boolean' | 'multipleChoice';
    onClose: () => void;
}

const UserInputModal: React.FC<UserInputModalProps> = ({ requestId, question, choices, answerType, onClose }) => {
    const [response, setResponse] = useState<string | number | boolean>('');

    const handleSubmit = async () => {
        try {
            await api.post('http://localhost:5020/submitUserInput', { requestId, response });
            onClose();
        } catch (error) { 
            console.error('Error submitting user input:', error instanceof Error ? error.message : error);
        }
    };

    const renderInput = () => {
        switch (answerType) {
            case 'text':
                return <input type="text" value={response as string} onChange={(e) => setResponse(e.target.value)} />;
            case 'number':
                return <input type="number" value={response as number} onChange={(e) => setResponse(Number(e.target.value))} />;
            case 'boolean':
                return (
                    <div>
                        <button onClick={() => setResponse(true)}>Yes</button>
                        <button onClick={() => setResponse(false)}>No</button>
                    </div>
                );
            case 'multipleChoice':
                return (
                    <div>
                        {choices?.map((choice) => (
                            <button key={choice} onClick={() => setResponse(choice)}>{choice}</button>
                        ))}
                    </div>
                );
        }
    };

    return (
        <div className="modal">
            <h2>{question}</h2>
            {renderInput()}
            <button onClick={handleSubmit}>Submit</button>
        </div>
    );
};

export default UserInputModal;