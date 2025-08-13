# Mission File Upload System

## Overview

The Stage7 platform now supports file uploads for missions, allowing users to attach documents, images, data files, and other resources that can be used during mission execution. This system provides secure file storage, management, and access control.

## Features

### File Upload Capabilities
- **Drag & Drop Interface**: Users can drag files directly onto the upload area
- **Multiple File Upload**: Support for uploading multiple files simultaneously
- **File Type Validation**: Automatic validation of file types and sizes
- **Progress Tracking**: Real-time upload progress indication
- **File Descriptions**: Optional descriptions for uploaded files

### Supported File Types
- **Documents**: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- **Text Files**: TXT, MD, CSV, JSON, XML, YAML
- **Images**: PNG, JPG, JPEG, GIF, SVG, BMP
- **Archives**: ZIP, TAR, GZ, 7Z

### File Size Limits
- Maximum file size: 50MB per file
- Maximum files per upload: 10 files

## API Endpoints

### Upload Files to Mission
```
POST /missions/{missionId}/files
Content-Type: multipart/form-data
Authorization: Bearer {token}

Form Data:
- files: File[] (required) - Array of files to upload
- description: string (optional) - Description for the uploaded files
```

**Response:**
```json
{
  "message": "Successfully uploaded 2 file(s)",
  "uploadedFiles": [
    {
      "id": "uuid",
      "originalName": "document.pdf",
      "size": 1024000,
      "mimeType": "application/pdf",
      "uploadedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### Get Mission Files
```
GET /missions/{missionId}/files
Authorization: Bearer {token}
```

**Response:**
```json
{
  "missionId": "mission-uuid",
  "files": [
    {
      "id": "file-uuid",
      "originalName": "document.pdf",
      "size": 1024000,
      "mimeType": "application/pdf",
      "uploadedAt": "2024-01-01T12:00:00Z",
      "uploadedBy": "user-id",
      "description": "Project requirements document"
    }
  ]
}
```

### Download File
```
GET /missions/{missionId}/files/{fileId}/download
Authorization: Bearer {token}
```

**Response:** Binary file content with appropriate headers

### Delete File
```
DELETE /missions/{missionId}/files/{fileId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "File deleted successfully",
  "deletedFile": {
    "id": "file-uuid",
    "originalName": "document.pdf"
  }
}
```

## Frontend Usage

### File Upload Component
The `FileUpload` component provides a complete file management interface:

```tsx
import FileUpload from './components/FileUpload';

<FileUpload 
  missionId={activeMissionId} 
  onFilesChanged={() => console.log('Files updated')} 
/>
```

### Integration with Missions
Files are automatically integrated into the mission interface through the "Files" tab in the main application.

## Security Features

### File Validation
- **Extension Checking**: Only allowed file extensions are accepted
- **MIME Type Validation**: File content type is verified
- **Size Limits**: Files exceeding size limits are rejected
- **Path Traversal Protection**: Prevents malicious file paths

### Access Control
- **Authentication Required**: All file operations require valid authentication
- **Mission-Based Access**: Users can only access files for missions they have access to
- **Secure Storage**: Files are stored in a secure directory structure

### Storage Security
- **Unique File IDs**: Each file gets a unique identifier
- **Organized Storage**: Files are organized by date and distributed across subdirectories
- **Checksum Verification**: File integrity is verified during storage

## Storage Structure

Files are stored in the following directory structure:
```
mission-files/
├── 2024-01/
│   ├── ab/
│   │   └── ab123456-uuid.pdf
│   └── cd/
│       └── cd789012-uuid.jpg
└── 2024-02/
    └── ef/
        └── ef345678-uuid.docx
```

## Environment Configuration

### Required Environment Variables
```bash
# Optional: Custom storage path for mission files
MISSION_FILES_STORAGE_PATH=/path/to/mission/files

# Optional: Custom artifact storage path (used by CapabilitiesManager)
ARTIFACT_STORAGE_BASE_PATH=/path/to/artifacts
```

### Default Storage Locations
- **Mission Files**: `./mission-files/` (relative to PostOffice working directory)
- **Plugin Artifacts**: `./cktmcs_artifacts/` (relative to CapabilitiesManager working directory)

## Plugin Integration

### Accessing Mission Files in Plugins
Plugins can access uploaded mission files through the FILE_OPS plugin or by implementing custom file access logic. The file paths are stored in the mission data and can be retrieved through the Librarian service.

### Example: Reading Mission Files in Python Plugin
```python
import json
import os

def execute_plugin(inputs):
    # Get mission data from Librarian
    mission_data = get_mission_data(inputs['missionId'])
    
    # Access attached files
    attached_files = mission_data.get('attachedFiles', [])
    
    for file_info in attached_files:
        file_path = file_info['storagePath']
        if os.path.exists(file_path):
            # Process the file
            with open(file_path, 'rb') as f:
                content = f.read()
                # Process file content...
```

## Error Handling

### Common Error Responses
- **400 Bad Request**: Invalid file type, size exceeded, or no files provided
- **401 Unauthorized**: Missing or invalid authentication token
- **404 Not Found**: Mission or file not found
- **413 Payload Too Large**: File size exceeds limits
- **500 Internal Server Error**: Storage or processing errors

### Client-Side Error Handling
The FileUpload component automatically handles and displays errors to users, including:
- File type validation errors
- Size limit exceeded errors
- Network connectivity issues
- Server-side processing errors

## Best Practices

### For Users
1. **Organize Files**: Use descriptive filenames and add descriptions
2. **File Sizes**: Keep files under 50MB for optimal performance
3. **File Types**: Use standard formats for better compatibility
4. **Security**: Don't upload sensitive files without proper authorization

### For Developers
1. **Error Handling**: Always handle file upload errors gracefully
2. **Progress Feedback**: Provide upload progress for better UX
3. **Validation**: Validate files on both client and server side
4. **Cleanup**: Implement proper file cleanup for failed uploads

## Future Enhancements

### Planned Features
- **File Versioning**: Support for multiple versions of the same file
- **File Sharing**: Share files between missions
- **Advanced Search**: Search files by content, metadata, or tags
- **Cloud Storage**: Integration with cloud storage providers
- **File Preview**: In-browser preview for common file types
- **Batch Operations**: Bulk file operations (download, delete, move)

### Plugin Enhancements
- **File Processing Plugins**: Specialized plugins for file analysis and processing
- **Format Conversion**: Automatic file format conversion
- **Content Extraction**: Extract text and metadata from files
- **File Validation**: Advanced file content validation and scanning
