import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import './UserInputModal.css';

export type AnswerType = 'text' | 'number' | 'boolean' | 'multipleChoice' | 'file';

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
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async () => {
        try {
            if (answerType === 'file') {
                if (!selectedFile) {
                    alert('Please select a file');
                    return;
                }

                // Create FormData for file upload
                const formData = new FormData();
                formData.append('requestId', requestId);
                formData.append('files', selectedFile);

                // Get authentication token from localStorage
                const token = localStorage.getItem('authToken');
                const headers: HeadersInit = {};
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                // Submit file upload
                const response = await fetch('http://localhost:5020/submitUserInput', {
                    method: 'POST',
                    headers,
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Failed to upload file');
                }

                onClose();
            } else {
                await onSubmit(requestId, response);
                onClose();
            }
        } catch (error) {
            console.error('Error submitting user input:', error instanceof Error ? error.message : error);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setSelectedFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
            e.target.value = '';
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
            case 'file':
                return (
                    <div>
                        <label htmlFor="file-upload-input" style={{ display: 'block', cursor: 'pointer' }}>
                            <Paper
                                elevation={2}
                                sx={{
                                    p: 3,
                                    mb: 2,
                                    border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
                                    backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    textAlign: 'center',
                                }}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <Box>
                                    <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                    <Typography variant="h6" gutterBottom>
                                        Drop file here or click to select
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected'}
                                    </Typography>
                                </Box>
                                <input
                                    id="file-upload-input"
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    onChange={handleFileInputChange}
                                    accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.json,.xml,.yaml,.yml,.png,.jpg,.jpeg,.gif,.svg,.bmp,.zip,.tar,.gz,.7z"
                                />
                            </Paper>
                        </label>
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
