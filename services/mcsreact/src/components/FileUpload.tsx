import React from 'react';
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
import { SecurityClient } from '../SecurityClient';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';

interface MissionFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  description?: string;
  preview?: string;
  isDeliverable?: boolean;
  stepId?: string;
}

interface FileUploadProps {
  missionId: string;
  sharedFiles: MissionFile[];
  onFilesChanged: () => void;
  descriptionDialog: boolean;
  setDescriptionDialog: React.Dispatch<React.SetStateAction<boolean>>;
  pendingFiles: File[];
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  missionId,
  sharedFiles,
  onFilesChanged,
  descriptionDialog,
  setDescriptionDialog,
  pendingFiles,
  setPendingFiles,
  description,
  setDescription
}) => {
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const { isAuthenticated, isInitializing } = useAuth();
  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  const apiClient = securityClient.getApi();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = React.useCallback((selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter(file => {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setError(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setError(null);
      setSuccess(null);
      setDescriptionDialog(true);
    }
  }, [setPendingFiles, setDescriptionDialog]);

  const handleCancelUpload = React.useCallback(() => {
    setPendingFiles([]);
    setDescription('');
    setDescriptionDialog(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [setPendingFiles, setDescription, setDescriptionDialog]);

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    if (!isAuthenticated) {
      setError('You must be authenticated to upload files');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      pendingFiles.forEach(file => formData.append('files', file));
      if (description.trim()) formData.append('description', description.trim());

      const response = await apiClient.post(`/missions/${missionId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      setSuccess(`Successfully uploaded ${response.data.uploadedFiles.length} file(s)`);
      onFilesChanged();
      setPendingFiles([]);
      setDescription('');
      setDescriptionDialog(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error('Upload error', err);
      if (err?.response?.data?.error) setError(err.response.data.error);
      else setError('Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (file: MissionFile) => {
    try {
      const response = await apiClient.get(`/missions/${missionId}/files/${file.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error', err);
      setError('Failed to download file');
    }
  };

  const handleDelete = async (file: MissionFile) => {
    if (!window.confirm(`Are you sure you want to delete \"${file.originalName}\"?`)) return;
    try {
      await apiClient.delete(`/missions/${missionId}/files/${file.id}`);
      setSuccess(`File \"${file.originalName}\" deleted successfully`);
      onFilesChanged();
    } catch (err) {
      console.error('Delete error', err);
      setError('Failed to delete file');
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const dropped = Array.from(e.dataTransfer.files); handleFileSelect(dropped); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) handleFileSelect(Array.from(e.target.files)); e.currentTarget.value = ''; };

  return (
    <Box>
      {!isAuthenticated && !isInitializing && (
        <Alert severity="warning" sx={{ mb: 2 }}>Authentication required to upload files</Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <Box textAlign="center">
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6" gutterBottom>Drop files here or click to select</Typography>
          <Typography variant="body2" color="text.secondary">Maximum file size: 50MB</Typography>
        </Box>

        <input id="file-upload-input" ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInputChange} disabled={!isAuthenticated} />
        <Box sx={{ textAlign: 'center', mt: 1 }}>
          <label htmlFor="file-upload-input">
            <Button component="span" variant="outlined" disabled={!isAuthenticated}>Select files</Button>
          </label>
        </Box>
      </Paper>

      {uploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>Uploading... {uploadProgress}%</Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Typography variant="h6" gutterBottom>Attached Files ({sharedFiles.length})</Typography>

      {sharedFiles.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No files attached to this mission</Typography>
      ) : (
        <List>
          {sharedFiles.map(file => (
            <ListItem key={file.id} divider alignItems="flex-start">
              <FileIcon sx={{ mr: 2, color: 'text.secondary' }} />
              <ListItemText
                primary={file.originalName}
                secondary={(
                  <Box>
                    <Typography variant="caption" display="block">{formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                      {file.isDeliverable && (
                        <Chip
                          label="System Deliverable"
                          size="small"
                          color="secondary"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                      {file.description && (
                        <Chip
                          label={file.description}
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                    {file.preview && (
                      <Paper variant="outlined" sx={{ padding: '8px', marginTop: '8px', maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        <Typography variant="body2">{file.preview}</Typography>
                      </Paper>
                    )}
                  </Box>
                )}
              />
              <ListItemSecondaryAction>
                <IconButton onClick={() => handleDownload(file)} size="small"><DownloadIcon /></IconButton>
                <IconButton onClick={() => handleDelete(file)} size="small" color="error"><DeleteIcon /></IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={descriptionDialog} onClose={handleCancelUpload} maxWidth="sm" fullWidth>
        <DialogTitle><AttachFileIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Upload Files</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>Files to upload: {pendingFiles.map(f => f.name).join(', ')}</Typography>
          <TextField fullWidth label="Description (optional)" multiline rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description for these files..." sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelUpload}>Cancel</Button>
          <Button onClick={handleUpload} variant="contained" disabled={uploading || !isAuthenticated}>{uploading ? 'Uploading...' : 'Upload'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default React.memo(FileUpload);
