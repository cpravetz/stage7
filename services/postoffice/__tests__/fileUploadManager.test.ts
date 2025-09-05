import request from 'supertest';
import express from 'express';
import multer from 'multer';
import { FileUploadManager } from '../src/fileUploadManager';
import { FileUploadService } from '../src/fileUploadService';
import { analyzeError } from '@cktmcs/errorhandler';
import { MissionFile } from '@cktmcs/shared';

// Mock external dependencies
jest.mock('express');
jest.mock('multer');
jest.mock('../src/fileUploadService');
jest.mock('@cktmcs/errorhandler');

// Cast mocked classes/functions
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockMulter = multer as jest.MockedFunction<typeof multer>;
const mockFileUploadService = FileUploadService as jest.MockedClass<typeof FileUploadService>;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('FileUploadManager', () => {
    let manager: FileUploadManager;
    let mockAuthenticatedApi: any;
    let mockGetComponentUrl: jest.Mock;
    let mockFileUploadServiceInstance: jest.Mocked<FileUploadService>;
    let mockApp: jest.Mocked<express.Application>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock authenticatedApi and getComponentUrl
        mockAuthenticatedApi = {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        };
        mockGetComponentUrl = jest.fn().mockImplementation((type: string) => {
            if (type === 'Librarian') return 'mock-librarian:5040';
            return undefined;
        });

        // Mock FileUploadService instance
        mockFileUploadServiceInstance = {
            uploadFile: jest.fn().mockResolvedValue({ id: 'file-id', originalName: 'test.txt', mimeType: 'text/plain', size: 100, storagePath: '/tmp/file.txt', uploadedBy: 'user', uploadedAt: new Date() }),
            convertToMissionFile: jest.fn().mockImplementation((file) => file),
            fileExists: jest.fn().mockResolvedValue(true),
            getFile: jest.fn().mockResolvedValue(Buffer.from('file content')),
            deleteFile: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockFileUploadService.mockImplementation(() => mockFileUploadServiceInstance);

        // Mock multer
        const mockMulterMiddleware = jest.fn((req, res, next) => { next(); });
        (mockMulterMiddleware as any).array = jest.fn().mockReturnValue(mockMulterMiddleware);
        mockMulter.memoryStorage.mockReturnValue({} as any);
        mockMulter.mockImplementation(() => ({ array: mockMulterMiddleware.array }));

        // Mock Express app
        mockApp = {
            post: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
        } as unknown as jest.Mocked<express.Application>;

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        manager = new FileUploadManager(mockAuthenticatedApi, mockGetComponentUrl);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should initialize with authenticatedApi and getComponentUrl', () => {
        expect((manager as any).authenticatedApi).toBe(mockAuthenticatedApi);
        expect((manager as any).getComponentUrl).toBe(mockGetComponentUrl);
        expect(mockFileUploadService).toHaveBeenCalledTimes(1);
    });

    it('should return fileUploadServiceInstance', () => {
        expect(manager.fileUploadServiceInstance).toBe(mockFileUploadServiceInstance);
    });

    describe('getUploadMiddleware', () => {
        it('should return multer middleware with correct configuration', () => {
            const middleware = manager.getUploadMiddleware();
            expect(mockMulter.memoryStorage).toHaveBeenCalledTimes(1);
            expect(mockMulter).toHaveBeenCalledWith(expect.objectContaining({
                limits: { fileSize: 50 * 1024 * 1024, files: 10 },
                fileFilter: expect.any(Function),
            }));
            expect((middleware as any).array).toHaveBeenCalledWith('files', 10);
        });

        it('should allow allowed mime types', () => {
            const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
            const cb = jest.fn();
            fileFilter({} as any, { mimetype: 'image/png' } as any, cb);
            expect(cb).toHaveBeenCalledWith(null, true);
        });

        it('should reject disallowed mime types', () => {
            const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
            const cb = jest.fn();
            fileFilter({} as any, { mimetype: 'application/x-sh' } as any, cb);
            expect(cb).toHaveBeenCalledWith(expect.any(Error));
            expect(cb.mock.calls[0][0].message).toBe('File type application/x-sh not allowed');
        });
    });

    describe('setupRoutes', () => {
        beforeEach(() => {
            manager.setupRoutes(mockApp);
        });

        it('should set up POST /missions/:missionId/files route', () => {
            expect(mockApp.post).toHaveBeenCalledWith('/missions/:missionId/files', expect.any(Function), expect.any(Function));
        });

        it('should set up GET /missions/:missionId/files route', () => {
            expect(mockApp.get).toHaveBeenCalledWith('/missions/:missionId/files', expect.any(Function));
        });

        it('should set up GET /missions/:missionId/files/:fileId/download route', () => {
            expect(mockApp.get).toHaveBeenCalledWith('/missions/:missionId/files/:fileId/download', expect.any(Function));
        });

        it('should set up DELETE /missions/:missionId/files/:fileId route', () => {
            expect(mockApp.delete).toHaveBeenCalledWith('/missions/:missionId/files/:fileId', expect.any(Function));
        });
    });

    describe('uploadMissionFiles (POST /missions/:missionId/files)', () => {
        const MOCK_MISSION_ID = 'mission-123';
        const MOCK_USER_ID = 'user-abc';
        const MOCK_FILE_BUFFER = Buffer.from('test content');
        const MOCK_FILE_NAME = 'test.txt';
        const MOCK_MIME_TYPE = 'text/plain';
        const MOCK_DESCRIPTION = 'A test file';

        const mockMission = { id: MOCK_MISSION_ID, attachedFiles: [] };

        let uploadMissionFilesHandler: Function;

        beforeEach(() => {
            manager.setupRoutes(mockApp);
            uploadMissionFilesHandler = mockApp.post.mock.calls.find(call => call[0] === '/missions/:missionId/files')[2];

            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: mockMission } }); // Load mission
            mockAuthenticatedApi.post.mockResolvedValueOnce({ status: 200 }); // Store mission
        });

        it('should upload files and update mission successfully', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [{ buffer: MOCK_FILE_BUFFER, originalname: MOCK_FILE_NAME, mimetype: MOCK_MIME_TYPE }] as Express.Multer.File[], body: { description: MOCK_DESCRIPTION }, user: { componentType: MOCK_USER_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockFileUploadServiceInstance.uploadFile).toHaveBeenCalledWith(
                MOCK_FILE_BUFFER, MOCK_FILE_NAME, MOCK_MIME_TYPE, MOCK_USER_ID, { description: MOCK_DESCRIPTION }
            );
            expect(mockFileUploadServiceInstance.convertToMissionFile).toHaveBeenCalledTimes(1);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.objectContaining({
                id: MOCK_MISSION_ID,
                collection: 'missions',
                data: expect.objectContaining({ attachedFiles: [expect.objectContaining({ id: 'file-id' })] }),
            }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Successfully uploaded 1 file(s)') }));
        });

        it('should return 400 if no files provided', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [], body: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'No files provided' });
        });

        it('should return 500 if Librarian service is not available', async () => {
            mockGetComponentUrl.mockReturnValueOnce(undefined);
            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [{ buffer: MOCK_FILE_BUFFER, originalname: MOCK_FILE_NAME, mimetype: MOCK_MIME_TYPE }], body: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Librarian service not available' });
        });

        it('should return 404 if mission not found', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: null } }); // Mission not found
            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [{ buffer: MOCK_FILE_BUFFER, originalname: MOCK_FILE_NAME, mimetype: MOCK_MIME_TYPE }], body: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Mission not found' });
        });

        it('should handle errors during file upload and continue with others', async () => {
            mockFileUploadServiceInstance.uploadFile.mockRejectedValueOnce(new Error('Upload failed for file1'));
            mockFileUploadServiceInstance.uploadFile.mockResolvedValueOnce({ id: 'file-id2', originalName: 'file2.txt', mimeType: 'text/plain', size: 100, storagePath: '/tmp/file2.txt', uploadedBy: 'user', uploadedAt: new Date() });

            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [
                { buffer: MOCK_FILE_BUFFER, originalname: 'file1.txt', mimetype: MOCK_MIME_TYPE },
                { buffer: MOCK_FILE_BUFFER, originalname: 'file2.txt', mimetype: MOCK_MIME_TYPE },
            ] as Express.Multer.File[], body: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Successfully uploaded 1 file(s)') }));
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upload file file1.txt'), expect.any(Error));
        });

        it('should return 500 if no files are successfully uploaded', async () => {
            mockFileUploadServiceInstance.uploadFile.mockRejectedValue(new Error('Upload failed'));

            const mockReq = { params: { missionId: MOCK_MISSION_ID }, files: [{ buffer: MOCK_FILE_BUFFER, originalname: MOCK_FILE_NAME, mimetype: MOCK_MIME_TYPE }], body: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await uploadMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to upload any files' });
        });
    });

    describe('getMissionFiles (GET /missions/:missionId/files)', () => {
        const MOCK_MISSION_ID = 'mission-123';
        const mockMission = { id: MOCK_MISSION_ID, attachedFiles: [{ id: 'file1', originalName: 'file1.txt' }] };

        let getMissionFilesHandler: Function;

        beforeEach(() => {
            manager.setupRoutes(mockApp);
            getMissionFilesHandler = mockApp.get.mock.calls.find(call => call[0] === '/missions/:missionId/files')[1];

            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: mockMission } }); // Load mission
        });

        it('should return mission files successfully', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await getMissionFilesHandler(mockReq, mockRes);

            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(expect.stringContaining(`/loadData/${MOCK_MISSION_ID}`), expect.any(Object));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ missionId: MOCK_MISSION_ID, files: mockMission.attachedFiles });
        });

        it('should return 500 if Librarian service is not available', async () => {
            mockGetComponentUrl.mockReturnValueOnce(undefined);
            const mockReq = { params: { missionId: MOCK_MISSION_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await getMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Librarian service not available' });
        });

        it('should return 404 if mission not found', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: null } }); // Mission not found
            const mockReq = { params: { missionId: MOCK_MISSION_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await getMissionFilesHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Mission not found' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('Librarian error'));
            const mockReq = { params: { missionId: MOCK_MISSION_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await getMissionFilesHandler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting mission files'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get mission files' });
        });
    });

    describe('downloadMissionFile (GET /missions/:missionId/files/:fileId/download)', () => {
        const MOCK_MISSION_ID = 'mission-123';
        const MOCK_FILE_ID = 'file-id';
        const MOCK_FILE_NAME = 'test.txt';
        const MOCK_MIME_TYPE = 'text/plain';
        const MOCK_FILE_SIZE = 100;
        const MOCK_STORAGE_PATH = '/tmp/file.txt';

        const mockMission = { id: MOCK_MISSION_ID, attachedFiles: [{ id: MOCK_FILE_ID, originalName: MOCK_FILE_NAME, mimeType: MOCK_MIME_TYPE, size: MOCK_FILE_SIZE, storagePath: MOCK_STORAGE_PATH }] };

        let downloadMissionFileHandler: Function;

        beforeEach(() => {
            manager.setupRoutes(mockApp);
            downloadMissionFileHandler = mockApp.get.mock.calls.find(call => call[0] === '/missions/:missionId/files/:fileId/download')[1];

            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: mockMission } }); // Load mission
        });

        it('should download file successfully', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), setHeader: jest.fn(), send: jest.fn() } as any;

            await downloadMissionFileHandler(mockReq, mockRes);

            expect(mockFileUploadServiceInstance.fileExists).toHaveBeenCalledWith(MOCK_STORAGE_PATH);
            expect(mockFileUploadServiceInstance.getFile).toHaveBeenCalledWith(MOCK_FILE_ID, MOCK_STORAGE_PATH);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', MOCK_MIME_TYPE);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="${MOCK_FILE_NAME}"`);
            expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', MOCK_FILE_SIZE.toString());
            expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('file content'));
        });

        it('should return 404 if file not found in mission', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: 'non-existent-file' } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await downloadMissionFileHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found in mission' });
        });

        it('should return 404 if file not found on storage', async () => {
            mockFileUploadServiceInstance.fileExists.mockResolvedValueOnce(false);
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await downloadMissionFileHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found on storage' });
        });

        it('should handle errors', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('Librarian error'));
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await downloadMissionFileHandler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error downloading mission file'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to download file' });
        });
    });

    describe('deleteMissionFile (DELETE /missions/:missionId/files/:fileId)', () => {
        const MOCK_MISSION_ID = 'mission-123';
        const MOCK_FILE_ID = 'file-id';
        const MOCK_FILE_NAME = 'test.txt';
        const MOCK_STORAGE_PATH = '/tmp/file.txt';

        const mockMission = { id: MOCK_MISSION_ID, attachedFiles: [{ id: MOCK_FILE_ID, originalName: MOCK_FILE_NAME, storagePath: MOCK_STORAGE_PATH }] };

        let deleteMissionFileHandler: Function;

        beforeEach(() => {
            manager.setupRoutes(mockApp);
            deleteMissionFileHandler = mockApp.delete.mock.calls.find(call => call[0] === '/missions/:missionId/files/:fileId')[1];

            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: mockMission } }); // Load mission
            mockAuthenticatedApi.post.mockResolvedValueOnce({ status: 200 }); // Store mission
        });

        it('should delete file and update mission successfully', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await deleteMissionFileHandler(mockReq, mockRes);

            expect(mockFileUploadServiceInstance.deleteFile).toHaveBeenCalledWith(MOCK_FILE_ID, MOCK_STORAGE_PATH);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.objectContaining({
                id: MOCK_MISSION_ID,
                collection: 'missions',
                data: expect.objectContaining({ attachedFiles: [] }), // File removed
            }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'File deleted successfully', deletedFile: { id: MOCK_FILE_ID, originalName: MOCK_FILE_NAME } });
        });

        it('should return 404 if file not found in mission', async () => {
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: 'non-existent-file' } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await deleteMissionFileHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found in mission' });
        });

        it('should handle errors during file deletion from storage', async () => {
            mockFileUploadServiceInstance.deleteFile.mockRejectedValueOnce(new Error('Delete failed'));
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await deleteMissionFileHandler(mockReq, mockRes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete file from storage'), expect.any(Error));
            // Should still proceed to update mission
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(expect.stringContaining('/storeData'), expect.any(Object));
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should handle errors during mission update', async () => {
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('Librarian error'));
            const mockReq = { params: { missionId: MOCK_MISSION_ID, fileId: MOCK_FILE_ID } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await deleteMissionFileHandler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error deleting mission file'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to delete file' });
        });
    });
});
