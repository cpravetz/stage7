import express from 'express';
import multer from 'multer';
import { MissionFile } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { FileUploadService } from './fileUploadService';
import { AxiosInstance } from 'axios';

export class FileUploadManager {
    private fileUploadService: FileUploadService;
    private authenticatedApi: AxiosInstance;
    private getComponentUrl: (type: string) => string | undefined;

    constructor(
        authenticatedApi: AxiosInstance,
        getComponentUrl: (type: string) => string | undefined
    ) {
        this.authenticatedApi = authenticatedApi;
        this.getComponentUrl = getComponentUrl;
        this.fileUploadService = new FileUploadService();
    }

    get fileUploadServiceInstance() {
        return this.fileUploadService;
    }

    getUploadMiddleware() {
        return multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB limit
                files: 10 // Maximum 10 files per request
            },
            fileFilter: (req, file, cb) => {
                // Basic file type validation
                const allowedMimeTypes = [
                    'text/plain', 'text/markdown', 'application/pdf',
                    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'text/csv', 'application/json', 'application/xml', 'text/yaml',
                    'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/bmp',
                    'application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed'
                ];

                if (allowedMimeTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error(`File type ${file.mimetype} not allowed`));
                }
            }
        }).array('files', 10);
    }

    setupRoutes(app: express.Application) {
        // Configure multer for file uploads
        const upload = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB limit
                files: 10 // Maximum 10 files per request
            },
            fileFilter: (req, file, cb) => {
                // Basic file type validation
                const allowedMimeTypes = [
                    'text/plain', 'text/markdown', 'application/pdf',
                    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'text/csv', 'application/json', 'application/xml', 'text/yaml',
                    'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/bmp',
                    'application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed'
                ];

                if (allowedMimeTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error(`File type ${file.mimetype} not allowed`));
                }
            }
        });

        // Upload files to a mission
        app.post('/missions/:missionId/files', upload.array('files', 10), async (req, res) => {
            try {
                await this.uploadMissionFiles(req, res);
            } catch (error) {
                console.error('Error in file upload endpoint:', error);
                res.status(500).json({
                    error: 'Internal server error during file upload',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Get files for a mission
        app.get('/missions/:missionId/files', async (req, res) => {
            try {
                await this.getMissionFiles(req, res);
            } catch (error) {
                console.error('Error getting mission files:', error);
                res.status(500).json({
                    error: 'Internal server error getting mission files',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Download a specific file
        app.get('/missions/:missionId/files/:fileId/download', async (req, res) => {
            try {
                await this.downloadMissionFile(req, res);
            } catch (error) {
                console.error('Error downloading file:', error);
                res.status(500).json({
                    error: 'Internal server error downloading file',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Delete a file from a mission
        app.delete('/missions/:missionId/files/:fileId', async (req, res) => {
            try {
                await this.deleteMissionFile(req, res);
            } catch (error) {
                console.error('Error deleting file:', error);
                res.status(500).json({
                    error: 'Internal server error deleting file',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }

    private async uploadMissionFiles(req: express.Request, res: express.Response) {
        const { missionId } = req.params;
        const files = req.files as Express.Multer.File[];
        const { description } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }

        // Get user information from the authenticated request
        const user = (req as any).user;
        const uploadedBy = user?.componentType || 'unknown';

        try {
            // Verify the mission exists and user has access
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(500).json({ error: 'Librarian service not available' });
            }

            // Load the mission to verify it exists and get current data
            const missionResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${missionId}`, {
                params: { collection: 'missions', storageType: 'mongo' }
            });

            if (!missionResponse.data || !missionResponse.data.data) {
                return res.status(404).json({ error: 'Mission not found' });
            }

            const mission = missionResponse.data.data;
            const uploadedFiles: MissionFile[] = [];

            // Upload each file
            for (const file of files) {
                try {
                    const uploadedFile = await this.fileUploadService.uploadFile(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        uploadedBy,
                        { description }
                    );

                    const missionFile = this.fileUploadService.convertToMissionFile(uploadedFile);
                    uploadedFiles.push(missionFile);

                    console.log(`File uploaded successfully: ${file.originalname} for mission ${missionId}`);
                } catch (uploadError) {
                    console.error(`Failed to upload file ${file.originalname}:`, uploadError);
                    // Continue with other files, but log the error
                }
            }

            if (uploadedFiles.length === 0) {
                return res.status(500).json({ error: 'Failed to upload any files' });
            }

            // Update the mission with the new files
            const existingFiles = mission.attachedFiles || [];
            const updatedMission = {
                ...mission,
                attachedFiles: [...existingFiles, ...uploadedFiles],
                updatedAt: new Date()
            };

            // Save the updated mission
            await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                id: missionId,
                data: updatedMission,
                collection: 'missions',
                storageType: 'mongo'
            });

            res.status(200).json({
                message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
                uploadedFiles: uploadedFiles.map(f => ({
                    id: f.id,
                    originalName: f.originalName,
                    size: f.size,
                    mimeType: f.mimeType,
                    uploadedAt: f.uploadedAt
                }))
            });

        } catch (error) {
            analyzeError(error as Error);
            console.error('Error uploading mission files:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to upload files to mission' });
        }
    }

    private async getMissionFiles(req: express.Request, res: express.Response) {
        const { missionId } = req.params;

        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(500).json({ error: 'Librarian service not available' });
            }

            // Load the mission to get its files
            const missionResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${missionId}`, {
                params: { collection: 'missions', storageType: 'mongo' }
            });

            if (!missionResponse.data || !missionResponse.data.data) {
                return res.status(404).json({ error: 'Mission not found' });
            }

            const mission = missionResponse.data.data;
            const files = mission.attachedFiles || [];

            res.status(200).json({
                missionId,
                files: files.map((f: MissionFile) => ({
                    id: f.id,
                    originalName: f.originalName,
                    size: f.size,
                    mimeType: f.mimeType,
                    uploadedAt: f.uploadedAt,
                    uploadedBy: f.uploadedBy,
                    description: f.description
                }))
            });

        } catch (error) {
            analyzeError(error as Error);
            if (error && (error as any).response) {
                console.error('Error response data from Librarian:', (error as any).response.data);
            }
            console.error('Error getting mission files:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to get mission files' });
        }
    }

    private async downloadMissionFile(req: express.Request, res: express.Response) {
        const { missionId, fileId } = req.params;

        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(500).json({ error: 'Librarian service not available' });
            }

            // Load the mission to get file information
            const missionResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${missionId}`, {
                params: { collection: 'missions', storageType: 'mongo' }
            });

            if (!missionResponse.data || !missionResponse.data.data) {
                return res.status(404).json({ error: 'Mission not found' });
            }

            const mission = missionResponse.data.data;
            const files = mission.attachedFiles || [];
            const file = files.find((f: MissionFile) => f.id === fileId);

            if (!file) {
                return res.status(404).json({ error: 'File not found in mission' });
            }

            // Check if file exists on disk
            const fileExists = await this.fileUploadService.fileExists(file.storagePath);
            if (!fileExists) {
                return res.status(404).json({ error: 'File not found on storage' });
            }

            // Get the file content
            const fileBuffer = await this.fileUploadService.getFile(file.id, file.storagePath);

            // Set appropriate headers for file download
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
            res.setHeader('Content-Length', file.size.toString());

            res.send(fileBuffer);

        } catch (error) {
            analyzeError(error as Error);
            console.error('Error downloading mission file:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to download file' });
        }
    }

    private async deleteMissionFile(req: express.Request, res: express.Response) {
        const { missionId, fileId } = req.params;

        try {
            const librarianUrl = this.getComponentUrl('Librarian');
            if (!librarianUrl) {
                return res.status(500).json({ error: 'Librarian service not available' });
            }

            // Load the mission to get file information
            const missionResponse = await this.authenticatedApi.get(`http://${librarianUrl}/loadData/${missionId}`, {
                params: { collection: 'missions', storageType: 'mongo' }
            });

            if (!missionResponse.data || !missionResponse.data.data) {
                return res.status(404).json({ error: 'Mission not found' });
            }

            const mission = missionResponse.data.data;
            const files = mission.attachedFiles || [];
            const fileIndex = files.findIndex((f: MissionFile) => f.id === fileId);

            if (fileIndex === -1) {
                return res.status(404).json({ error: 'File not found in mission' });
            }

            const file = files[fileIndex];

            // Delete the file from storage
            try {
                await this.fileUploadService.deleteFile(file.id, file.storagePath);
            } catch (deleteError) {
                console.error(`Failed to delete file from storage: ${deleteError}`);
                // Continue with removing from mission even if file deletion fails
            }

            // Remove the file from the mission
            const updatedFiles = files.filter((f: MissionFile) => f.id !== fileId);
            const updatedMission = {
                ...mission,
                attachedFiles: updatedFiles,
                updatedAt: new Date()
            };

            // Save the updated mission
            await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                id: missionId,
                data: updatedMission,
                collection: 'missions',
                storageType: 'mongo'
            });

            res.status(200).json({
                message: 'File deleted successfully',
                deletedFile: {
                    id: file.id,
                    originalName: file.originalName
                }
            });

        } catch (error) {
            analyzeError(error as Error);
            console.error('Error deleting mission file:', error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Failed to delete file' });
        }
    }
}
