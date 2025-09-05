import { uploadFileToArtifactStorage, UploadFileParams, ArtifactMetadataForPluginOutput } from '../src/utils/artifactUtils';
import { ArtifactStorageService, ArtifactMetadata as ServiceArtifactMetadata } from '../src/utils/artifactStorageService';
import * as fsPromises from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { generateStructuredError, GlobalErrorCodes, ErrorSeverity, StructuredError } from '../src/utils/errorReporter';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('uuid');
jest.mock('../src/utils/artifactStorageService');
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
    StructuredError: jest.requireActual('../src/utils/errorReporter').StructuredError,
}));

// Cast mocked functions/modules
const mockFsPromisesReadFile = fsPromises.readFile as jest.Mock;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockArtifactStorageService = ArtifactStorageService as jest.MockedClass<typeof ArtifactStorageService>;
const mockGenerateStructuredError = generateStructuredError as jest.Mock;

describe('artifactUtils', () => {
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        mockUuidv4.mockReturnValue('mock-uuid');
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Default mock for ArtifactStorageService constructor and uploadArtifact
        mockArtifactStorageService.mockImplementation(() => ({
            uploadArtifact: jest.fn().mockResolvedValue({
                artifact_id: 'mock-artifact-id',
                original_filename: 'mock.txt',
                mime_type: 'text/plain',
                size_bytes: 10,
                uploaded_at_utc: new Date().toISOString(),
                storage_path: '/mock/path',
                uploaded_by: 'testuser',
            } as ServiceArtifactMetadata),
        } as any));
        mockFsPromisesReadFile.mockResolvedValue(Buffer.from('file content'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('uploadFileToArtifactStorage', () => {
        const mockUploadParams: UploadFileParams = {
            filePath: '/path/to/file.txt',
            original_filename: 'my_document.txt',
            mime_type: 'text/plain',
            uploaded_by: 'plugin:test-plugin',
            description: 'A test document',
            artifact_type_name: 'document',
            trace_id: MOCK_TRACE_ID,
        };

        it('should successfully upload a file and return artifact metadata', async () => {
            const result = await uploadFileToArtifactStorage(mockUploadParams);

            expect(mockArtifactStorageService).toHaveBeenCalledTimes(1);
            expect(mockFsPromisesReadFile).toHaveBeenCalledWith(mockUploadParams.filePath);
            expect(mockArtifactStorageService.mock.results[0].value.uploadArtifact).toHaveBeenCalledWith(expect.objectContaining({
                fileBuffer: Buffer.from('file content'),
                original_filename: mockUploadParams.original_filename,
                mime_type: mockUploadParams.mime_type,
                uploaded_by: mockUploadParams.uploaded_by,
                trace_id: MOCK_TRACE_ID,
            }));

            expect(result).toEqual({
                storage_id: 'mock-artifact-id',
                filename: 'mock.txt',
                mime_type: 'text/plain',
                size_bytes: 10,
                description: 'A test document',
                artifact_type_name: 'document',
            });
        });

        it('should generate a trace_id if not provided', async () => {
            const paramsWithoutTraceId = { ...mockUploadParams, trace_id: undefined };
            mockUuidv4.mockReturnValueOnce('generated-uuid');

            await uploadFileToArtifactStorage(paramsWithoutTraceId);

            expect(mockArtifactStorageService.mock.results[0].value.uploadArtifact).toHaveBeenCalledWith(expect.objectContaining({
                trace_id: 'generated-uuid',
            }));
        });

        it('should throw structured error if ArtifactStorageService constructor fails', async () => {
            mockArtifactStorageService.mockImplementationOnce(() => {
                throw new Error('Service init failed');
            });

            await expect(uploadFileToArtifactStorage(mockUploadParams)).rejects.toThrow('Failed to instantiate ArtifactStorageService: Service init failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.CRITICAL,
                message: expect.stringContaining('Failed to instantiate ArtifactStorageService'),
            }));
        });

        it('should throw structured error if file reading fails', async () => {
            mockFsPromisesReadFile.mockRejectedValueOnce(new Error('File read error'));

            await expect(uploadFileToArtifactStorage(mockUploadParams)).rejects.toThrow('Failed to read file for artifact upload from path: /path/to/file.txt. Error: File read error');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.FILE_READ_ERROR,
                severity: ErrorSeverity.ERROR,
                message: expect.stringContaining('Failed to read file for artifact upload'),
            }));
        });

        it('should re-throw structured error from ArtifactStorageService.uploadArtifact', async () => {
            const mockServiceError: StructuredError = {
                error_id: 'service-err',
                trace_id: MOCK_TRACE_ID,
                timestamp_utc: new Date().toISOString(),
                error_code: GlobalErrorCodes.ARTIFACT_STORAGE_UPLOAD_FAILED,
                severity: ErrorSeverity.ERROR,
                message_human_readable: 'Service upload failed',
                source_component: 'ArtifactStorageService.uploadArtifact',
                contextual_info: {},
            };
            mockArtifactStorageService.mock.results[0].value.uploadArtifact.mockRejectedValueOnce(mockServiceError);

            await expect(uploadFileToArtifactStorage(mockUploadParams)).rejects.toThrow('Service upload failed');
            // Ensure the source_component is augmented
            expect(mockServiceError.source_component).toContain('CapabilitiesManager.ArtifactUtils.uploadFileToArtifactStorage (via ArtifactStorageService.uploadArtifact)');
        });

        it('should wrap unstructured error from ArtifactStorageService.uploadArtifact', async () => {
            mockArtifactStorageService.mock.results[0].value.uploadArtifact.mockRejectedValueOnce(new Error('Unstructured service error'));

            await expect(uploadFileToArtifactStorage(mockUploadParams)).rejects.toThrow('ArtifactStorageService failed to upload artifact. Original message: Unstructured service error');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                severity: ErrorSeverity.ERROR,
                message: expect.stringContaining('ArtifactStorageService failed to upload artifact'),
            }));
        });
    });
});
