import { FileUploadService, UploadedFileInfo, FileUploadOptions } from '../src/fileUploadService';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('crypto');
jest.mock('uuid');

// Cast mocked functions/modules
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('FileUploadService', () => {
    let fileUploadService: FileUploadService;
    const MOCK_BASE_STORAGE_PATH = '/mock/storage';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date objects

        // Mock fs/promises
        mockFs.access.mockResolvedValue(undefined); // Directory exists by default
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.readFile.mockResolvedValue(Buffer.from('mock content'));
        mockFs.unlink.mockResolvedValue(undefined);

        // Mock path
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.extname.mockImplementation((p) => '.txt'); // Default extension
        mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));

        // Mock crypto
        mockCrypto.createHash.mockReturnValue({ update: jest.fn().mockReturnThis(), digest: jest.fn().mockReturnValue('mock-checksum') } as any);

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-file-id');

        // Mock process.cwd and process.env
        jest.spyOn(process, 'cwd').mockReturnValue('/app');
        process.env.MISSION_FILES_STORAGE_PATH = MOCK_BASE_STORAGE_PATH;

        // Suppress console errors
        jest.spyOn(console, 'error').mockImplementation(() => {});

        fileUploadService = new FileUploadService();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided base path', () => {
            const service = new FileUploadService('/custom/path');
            expect((service as any).baseStoragePath).toBe('/custom/path');
            expect(mockFs.access).toHaveBeenCalledWith('/custom/path');
        });

        it('should use MISSION_FILES_STORAGE_PATH from process.env', () => {
            expect((fileUploadService as any).baseStoragePath).toBe(MOCK_BASE_STORAGE_PATH);
            expect(mockFs.access).toHaveBeenCalledWith(MOCK_BASE_STORAGE_PATH);
        });

        it('should use default path if no env var or provided', () => {
            delete process.env.MISSION_FILES_STORAGE_PATH;
            const service = new FileUploadService();
            expect((service as any).baseStoragePath).toBe('/app/mission-files');
            expect(mockFs.access).toHaveBeenCalledWith('/app/mission-files');
        });

        it('should create storage directory if it does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT')); // Simulate dir not existing
            const service = new FileUploadService();
            await (service as any).ensureStorageDirectory(); // Manually call as constructor is sync
            expect(mockFs.mkdir).toHaveBeenCalledWith((service as any).baseStoragePath, { recursive: true });
        });

        it('should not create storage directory if it already exists', async () => {
            await (fileUploadService as any).ensureStorageDirectory(); // Manually call
            expect(mockFs.mkdir).not.toHaveBeenCalled();
        });
    });

    describe('uploadFile', () => {
        const MOCK_FILE_BUFFER = Buffer.from('This is a test file content');
        const MOCK_ORIGINAL_NAME = 'test.txt';
        const MOCK_MIME_TYPE = 'text/plain';
        const MOCK_UPLOADED_BY = 'test-user';
        const MOCK_DESCRIPTION = 'A test file';

        const expectedStoragePath = '/mock/storage/2023-01/mo/mock-file-id.txt';

        beforeEach(() => {
            // Control date for generateStoragePath
            jest.spyOn(global, 'Date').mockImplementation(() => new (jest.requireActual('moment'))('2023-01-15T10:00:00Z').toDate());
            mockPath.extname.mockReturnValue('.txt');
        });

        it('should upload a file successfully', async () => {
            const result = await fileUploadService.uploadFile(
                MOCK_FILE_BUFFER, MOCK_ORIGINAL_NAME, MOCK_MIME_TYPE, MOCK_UPLOADED_BY, { description: MOCK_DESCRIPTION }
            );

            expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('/mock/storage/2023-01/mo'), { recursive: true });
            expect(mockFs.writeFile).toHaveBeenCalledWith(expectedStoragePath, MOCK_FILE_BUFFER);
            expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
            expect(mockCrypto.createHash().update).toHaveBeenCalledWith(MOCK_FILE_BUFFER);
            expect(mockCrypto.createHash().digest).toHaveBeenCalledWith('hex');

            expect(result).toEqual(expect.objectContaining({
                id: 'mock-file-id',
                originalName: MOCK_ORIGINAL_NAME,
                mimeType: MOCK_MIME_TYPE,
                size: MOCK_FILE_BUFFER.length,
                storagePath: expectedStoragePath,
                uploadedBy: MOCK_UPLOADED_BY,
                uploadedAt: expect.any(Date),
                description: MOCK_DESCRIPTION,
            }));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File uploaded successfully'));
        });

        it('should reject files that are too large', async () => {
            const largeBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
            await expect(fileUploadService.uploadFile(largeBuffer, 'large.txt', 'text/plain', 'user')).rejects.toThrow('exceeds maximum allowed size');
        });

        it('should reject files with invalid extensions', async () => {
            mockPath.extname.mockReturnValueOnce('.exe');
            await expect(fileUploadService.uploadFile(MOCK_FILE_BUFFER, 'malicious.exe', 'application/octet-stream', 'user')).rejects.toThrow('File extension .exe is not allowed');
        });

        it('should reject files with path traversal attempts', async () => {
            await expect(fileUploadService.uploadFile(MOCK_FILE_BUFFER, '../../../etc/passwd', 'text/plain', 'user')).rejects.toThrow('path traversal detected');
        });

        it('should reject files with disallowed MIME types if options provided', async () => {
            const options: FileUploadOptions = { allowedMimeTypes: ['image/png'] };
            await expect(fileUploadService.uploadFile(MOCK_FILE_BUFFER, 'test.txt', 'text/plain', 'user', options)).rejects.toThrow('MIME type text/plain is not allowed');
        });

        it('should clean up file on upload failure', async () => {
            mockFs.writeFile.mockRejectedValueOnce(new Error('Write error'));
            await expect(fileUploadService.uploadFile(MOCK_FILE_BUFFER, MOCK_ORIGINAL_NAME, MOCK_MIME_TYPE, MOCK_UPLOADED_BY)).rejects.toThrow('Failed to upload file: Write error');
            expect(mockFs.unlink).toHaveBeenCalledWith(expectedStoragePath);
        });

        it('should log error if cleanup fails', async () => {
            mockFs.writeFile.mockRejectedValueOnce(new Error('Write error'));
            mockFs.unlink.mockRejectedValueOnce(new Error('Cleanup error'));
            await expect(fileUploadService.uploadFile(MOCK_FILE_BUFFER, MOCK_ORIGINAL_NAME, MOCK_MIME_TYPE, MOCK_UPLOADED_BY)).rejects.toThrow();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to clean up file after upload error'), expect.any(Error));
        });
    });

    describe('getFile', () => {
        const MOCK_FILE_ID = 'file-id';
        const MOCK_STORAGE_PATH = '/mock/storage/file.txt';
        const MOCK_FILE_CONTENT = Buffer.from('retrieved content');

        it('should retrieve file content successfully', async () => {
            mockFs.readFile.mockResolvedValueOnce(MOCK_FILE_CONTENT);
            const result = await fileUploadService.getFile(MOCK_FILE_ID, MOCK_STORAGE_PATH);
            expect(mockFs.readFile).toHaveBeenCalledWith(MOCK_STORAGE_PATH);
            expect(result).toEqual(MOCK_FILE_CONTENT);
        });

        it('should throw error if file retrieval fails', async () => {
            mockFs.readFile.mockRejectedValueOnce(new Error('Read error'));
            await expect(fileUploadService.getFile(MOCK_FILE_ID, MOCK_STORAGE_PATH)).rejects.toThrow('Failed to retrieve file file-id: Read error');
        });
    });

    describe('deleteFile', () => {
        const MOCK_FILE_ID = 'file-id';
        const MOCK_STORAGE_PATH = '/mock/storage/file.txt';

        it('should delete a file successfully', async () => {
            await fileUploadService.deleteFile(MOCK_FILE_ID, MOCK_STORAGE_PATH);
            expect(mockFs.unlink).toHaveBeenCalledWith(MOCK_STORAGE_PATH);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File deleted successfully'));
        });

        it('should throw error if file deletion fails', async () => {
            mockFs.unlink.mockRejectedValueOnce(new Error('Delete error'));
            await expect(fileUploadService.deleteFile(MOCK_FILE_ID, MOCK_STORAGE_PATH)).rejects.toThrow('Failed to delete file file-id: Delete error');
        });
    });

    describe('fileExists', () => {
        const MOCK_STORAGE_PATH = '/mock/storage/file.txt';

        it('should return true if file exists', async () => {
            mockFs.access.mockResolvedValueOnce(undefined);
            const exists = await fileUploadService.fileExists(MOCK_STORAGE_PATH);
            expect(exists).toBe(true);
            expect(mockFs.access).toHaveBeenCalledWith(MOCK_STORAGE_PATH);
        });

        it('should return false if file does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
            const exists = await fileUploadService.fileExists(MOCK_STORAGE_PATH);
            expect(exists).toBe(false);
        });
    });

    describe('convertToMissionFile', () => {
        it('should convert UploadedFileInfo to MissionFile', () => {
            const uploadedFile: UploadedFileInfo = {
                id: 'test-id',
                originalName: 'test.txt',
                mimeType: 'text/plain',
                size: 100,
                storagePath: '/path/to/file',
                uploadedBy: 'test-user',
                uploadedAt: new Date('2023-01-01T00:00:00Z'),
                description: 'Test file'
            };

            const missionFile = fileUploadService.convertToMissionFile(uploadedFile);

            expect(missionFile).toEqual({
                id: uploadedFile.id,
                originalName: uploadedFile.originalName,
                mimeType: uploadedFile.mimeType,
                size: uploadedFile.size,
                uploadedAt: uploadedFile.uploadedAt,
                uploadedBy: uploadedFile.uploadedBy,
                storagePath: uploadedFile.storagePath,
                description: uploadedFile.description
            });
        });
    });

    describe('validateFile (private)', () => {
        const baseArgs = { originalName: 'test.txt', mimeType: 'text/plain', size: 100 };

        it('should not throw for valid file', () => {
            expect(() => (fileUploadService as any).validateFile(baseArgs.originalName, baseArgs.mimeType, baseArgs.size)).not.toThrow();
        });

        it('should throw for file size exceeding max', () => {
            expect(() => (fileUploadService as any).validateFile(baseArgs.originalName, baseArgs.mimeType, 60 * 1024 * 1024)).toThrow('exceeds maximum allowed size');
        });

        it('should throw for disallowed extension', () => {
            mockPath.extname.mockReturnValueOnce('.bad');
            expect(() => (fileUploadService as any).validateFile('bad.bad', baseArgs.mimeType, baseArgs.size)).toThrow('File extension .bad is not allowed');
        });

        it('should throw for disallowed mime type', () => {
            const options: FileUploadOptions = { allowedMimeTypes: ['image/png'] };
            expect(() => (fileUploadService as any).validateFile(baseArgs.originalName, 'application/json', baseArgs.size, options)).toThrow('MIME type application/json is not allowed');
        });

        it('should throw for path traversal', () => {
            expect(() => (fileUploadService as any).validateFile('../../../etc/passwd', baseArgs.mimeType, baseArgs.size)).toThrow('path traversal detected');
            expect(() => (fileUploadService as any).validateFile('dir/file.txt', baseArgs.mimeType, baseArgs.size)).toThrow('path traversal detected');
            expect(() => (fileUploadService as any).validateFile('dir\file.txt', baseArgs.mimeType, baseArgs.size)).toThrow('path traversal detected');
        });

        it('should respect custom maxFileSize option', () => {
            const options: FileUploadOptions = { maxFileSize: 10 };
            expect(() => (fileUploadService as any).validateFile(baseArgs.originalName, baseArgs.mimeType, 11, options)).toThrow('exceeds maximum allowed size');
        });

        it('should respect custom allowedExtensions option', () => {
            const options: FileUploadOptions = { allowedExtensions: ['.jpg'] };
            mockPath.extname.mockReturnValueOnce('.txt');
            expect(() => (fileUploadService as any).validateFile('test.txt', baseArgs.mimeType, baseArgs.size, options)).toThrow('File extension .txt is not allowed');
        });
    });

    describe('generateStoragePath (private)', () => {
        it('should generate a correct storage path', () => {
            jest.spyOn(global, 'Date').mockImplementation(() => new (jest.requireActual('moment'))('2023-01-15T10:00:00Z').toDate());
            mockPath.extname.mockReturnValueOnce('.png');
            mockUuidv4.mockReturnValueOnce('abcdef1234567890');

            const path = (fileUploadService as any).generateStoragePath('abcdef1234567890', 'image.png');
            expect(path).toBe('/mock/storage/2023-01/ab/abcdef1234567890.png');
        });
    });

    describe('calculateChecksum (private)', () => {
        it('should calculate SHA256 checksum', async () => {
            const mockFileContent = Buffer.from('file content for checksum');
            mockFs.readFile.mockResolvedValueOnce(mockFileContent);
            mockCrypto.createHash.mockReturnValueOnce({ update: jest.fn().mockReturnThis(), digest: jest.fn().mockReturnValue('calculated-checksum') } as any);

            const checksum = await (fileUploadService as any).calculateChecksum('/path/to/file.txt');

            expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/file.txt');
            expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
            expect(mockCrypto.createHash().update).toHaveBeenCalledWith(mockFileContent);
            expect(mockCrypto.createHash().digest).toHaveBeenCalledWith('hex');
            expect(checksum).toBe('calculated-checksum');
        });
    });
});