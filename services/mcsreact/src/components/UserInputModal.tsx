import React, { useState, useRef } from 'react';
import './UserInputModal.css';
import { SecurityClient } from '../SecurityClient';
import { API_BASE_URL } from '../config';

export type AnswerType = 'text' | 'number' | 'boolean' | 'multipleChoice' | 'file';

interface UserInputModalProps {
    requestId: string;
    question: any;
    choices?: string[];
    answerType: AnswerType;
    onSubmit: (requestId: string, response: any) => void;
    onClose: () => void;
    darkMode?: boolean;
}

const UserInputModal: React.FC<UserInputModalProps> = ({ requestId, question, choices, answerType, onSubmit, onClose, darkMode }) => {
    const [response, setResponse] = useState<string | number | boolean>('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            if (answerType === 'file') {
                if (!selectedFile) {
                    alert('Please select a file');
                    setIsSubmitting(false);
                    return;
                }

                // Create FormData for file upload
                const formData = new FormData();
                formData.append('requestId', requestId);
                formData.append('files', selectedFile);

                // Use SecurityClient's axios instance for authenticated request
                const securityClient = SecurityClient.getInstance(API_BASE_URL);
                const apiClient = securityClient.getApi();

                // Submit file upload
                const response = await apiClient.post('/submitUserInput', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.status !== 200) {
                    throw new Error('Failed to upload file');
                }

                onClose();
            } else {
                await onSubmit(requestId, response);
                onClose();
            }
        } catch (error) {
            console.error('Error submitting user input:', error instanceof Error ? error.message : error);
        } finally {
            setIsSubmitting(false);
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
            // Removed e.dataTransfer.clearData() to prevent NoModificationAllowedError
            // try {
            //     e.dataTransfer.clearData();
            // } catch (error) {
            //     console.warn('Failed to clear dataTransfer data:', error);
            // }
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
                    <div className="file-upload-container">
                        <div
                            className={`file-drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="upload-icon">📁</div>
                            <div className="upload-text">
                                <div className="upload-title">
                                    {selectedFile ? 'File Selected' : 'Drop file here or click to select'}
                                </div>
                                <div className="upload-subtitle">
                                    {selectedFile ? selectedFile.name : 'Supports documents, images, and archives'}
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                style={{ display: 'none' }}
                                onChange={handleFileInputChange}
                                accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.json,.xml,.yaml,.yml,.png,.jpg,.jpeg,.gif,.svg,.bmp,.zip,.tar,.gz,.7z"
                            />
                        </div>
                        {selectedFile && (
                            <div className="file-info">
                                <span className="file-name">{selectedFile.name}</span>
                                <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                <button
                                    type="button"
                                    className="remove-file"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedFile(null);
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className={`modal user-input-modal${darkMode ? ' dark' : ''}`}>
            <div className="modal-content">
                <h2>User Input Required</h2>
                <p className="modal-question">{question && typeof question === 'object' && 'value' in question ? question.value : question}</p>
                <div className="modal-input">{renderInput()}</div>
                <div className="modal-actions">
                    <button className="modal-submit" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                    <button className="modal-cancel" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                </div>
            </div>
            <div className="modal-backdrop" onClick={onClose}></div>
        </div>
    );
};

export default UserInputModal;
