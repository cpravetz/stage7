import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  LinearProgress,
  Alert,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  AttachFile as AttachFileIcon,
  Description as FileIcon
} from '@mui/icons-material';
import axios from 'axios'; // Keep axios for isAxiosError checks if needed, or remove if SecurityClient handles all error types.
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

interface MissionFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  description?: string;
}

interface FileUploadProps {
  missionId: string;
  onFilesChanged?: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ missionId, onFilesChanged }) => {
  const [files, setFiles] = useState<MissionFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [descriptionDialog, setDescriptionDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  const apiClient = securityClient.getApi();

  // Load existing files
  const loadFiles = useCallback(async () => {
    try {
      const response = await apiClient.get(`/missions/${missionId}/files`);
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      setError('Failed to load files');
    }
  }, [missionId, apiClient]);

  React.useEffect(() => {
    if (missionId) {
      loadFiles();
    }
  }, [missionId, loadFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter(file => {
      // Basic validation
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setError(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setDescriptionDialog(true);
    }
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      pendingFiles.forEach(file => {
        formData.append('files', file);
      });
      
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      const response = await apiClient.post(`/missions/${missionId}/files`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      setSuccess(`Successfully uploaded ${response.data.uploadedFiles.length} file(s)`);
      await loadFiles();
      onFilesChanged?.();
      
      // Reset state
      setPendingFiles([]);
      setDescription('');
      setDescriptionDialog(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      setError(error.response?.data?.error || 'Failed to upload files');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (file: MissionFile) => {
    try {
      const response = await apiClient.get(`/missions/${missionId}/files/${file.id}/download`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      setError('Failed to download file');
    }
  };

  const handleDelete = async (file: MissionFile) => {
    if (!window.confirm(`Are you sure you want to delete "${file.originalName}"?`)) {
      return;
    }

    try {
      await apiClient.delete(`/missions/${missionId}/files/${file.id}`);
      setSuccess(`File "${file.originalName}" deleted successfully`);
      await loadFiles();
      onFilesChanged?.();
    } catch (error) {
      console.error('Delete error:', error);
      setError('Failed to delete file');
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
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileSelect(droppedFiles);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFileSelect(selectedFiles);
    }
  };

  return (
    <Box>
      {/* Upload Area */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          mb: 2,
          border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
          backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Box textAlign="center">
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Drop files here or click to select
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Maximum file size: 50MB. Supported formats: documents, images, archives
          </Typography>
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />
      </Paper>

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Uploading... {uploadProgress}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Files List */}
      <Typography variant="h6" gutterBottom>
        Attached Files ({files.length})
      </Typography>
      
      {files.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          No files attached to this mission
        </Typography>
      ) : (
        <List>
          {files.map((file) => (
            <ListItem key={file.id} divider>
              <FileIcon sx={{ mr: 2, color: 'text.secondary' }} />
              <ListItemText
                primary={file.originalName}
                secondary={
                  <Box>
                    <Typography variant="caption" display="block">
                      {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
                    </Typography>
                    {file.description && (
                      <Chip label={file.description} size="small" sx={{ mt: 0.5 }} />
                    )}
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <IconButton onClick={() => handleDownload(file)} size="small">
                  <DownloadIcon />
                </IconButton>
                <IconButton onClick={() => handleDelete(file)} size="small" color="error">
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      {/* Description Dialog */}
      <Dialog open={descriptionDialog} onClose={() => setDescriptionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <AttachFileIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Upload Files
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Files to upload: {pendingFiles.map(f => f.name).join(', ')}
          </Typography>
          <TextField
            fullWidth
            label="Description (optional)"
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for these files..."
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDescriptionDialog(false)}>Cancel</Button>
          <Button onClick={handleUpload} variant="contained" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileUpload;
