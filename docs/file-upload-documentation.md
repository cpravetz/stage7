# File Upload System Documentation

This document provides a comprehensive overview of the file upload system in the Stage7 platform.

## 1. Overview

The file upload system allows users to upload files for use in missions. These files can be documents, images, data files, or other resources that agents can use during mission execution. The system is designed to be secure, robust, and user-friendly.

## 2. Architecture

The file upload system consists of the following key components:

*   **`PostOffice` Service**: Acts as the main entry point for file uploads. It uses a `FileUploadManager` to handle the file upload requests.
*   **`FileUploadManager`**: Manages the file upload process, including handling multipart/form-data requests, validating files, and coordinating with the `FileUploadService` and `Librarian`.
*   **`FileUploadService`**: Handles the low-level file operations, such as storing files on the file system, retrieving them, and deleting them. It also performs file validation and checksum verification.
*   **`Librarian` Service**: Stores the metadata for all uploaded files in the `missions` collection in MongoDB. This metadata includes the file ID, name, size, MIME type, and storage path.
*   **`mcs-react` Frontend**: Provides the user interface for uploading files, including a drag-and-drop component.

## 3. File Upload Flow

1.  The user initiates a file upload through the UI, typically in response to an `ASK_USER_QUESTION` step with `answerType: 'file'`.
2.  The frontend sends a `multipart/form-data` request to the `PostOffice` service's `/missions/{missionId}/files` endpoint. The request includes the file(s) and an authentication token.
3.  The `FileUploadManager` in the `PostOffice` service receives the request and uses the `multer` middleware to handle the file stream.
4.  The `FileUploadManager` validates the files based on size, MIME type, and extension.
5.  For each valid file, the `FileUploadService` saves the file to the file system in a structured directory path and calculates a checksum for integrity.
6.  The `FileUploadManager` then updates the corresponding mission object in the `Librarian` service, adding the metadata of the uploaded file to the `attachedFiles` array of the mission.
7.  The system returns a file ID to the agent, which can then be used to access the file.

## 4. User Interface

The file upload UI has been enhanced to provide a modern and user-friendly experience:

*   **Drag-and-Drop Zone**: A large, clearly defined area for dropping files.
*   **Visual Feedback**: The UI provides visual feedback for different states, such as when the user is hovering over the drop zone or when a file has been successfully selected.
*   **File Information**: The UI displays the name and size of the selected file.
*   **Remove Option**: A button to clear the selected file.

## 5. API Endpoints

*   `POST /missions/{missionId}/files`: Uploads one or more files to a mission.
*   `GET /missions/{missionId}/files`: Retrieves a list of files for a mission.
*   `GET /missions/{missionId}/files/{fileId}/download`: Downloads a specific file.
*   `DELETE /missions/{missionId}/files/{fileId}`: Deletes a file from a mission.

## 6. Plugin Integration

Plugins can access uploaded files using the `FILE_OPS_PYTHON` plugin or by implementing custom logic. The `fileId` of the uploaded file is made available to the agent, which can then be passed as an input to the `FILE_OPS_PYTHON` plugin with the `read` operation to get the file's content.

## 7. Security

*   **Authentication**: All file upload endpoints require a valid JWT.
*   **Authorization**: Users can only upload files to missions they have access to.
*   **File Validation**: The system validates file types, sizes, and extensions to prevent malicious uploads.
*   **Path Traversal Protection**: The system prevents path traversal attacks by validating filenames.
*   **Secure Storage**: Files are stored with unique IDs in a structured directory, and checksums are used to verify file integrity.

## 8. Configuration

The following environment variables can be used to configure the file upload system:

*   `MISSION_FILES_STORAGE_PATH`: The base path for storing uploaded mission files. Defaults to `./mission-files/` in the `PostOffice` service's working directory.
*   `ARTIFACT_STORAGE_BASE_PATH`: The base path for storing plugin artifacts. Defaults to `./cktmcs_artifacts/` in the `CapabilitiesManager` service's working directory.

## 9. Testing

A typical workflow for testing the file upload system is as follows:

1.  Create a mission that asks the user to upload a file using the `ASK_USER_QUESTION` plugin with `answerType: 'file'`.
2.  When prompted, upload a file through the UI.
3.  Verify that the system returns a `fileId`.
4.  Use the `fileId` with the `FILE_OPERATION` plugin to read the file's content.

## 10. Future Improvement Opportunities

*   **File Versioning**: Support for multiple versions of the same file.
*   **File Sharing**: Allow sharing of files between missions.
*   **Advanced Search**: Implement search functionality for files based on content, metadata, or tags.
*   **Cloud Storage Integration**: Add support for cloud storage providers like AWS S3 or Google Cloud Storage.
*   **File Preview**: Provide in-browser previews for common file types.
*   **Batch Operations**: Allow for bulk operations on files, such as downloading or deleting multiple files at once.
