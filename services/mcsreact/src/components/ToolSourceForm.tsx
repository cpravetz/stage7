import React, { useState } from 'react';
import {
    Dialog, 
    DialogTitle, 
    DialogContent, 
    DialogActions, 
    Button, 
    TextField, 
    FormControl, 
    InputLabel, 
    Select, 
    MenuItem 
} from '@mui/material/index.js';

interface ToolSourceFormProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (source: { id: string; type: 'openapi' | 'git' | 'marketplace'; url: string }) => void;
}

const ToolSourceForm: React.FC<ToolSourceFormProps> = ({ open, onClose, onSubmit }) => {
    const [id, setId] = useState('');
    const [type, setType] = useState<'openapi' | 'git' | 'marketplace'>('openapi');
    const [url, setUrl] = useState('');

    const handleSubmit = () => {
        onSubmit({ id, type, url });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add New Tool Source</DialogTitle>
            <DialogContent dividers>
                <TextField
                    autoFocus
                    margin="dense"
                    label="Source ID"
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                />
                <FormControl fullWidth margin="dense">
                    <InputLabel>Source Type</InputLabel>
                    <Select
                        value={type}
                        onChange={(e) => setType(e.target.value as 'openapi' | 'git' | 'marketplace')}
                        label="Source Type"
                    >
                        <MenuItem value="openapi">OpenAPI</MenuItem>
                        <MenuItem value="git">Git</MenuItem>
                        <MenuItem value="marketplace">Marketplace</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    margin="dense"
                    label="Source URL"
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained">Add</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ToolSourceForm;
