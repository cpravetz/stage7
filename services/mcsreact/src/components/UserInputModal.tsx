import React, { useState } from 'react';
import axios from 'axios';
import './UserInputModal.css';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export type AnswerType = 'text' | 'number' | 'boolean' | 'multipleChoice';

interface UserInputModalProps {
    requestId: string;
    question: string;
    choices?: string[];
    answerType: AnswerType;
    onSubmit: (requestId: string, response: any) => void;
    onClose: () => void;
}

const UserInputModal: React.FC<UserInputModalProps> = ({ requestId, question, choices, answerType, onSubmit, onClose }) => {
    const [response, setResponse] = useState<string | number | boolean>('');

    const handleSubmit = async () => {
        try {
            await onSubmit(requestId, response);
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
        <div className="modal user-input-modal">
            <div className="modal-content">
                <h2>User Input Required</h2>
                <p className="modal-question">{question}</p>
                <div className="modal-input">{renderInput()}</div>
                <div className="modal-actions">
                    <button className="modal-submit" onClick={handleSubmit}>Submit</button>
                    <button className="modal-cancel" onClick={onClose}>Cancel</button>
                </div>
            </div>
            <div className="modal-backdrop" onClick={onClose}></div>
        </div>
    );
};

export default UserInputModal;