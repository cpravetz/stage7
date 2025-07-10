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
import axios from 'axios'; // Keep axios for isAxiosError checks if needed, or remove if SecurityClient handles all error types.
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';
import { useAuth } from '../context/AuthContext';

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
  // NEW PROPS FOR DIALOG STATE MANAGEMENT
  descriptionDialog: boolean;
  setDescriptionDialog: React.Dispatch<React.SetStateAction<boolean>>;
  pendingFiles: File[];
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  missionId,
  onFilesChanged,
  // Destructure new props
  descriptionDialog,
  setDescriptionDialog,
  pendingFiles,
  setPendingFiles,
  description,
  setDescription,
}) => {
  const [files, setFiles] = React.useState<MissionFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { isAuthenticated, isInitializing } = useAuth();
  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  const apiClient = securityClient.getApi();

  const loadFiles = React.useCallback(async () => {
    if (!isAuthenticated || isInitializing) {
      console.log('[FileUpload] Skipping file load - not authenticated or still initializing');
      return;
    }

    try {
      console.log('[FileUpload] Loading files for mission:', missionId);
      const response = await apiClient.get(`/missions/${missionId}/files`);
      console.log('[FileUpload] Files loaded successfully:', response.data);
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('[FileUpload] Error loading files:', error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error || error.message;
        setError(`Failed to load files (${status}): ${message}`);
      } else {
        setError('Failed to load files: Unknown error');
      }
    }
  }, [missionId, apiClient, isAuthenticated, isInitializing]);

  React.useEffect(() => {
    if (missionId && isAuthenticated && !isInitializing) {
      loadFiles();
    }
  }, [missionId, loadFiles, isAuthenticated, isInitializing]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = React.useCallback((selectedFiles: File[]) => {
    console.log(`[handleFileSelect] for ${selectedFiles.length} files`);
    const validFiles = selectedFiles.filter(file => {
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setError(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setError(null); // Clear any existing errors
      setSuccess(null); // Clear any existing success messages
      setDescriptionDialog(true);
    }
  }, [setPendingFiles, setDescription, setDescriptionDialog]);

const handleCancelUpload = React.useCallback(() => {
    setPendingFiles([]); // Use prop setter
    setDescription(''); // Use prop setter
    setDescriptionDialog(false); // Use prop setter
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      console.log('[FileUpload] Starting upload for mission:', missionId);
      console.log('[FileUpload] Files to upload:', pendingFiles.map(f => f.name));

      const formData = new FormData();
      pendingFiles.forEach(file => {
        formData.append('files', file);
      });

      if (description.trim()) {
        formData.append('description', description.trim());
      }

      console.log('[FileUpload] Making POST request to:', `/missions/${missionId}/files`);

      const response = await apiClient.post(`/missions/${missionId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log('[FileUpload] Upload progress:', progress + '%');
            setUploadProgress(progress);
          }
        }
      });

      console.log('[FileUpload] Upload successful:', response.data);
      setSuccess(`Successfully uploaded ${response.data.uploadedFiles.length} file(s)`);
      await loadFiles();
      onFilesChanged?.();

      setPendingFiles([]);
      setDescription('');
      setDescriptionDialog(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error: any) {
      console.error('[FileUpload] Upload error:', error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.error || error.message;
        setError(`Upload failed (${status}): ${message}`);
      } else {
        setError('Upload failed: Unknown error');
      }
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
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      handleFileSelect(selectedFiles);
      // Reset the input immediately to allow selecting the same file again
      e.target.value = '';
    }
  };

  return (
       <Box>
      {/* Authentication Status */}
      {!isAuthenticated && !isInitializing && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Authentication required to upload files
        </Alert>
      )}

      {/* Upload Area */}
      <label htmlFor="file-upload-input" style={{ display: 'block', cursor: isAuthenticated ? 'pointer' : 'not-allowed' }}>
        <Paper
          elevation={2}
          sx={{
            p: 3,
            mb: 2,
            border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
            backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.1)' : (!isAuthenticated ? 'rgba(0, 0, 0, 0.05)' : 'transparent'),
            cursor: isAuthenticated ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s ease',
            opacity: isAuthenticated ? 1 : 0.6
          }}
          onDragOver={isAuthenticated ? handleDragOver : undefined}
          onDragLeave={isAuthenticated ? handleDragLeave : undefined}
          onDrop={isAuthenticated ? handleDrop : undefined}
        >
        <Box textAlign="center">
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Drop files here or click to select
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Maximum file size: 50MB
          </Typography>
        </Box>
        <input
          id="file-upload-input"
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          disabled={!isAuthenticated}
        />
      </Paper>
      </label>

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
      <Dialog open={descriptionDialog} onClose={handleCancelUpload} maxWidth="sm" fullWidth>
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
          <Button onClick={handleCancelUpload}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={uploading || !isAuthenticated}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default React.memo(FileUpload);  