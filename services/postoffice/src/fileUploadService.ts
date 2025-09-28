import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { MissionFile } from '@cktmcs/shared';

export interface UploadedFileInfo {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
    uploadedBy: string;
    uploadedAt: Date;
    description?: string;
}

export interface FileUploadOptions {
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
    description?: string;
}

export class FileUploadService {
    private baseStoragePath: string;
    private readonly defaultMaxFileSize = 50 * 1024 * 1024; // 50MB
    private readonly defaultAllowedExtensions = [
        '.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', 
        '.ppt', '.pptx', '.csv', '.json', '.xml', '.yaml', '.yml',
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp',
        '.zip', '.tar', '.gz', '.7z'
    ];

    constructor(baseStoragePath?: string) {
        this.baseStoragePath = baseStoragePath || process.env.MISSION_FILES_STORAGE_PATH || path.join(process.cwd(), 'mission-files');
        this.ensureStorageDirectory();
    }

    private async ensureStorageDirectory(): Promise<void> {
        try {
            await fs.access(this.baseStoragePath);
        } catch {
            await fs.mkdir(this.baseStoragePath, { recursive: true });
        }
    }

    private generateStoragePath(fileId: string, originalName: string): string {
        const ext = path.extname(originalName);
        const dateFolder = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const subFolder = fileId.substring(0, 2); // First 2 chars of UUID for distribution
        return path.join(this.baseStoragePath, dateFolder, subFolder, `${fileId}${ext}`);
    }

    private validateFile(
        originalName: string, 
        mimeType: string, 
        size: number, 
        options: FileUploadOptions = {}
    ): void {
        const maxSize = options.maxFileSize || this.defaultMaxFileSize;
        const allowedExtensions = options.allowedExtensions || this.defaultAllowedExtensions;
        const allowedMimeTypes = options.allowedMimeTypes;

        // Check file size
        if (size > maxSize) {
            throw new Error(`File size ${size} bytes exceeds maximum allowed size of ${maxSize} bytes`);
        }

        // Check file extension
        const ext = path.extname(originalName).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            throw new Error(`File extension ${ext} is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
        }

        // Check MIME type if specified
        if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
            throw new Error(`MIME type ${mimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
        }

        // Security check: prevent path traversal
        if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
            throw new Error('Invalid filename: path traversal detected');
        }
    }

    private async calculateChecksum(filePath: string): Promise<string> {
        const fileBuffer = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    async uploadFile(
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
        uploadedBy: string,
        options: FileUploadOptions = {}
    ): Promise<UploadedFileInfo> {
        // Validate the file
        this.validateFile(originalName, mimeType, fileBuffer.length, options);

        // Generate unique file ID and storage path
        const fileId = uuidv4();
        const storagePath = this.generateStoragePath(fileId, originalName);

        // Ensure the directory exists
        const storageDir = path.dirname(storagePath);
        await fs.mkdir(storageDir, { recursive: true });

        try {
            // Write the file to storage
            await fs.writeFile(storagePath, fileBuffer);

            // Calculate checksum for integrity verification
            const checksum = await this.calculateChecksum(storagePath);

            const uploadedFile: UploadedFileInfo = {
                id: fileId,
                originalName,
                mimeType,
                size: fileBuffer.length,
                storagePath,
                uploadedBy,
                uploadedAt: new Date(),
                description: options.description
            };

            console.log(`File uploaded successfully: ${originalName} (${fileId}) by ${uploadedBy}`);
            return uploadedFile;

        } catch (error) {
            // Clean up on failure
            try {
                await fs.unlink(storagePath);
            } catch (cleanupError) {
                console.error('Failed to clean up file after upload error:', cleanupError);
            }
            throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Import an existing file from a given absolute path into PostOffice-managed storage.
     * This reads the sourcePath, validates it, and writes it into the managed storage
     * so PostOffice can uniformly serve and manage files.
     */
    async uploadFileFromPath(
        sourcePath: string,
        originalName: string,
        mimeType: string | undefined,
        uploadedBy: string,
        options: FileUploadOptions = {}
    ): Promise<UploadedFileInfo> {
        // Ensure source file exists and is accessible
        try {
            const stat = await fs.stat(sourcePath);
            if (!stat.isFile()) throw new Error('Source path is not a file');
            const size = stat.size;

            // Read the file
            const fileBuffer = await fs.readFile(sourcePath);

            // Use existing validation and upload path logic
            this.validateFile(originalName, mimeType || 'application/octet-stream', size, options);

            const fileId = uuidv4();
            const storagePath = this.generateStoragePath(fileId, originalName);
            const storageDir = path.dirname(storagePath);
            await fs.mkdir(storageDir, { recursive: true });

            await fs.writeFile(storagePath, fileBuffer);

            const uploadedFile: UploadedFileInfo = {
                id: fileId,
                originalName,
                mimeType: mimeType || 'application/octet-stream',
                size,
                storagePath,
                uploadedBy,
                uploadedAt: new Date(),
                description: options.description
            };

            console.log(`Imported file from path ${sourcePath} as ${originalName} (${fileId}) by ${uploadedBy}`);
            return uploadedFile;

        } catch (error) {
            throw new Error(`Failed to import file from path ${sourcePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getFile(fileId: string, storagePath: string): Promise<Buffer> {
        try {
            return await fs.readFile(storagePath);
        } catch (error) {
            throw new Error(`Failed to retrieve file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async deleteFile(fileId: string, storagePath: string): Promise<void> {
        try {
            await fs.unlink(storagePath);
            console.log(`File deleted successfully: ${fileId}`);
        } catch (error) {
            throw new Error(`Failed to delete file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async fileExists(storagePath: string): Promise<boolean> {
        try {
            await fs.access(storagePath);
            return true;
        } catch {
            return false;
        }
    }

    convertToMissionFile(uploadedFile: UploadedFileInfo): MissionFile {
        return {
            id: uploadedFile.id,
            originalName: uploadedFile.originalName,
            mimeType: uploadedFile.mimeType,
            size: uploadedFile.size,
            uploadedAt: uploadedFile.uploadedAt,
            uploadedBy: uploadedFile.uploadedBy,
            storagePath: uploadedFile.storagePath,
            description: uploadedFile.description
        };
    }
}
