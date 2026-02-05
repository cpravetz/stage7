import { ExceptionHandlerWrapper, ErrorSeverity } from '../errorhandler/src/index';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Example demonstrating integration of the centralized exception handling
 * with the ArtifactStorageService.
 */

export class EnhancedArtifactStorageService {
    private baseStoragePath: string;
    private readonly source_component = "EnhancedArtifactStorageService";

    constructor(basePath?: string) {
        this.baseStoragePath = process.env.ARTIFACT_STORAGE_BASE_PATH || basePath || path.join(os.tmpdir(), 'cktmcs_artifacts');

        // Use exception handler wrapper for initialization
        ExceptionHandlerWrapper.wrapSyncOperation(
            'initializeStorage',
            this.source_component,
            () => {
                fs.mkdirSync(this.baseStoragePath, { recursive: true });
                console.log(`ArtifactStorageService: Base storage path ensured at ${this.baseStoragePath}`);
            },
            ErrorSeverity.ERROR,
            'ARTIFACT_STORAGE_CONFIG_ERROR'
        );
    }

    private _getNestedStoragePath(artifactId: string): string {
        return ExceptionHandlerWrapper.wrapSyncOperation(
            'generateNestedPath',
            this.source_component,
            () => {
                if (!artifactId || artifactId.length < 4) {
                    throw new Error('Artifact ID is too short or invalid for nested path generation.');
                }
                const subDir1 = artifactId.substring(0, 2);
                const subDir2 = artifactId.substring(2, 4);
                return path.join(this.baseStoragePath, subDir1, subDir2, artifactId);
            },
            ErrorSeverity.ERROR,
            'ARTIFACT_ID_INVALID_FORMAT'
        );
    }

    async uploadArtifact(fileBuffer: Buffer, original_filename: string, mime_type: string, uploaded_by: string): Promise<any> {
        const trace_id = uuidv4();
        const artifact_id = uuidv4();

        return ExceptionHandlerWrapper.wrapAsyncOperation(
            'uploadArtifact',
            this.source_component,
            async () => {
                // Get nested storage path
                const nestedPath = this._getNestedStoragePath(artifact_id);
                const filePathInStorage = path.join(nestedPath, 'artifact.dat');

                // Create directory
                await fsPromises.mkdir(nestedPath, { recursive: true });

                // Write file
                await fsPromises.writeFile(filePathInStorage, fileBuffer);

                // Create metadata
                const metadata = {
                    artifact_id,
                    original_filename,
                    mime_type,
                    size_bytes: fileBuffer.length,
                    uploaded_at_utc: new Date().toISOString(),
                    storage_path: filePathInStorage,
                    uploaded_by,
                };

                const metadataFilePath = path.join(nestedPath, 'metadata.json');
                await fsPromises.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));

                console.log(`[${trace_id}] Artifact ${artifact_id} uploaded successfully by ${uploaded_by}. Path: ${filePathInStorage}`);
                return metadata;
            },
            ErrorSeverity.ERROR,
            'ARTIFACT_STORAGE_UPLOAD_FAILED',
            { artifact_id, uploaded_by, trace_id }
        );
    }

    async getArtifactMetadata(artifact_id: string): Promise<any | null> {
        const trace_id = uuidv4();

        return ExceptionHandlerWrapper.wrapAsyncOperation(
            'getArtifactMetadata',
            this.source_component,
            async () => {
                const nestedPath = this._getNestedStoragePath(artifact_id);
                const metadataFilePath = path.join(nestedPath, 'metadata.json');

                // Check if metadata file exists
                try {
                    await fsPromises.stat(metadataFilePath);
                } catch (error: any) {
                    if (error.code === 'ENOENT') {
                        return null; // File doesn't exist
                    }
                    throw error; // Other errors should be handled by the wrapper
                }

                // Read and parse metadata
                const metadataContent = await fsPromises.readFile(metadataFilePath, 'utf-8');
                return JSON.parse(metadataContent);
            },
            ErrorSeverity.ERROR,
            'ARTIFACT_FILE_METADATA_READ_FAILED',
            { artifact_id, trace_id }
        );
    }

    async getArtifactReadStream(artifact_id: string): Promise<{ stream: fs.ReadStream, metadata: any } | null> {
        const trace_id = uuidv4();

        return ExceptionHandlerWrapper.wrapAsyncOperation(
            'getArtifactReadStream',
            this.source_component,
            async () => {
                const metadata = await this.getArtifactMetadata(artifact_id);
                if (!metadata) {
                    return null;
                }

                // Check if artifact file exists
                try {
                    await fsPromises.stat(metadata.storage_path);
                } catch (error: any) {
                    if (error.code === 'ENOENT') {
                        throw new Error(`CRITICAL: Artifact file not found at ${metadata.storage_path} for artifact ${artifact_id}, but its metadata exists. Data inconsistency.`);
                    }
                    throw error;
                }

                // Create read stream
                const stream = fs.createReadStream(metadata.storage_path);
                stream.on('error', (err) => {
                    console.error(`[${trace_id}] Error on read stream for artifact ${artifact_id}:`, err);
                    
                    // Handle stream errors with exception handler
                    ExceptionHandlerWrapper.handleException({
                        error: err,
                        component: this.source_component,
                        operation: 'streamRead',
                        severity: ErrorSeverity.ERROR,
                        errorCode: 'ARTIFACT_FILE_READ_FAILED',
                        contextualData: { artifact_id, storage_path: metadata.storage_path, trace_id }
                    }).catch(console.error);
                });

                return { stream, metadata };
            },
            ErrorSeverity.ERROR,
            'ARTIFACT_FILE_READ_FAILED',
            { artifact_id, trace_id }
        );
    }

    // Example of handling a specific error scenario
    async handleCorruptedMetadata(artifact_id: string): Promise<void> {
        const trace_id = uuidv4();

        try {
            const metadata = await this.getArtifactMetadata(artifact_id);
            
            // Simulate detection of corrupted metadata
            if (metadata && !metadata.artifact_id) {
                throw new Error('Corrupted metadata: missing required artifact_id field');
            }
            
        } catch (error) {
            // Use direct exception handling for more control
            const result = await ExceptionHandlerWrapper.handleException({
                error,
                component: this.source_component,
                operation: 'handleCorruptedMetadata',
                severity: ErrorSeverity.ERROR,
                errorCode: 'ARTIFACT_METADATA_PARSE_FAILED',
                contextualData: {
                    artifact_id,
                    trace_id,
                    recoveryAttempt: 'metadataValidation'
                }
            });

            if (!result.handled) {
                console.error(`[${trace_id}] Failed to handle corrupted metadata for artifact ${artifact_id}`);
                throw new Error(`Metadata handling failed: ${result.errorDetails?.message_human_readable}`);
            }

            console.log(`[${trace_id}] Handled corrupted metadata using strategy: ${result.strategyUsed}`);
        }
    }
}

// Demonstration of the enhanced artifact storage service
async function demonstrateEnhancedArtifactStorage() {
    console.log('=== Demonstrating Enhanced Artifact Storage Service ===\n');

    const storageService = new EnhancedArtifactStorageService();

    try {
        // Test upload
        console.log('Testing artifact upload...');
        const testBuffer = Buffer.from('Hello, this is a test artifact!');
        const metadata = await storageService.uploadArtifact(
            testBuffer,
            'test.txt',
            'text/plain',
            'test-user'
        );
        console.log('Upload successful:', metadata.artifact_id);

        // Test metadata retrieval
        console.log('\nTesting metadata retrieval...');
        const retrievedMetadata = await storageService.getArtifactMetadata(metadata.artifact_id);
        console.log('Metadata retrieval successful:', retrievedMetadata ? 'Found' : 'Not found');

        // Test read stream
        console.log('\nTesting read stream...');
        const readResult = await storageService.getArtifactReadStream(metadata.artifact_id);
        if (readResult) {
            console.log('Read stream created successfully');
            readResult.stream.close(); // Close the stream for this demo
        }

        // Test error handling
        console.log('\nTesting error handling with invalid artifact ID...');
        try {
            await storageService.getArtifactMetadata('invalid-id');
        } catch (error) {
            console.log('Error handled gracefully:', error.message);
        }

        // Test corrupted metadata handling
        console.log('\nTesting corrupted metadata handling...');
        await storageService.handleCorruptedMetadata(metadata.artifact_id);

    } catch (error) {
        console.error('Service demonstration failed:', error);
    }

    console.log('\n=== Enhanced Artifact Storage Service Demonstration Complete ===');
}

// Run the demonstration
demonstrateEnhancedArtifactStorage().catch(console.error);