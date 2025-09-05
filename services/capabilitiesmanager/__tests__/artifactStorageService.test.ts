import { ArtifactStorageService, UploadArtifactServiceParams, ArtifactMetadata } from '../src/utils/artifactStorageService';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { generateStructuredError, GlobalErrorCodes, ErrorSeverity } from '../src/utils/errorReporter';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('uuid');
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));

// Cast mocked functions/modules
const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockOs = os as jest.Mocked<typeof os>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockGenerateStructuredError = generateStructuredError as jest.Mock;

describe('ArtifactStorageService', () => {
    let service: ArtifactStorageService;
    const MOCK_BASE_PATH = '/mock/artifacts';
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        mockOs.tmpdir.mockReturnValue('/tmp');
        mockPath.join.mockImplementation((...args) => args.join('/')); // Simplify path joining for mocks
        mockUuidv4.mockReturnValue('mock-artifact-id-1234567890');
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFsPromises.mkdir.mockResolvedValue(undefined);
        mockFsPromises.writeFile.mockResolvedValue(undefined);
        mockFsPromises.readFile.mockResolvedValue('{}');
        mockFsPromises.stat.mockResolvedValue({ size: 100 });
        mockFs.createReadStream.mockReturnValue({ on: jest.fn() });

        // Suppress console logs for cleaner test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        service = new ArtifactStorageService(MOCK_BASE_PATH);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided base path and create directory', () => {
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(MOCK_BASE_PATH, { recursive: true });
            expect((service as any).baseStoragePath).toBe(MOCK_BASE_PATH);
        });

        it('should use ARTIFACT_STORAGE_BASE_PATH from process.env if available', () => {
            process.env.ARTIFACT_STORAGE_BASE_PATH = '/env/artifacts';
            service = new ArtifactStorageService();
            expect((service as any).baseStoragePath).toBe('/env/artifacts');
            expect(mockFs.mkdirSync).toHaveBeenCalledWith('/env/artifacts', { recursive: true });
        });

        it('should use os.tmpdir if no base path provided and no env var', () => {
            delete process.env.ARTIFACT_STORAGE_BASE_PATH;
            service = new ArtifactStorageService();
            expect((service as any).baseStoragePath).toBe('/tmp/cktmcs_artifacts');
            expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/cktmcs_artifacts', { recursive: true });
        });

        it('should throw structured error if base path creation fails', () => {
            mockFs.mkdirSync.mockImplementationOnce(() => { throw new Error('Permission denied'); });
            expect(() => new ArtifactStorageService(MOCK_BASE_PATH)).toThrow('Failed to create or access base storage path at /mock/artifacts/. Check permissions and configuration.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_STORAGE_CONFIG_ERROR,
                severity: ErrorSeverity.CRITICAL,
                message: expect.stringContaining('Failed to create or access base storage path'),
            }));
        });
    });

    describe('uploadArtifact', () => {
        const mockUploadParams: UploadArtifactServiceParams = {
            fileBuffer: Buffer.from('test content'),
            original_filename: 'test.txt',
            mime_type: 'text/plain',
            uploaded_by: 'testuser',
            trace_id: MOCK_TRACE_ID,
        };
        const expectedArtifactId = 'mock-artifact-id-1234567890';
        const expectedNestedPath = '/mock/artifacts/mo/ck/mock-artifact-id-1234567890';
        const expectedFilePath = '/mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat';
        const expectedMetadataPath = '/mock/artifacts/mo/ck/mock-artifact-id-1234567890/metadata.json';

        it('should upload artifact and metadata successfully', async () => {
            const metadata = await service.uploadArtifact(mockUploadParams);

            expect(mockUuidv4).toHaveBeenCalledTimes(2); // One for trace_id, one for artifact_id
            expect(mockFsPromises.mkdir).toHaveBeenCalledWith(expectedNestedPath, { recursive: true });
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(expectedFilePath, mockUploadParams.fileBuffer);
            expect(mockFsPromises.writeFile).toHaveBeenCalledWith(expectedMetadataPath, expect.any(String));

            expect(metadata).toEqual(expect.objectContaining({
                artifact_id: expectedArtifactId,
                original_filename: 'test.txt',
                mime_type: 'text/plain',
                size_bytes: mockUploadParams.fileBuffer.length,
                uploaded_by: 'testuser',
                storage_path: expectedFilePath,
                uploaded_at_utc: expect.any(String),
            }));
        });

        it('should throw structured error if directory creation fails', async () => {
            mockFsPromises.mkdir.mockRejectedValueOnce(new Error('Dir creation failed'));

            await expect(service.uploadArtifact(mockUploadParams)).rejects.toThrow('Failed to create directory for artifact mock-artifact-id-1234567890 at /mock/artifacts/mo/ck/mock-artifact-id-1234567890.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_STORAGE_MKDIR_FAILED,
                message: expect.stringContaining('Failed to create directory'),
            }));
        });

        it('should throw structured error if file write fails', async () => {
            mockFsPromises.writeFile.mockRejectedValueOnce(new Error('File write failed'));

            await expect(service.uploadArtifact(mockUploadParams)).rejects.toThrow('Failed to write artifact file for mock-artifact-id-1234567890 to /mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_STORAGE_UPLOAD_FAILED,
                message: expect.stringContaining('Failed to write artifact file'),
            }));
        });

        it('should throw structured error if metadata write fails and clean up artifact file', async () => {
            mockFsPromises.writeFile.mockResolvedValueOnce(undefined); // File write succeeds
            mockFsPromises.writeFile.mockRejectedValueOnce(new Error('Metadata write failed')); // Metadata write fails
            mockFsPromises.unlink.mockResolvedValueOnce(undefined); // Cleanup succeeds

            await expect(service.uploadArtifact(mockUploadParams)).rejects.toThrow('Failed to write metadata for artifact mock-artifact-id-1234567890. Artifact file was cleaned up.');
            expect(mockFsPromises.unlink).toHaveBeenCalledWith(expectedFilePath);
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_METADATA_WRITE_FAILED,
                message: expect.stringContaining('Failed to write metadata'),
            }));
        });

        it('should throw structured error if artifact ID is too short for nested path', async () => {
            mockUuidv4.mockReturnValueOnce('short'); // Simulate short ID

            await expect(service.uploadArtifact(mockUploadParams)).rejects.toThrow('Failed to generate storage path for artifact short: Artifact ID is too short or invalid for nested path generation.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_STORAGE_INTERNAL_ERROR,
                message: expect.stringContaining('Failed to generate storage path'),
            }));
        });
    });

    describe('getArtifactMetadata', () => {
        const MOCK_ARTIFACT_ID = 'mock-artifact-id-1234567890';
        const expectedNestedPath = '/mock/artifacts/mo/ck/mock-artifact-id-1234567890';
        const expectedMetadataPath = '/mock/artifacts/mo/ck/mock-artifact-id-1234567890/metadata.json';
        const mockMetadata: ArtifactMetadata = {
            artifact_id: MOCK_ARTIFACT_ID,
            original_filename: 'test.txt',
            mime_type: 'text/plain',
            size_bytes: 100,
            uploaded_at_utc: new Date().toISOString(),
            storage_path: '/mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat',
            uploaded_by: 'testuser',
        };

        it('should retrieve artifact metadata successfully', async () => {
            mockFsPromises.readFile.mockResolvedValueOnce(JSON.stringify(mockMetadata));

            const metadata = await service.getArtifactMetadata(MOCK_ARTIFACT_ID, MOCK_TRACE_ID);

            expect(mockFsPromises.stat).toHaveBeenCalledWith(expectedMetadataPath);
            expect(mockFsPromises.readFile).toHaveBeenCalledWith(expectedMetadataPath, 'utf-8');
            expect(metadata).toEqual(mockMetadata);
        });

        it('should return null if metadata file does not exist (ENOENT)', async () => {
            mockFsPromises.stat.mockRejectedValueOnce({ code: 'ENOENT' });

            const metadata = await service.getArtifactMetadata(MOCK_ARTIFACT_ID, MOCK_TRACE_ID);
            expect(metadata).toBeNull();
        });

        it('should throw structured error if stat fails for other reasons', async () => {
            mockFsPromises.stat.mockRejectedValueOnce(new Error('Stat error'));

            await expect(service.getArtifactMetadata(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('Failed to access metadata for artifact mock-artifact-id-1234567890 at /mock/artifacts/mo/ck/mock-artifact-id-1234567890/metadata.json. Error checking file existence.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_METADATA_READ_FAILED,
                message: expect.stringContaining('Failed to access metadata'),
            }));
        });

        it('should throw structured error if metadata file read fails', async () => {
            mockFsPromises.readFile.mockRejectedValueOnce(new Error('Read error'));

            await expect(service.getArtifactMetadata(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('Failed to read metadata for artifact mock-artifact-id-1234567890 from /mock/artifacts/mo/ck/mock-artifact-id-1234567890/metadata.json.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_METADATA_READ_FAILED,
                message: expect.stringContaining('Failed to read metadata'),
            }));
        });

        it('should throw structured error if metadata parsing fails', async () => {
            mockFsPromises.readFile.mockResolvedValueOnce('invalid json');

            await expect(service.getArtifactMetadata(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('Failed to parse metadata for artifact mock-artifact-id-1234567890 from /mock/artifacts/mo/ck/mock-artifact-id-1234567890/metadata.json.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_METADATA_PARSE_FAILED,
                message: expect.stringContaining('Failed to parse metadata'),
            }));
        });

        it('should return null and log warning if artifact ID is too short for nested path', async () => {
            mockUuidv4.mockReturnValueOnce('short'); // Simulate short ID
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const metadata = await service.getArtifactMetadata('short', MOCK_TRACE_ID);
            expect(metadata).toBeNull();
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_ID_INVALID_FORMAT,
                severity: ErrorSeverity.WARNING,
                message: expect.stringContaining('Invalid artifact_id format'),
            }));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('getArtifactReadStream', () => {
        const MOCK_ARTIFACT_ID = 'mock-artifact-id-1234567890';
        const mockMetadata: ArtifactMetadata = {
            artifact_id: MOCK_ARTIFACT_ID,
            original_filename: 'test.txt',
            mime_type: 'text/plain',
            size_bytes: 100,
            uploaded_at_utc: new Date().toISOString(),
            storage_path: '/mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat',
            uploaded_by: 'testuser',
        };

        let getArtifactMetadataSpy: jest.SpyInstance;

        beforeEach(() => {
            getArtifactMetadataSpy = jest.spyOn(service, 'getArtifactMetadata').mockResolvedValue(mockMetadata);
        });

        afterEach(() => {
            getArtifactMetadataSpy.mockRestore();
        });

        it('should return a read stream and metadata successfully', async () => {
            const result = await service.getArtifactReadStream(MOCK_ARTIFACT_ID, MOCK_TRACE_ID);

            expect(getArtifactMetadataSpy).toHaveBeenCalledWith(MOCK_ARTIFACT_ID, MOCK_TRACE_ID);
            expect(mockFsPromises.stat).toHaveBeenCalledWith(mockMetadata.storage_path);
            expect(mockFs.createReadStream).toHaveBeenCalledWith(mockMetadata.storage_path);
            expect(result?.stream).toBeDefined();
            expect(result?.metadata).toEqual(mockMetadata);
        });

        it('should return null if metadata not found', async () => {
            getArtifactMetadataSpy.mockResolvedValueOnce(null);

            const result = await service.getArtifactReadStream(MOCK_ARTIFACT_ID, MOCK_TRACE_ID);
            expect(result).toBeNull();
        });

        it('should throw structured error if artifact file not found despite metadata (ENOENT)', async () => {
            mockFsPromises.stat.mockRejectedValueOnce({ code: 'ENOENT' });

            await expect(service.getArtifactReadStream(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('CRITICAL: Artifact file not found at /mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat for artifact mock-artifact-id-1234567890, but its metadata exists. Data inconsistency.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_NOT_FOUND_DESPITE_METADATA,
                severity: ErrorSeverity.CRITICAL,
            }));
        });

        it('should throw structured error if stat fails for other reasons', async () => {
            mockFsPromises.stat.mockRejectedValueOnce(new Error('Stat error'));

            await expect(service.getArtifactReadStream(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('Failed to access artifact file at /mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat for artifact mock-artifact-id-1234567890. Error checking file existence.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_READ_FAILED,
                message: expect.stringContaining('Failed to access artifact file'),
            }));
        });

        it('should throw structured error if createReadStream fails', async () => {
            mockFs.createReadStream.mockImplementationOnce(() => { throw new Error('Stream creation failed'); });

            await expect(service.getArtifactReadStream(MOCK_ARTIFACT_ID, MOCK_TRACE_ID)).rejects.toThrow('Failed to create read stream for artifact mock-artifact-id-1234567890 at /mock/artifacts/mo/ck/mock-artifact-id-1234567890/artifact.dat.');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.ARTIFACT_FILE_READ_FAILED,
                message: expect.stringContaining('Failed to create read stream'),
            }));
        });
    });
});
