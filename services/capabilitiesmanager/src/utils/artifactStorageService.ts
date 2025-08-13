import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { generateStructuredError, ErrorSeverity, GlobalErrorCodes, StructuredError } from './errorReporter'; // Adjusted path assuming errorReporter is now saved by user

// TODO: Move these artifact-specific error codes to the shared GlobalErrorCodes in errorReporter.ts
const ArtifactStorageErrorCodes = {
  CONFIG_ERROR: 'ARTIFACT_S001_CONFIG_ERROR',
  MKDIR_FAILED: 'ARTIFACT_S002_MKDIR_FAILED',
  UPLOAD_FAILED: 'ARTIFACT_S003_UPLOAD_FAILED',
  METADATA_WRITE_FAILED: 'ARTIFACT_S004_METADATA_WRITE_FAILED',
  METADATA_NOT_FOUND: 'ARTIFACT_S005_METADATA_NOT_FOUND',
  METADATA_READ_FAILED: 'ARTIFACT_S006_METADATA_READ_FAILED',
  METADATA_PARSE_FAILED: 'ARTIFACT_S007_METADATA_PARSE_FAILED',
  FILE_NOT_FOUND_DESPITE_METADATA: 'ARTIFACT_S008_FILE_NOT_FOUND_DESPITE_METADATA',
  FILE_READ_FAILED: 'ARTIFACT_S009_FILE_READ_FAILED',
  ARTIFACT_ID_TOO_SHORT: 'ARTIFACT_S010_ARTIFACT_ID_TOO_SHORT',
};

export interface UploadArtifactServiceParams {
  fileBuffer: Buffer;
  original_filename: string;
  mime_type: string;
  uploaded_by: string;
  trace_id?: string;
}

export interface ArtifactMetadata {
  artifact_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at_utc: string;
  storage_path: string;
  uploaded_by: string;
  checksums?: {
    sha256?: string;
  };
}

export class ArtifactStorageService {
  private baseStoragePath: string;
  private readonly source_component = "ArtifactStorageService";

  constructor(basePath?: string) {
    this.baseStoragePath = process.env.ARTIFACT_STORAGE_BASE_PATH || basePath || path.join(os.tmpdir(), 'cktmcs_artifacts');

    try {
      fs.mkdirSync(this.baseStoragePath, { recursive: true });
      console.log(`ArtifactStorageService: Base storage path ensured at ${this.baseStoragePath}`);
    } catch (error: any) {
      const structuredError = generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_STORAGE_CONFIG_ERROR || ArtifactStorageErrorCodes.CONFIG_ERROR,
        severity: ErrorSeverity.CRITICAL,
        message: `Failed to create or access base storage path at '${this.baseStoragePath}'. Check permissions and configuration.`,
        source_component: `${this.source_component}.constructor`,
        original_error: error,
      });
      throw new Error(structuredError.message_human_readable);
    }
  }

  private _getNestedStoragePath(artifactId: string): string {
    if (!artifactId || artifactId.length < 4) {
        throw new Error('Artifact ID is too short or invalid for nested path generation.');
    }
    const subDir1 = artifactId.substring(0, 2);
    const subDir2 = artifactId.substring(2, 4);
    return path.join(this.baseStoragePath, subDir1, subDir2, artifactId);
  }

  async uploadArtifact(params: UploadArtifactServiceParams): Promise<ArtifactMetadata> {
    const trace_id = params.trace_id || uuidv4();
    const artifact_id = uuidv4();
    let nestedPath: string;

    try {
        nestedPath = this._getNestedStoragePath(artifact_id);
    } catch (pathError: any) {
        throw generateStructuredError({
            error_code: GlobalErrorCodes.ARTIFACT_STORAGE_INTERNAL_ERROR || ArtifactStorageErrorCodes.ARTIFACT_ID_TOO_SHORT,
            severity: ErrorSeverity.ERROR,
            message: `Failed to generate storage path for artifact ${artifact_id}: ${pathError.message}`,
            source_component: `${this.source_component}.uploadArtifact`,
            original_error: pathError,
            trace_id_param: trace_id,
            contextual_info: { artifact_id }
        });
    }

    const filePathInStorage = path.join(nestedPath, 'artifact.dat');

    try {
      await fsPromises.mkdir(nestedPath, { recursive: true });
    } catch (error: any) {
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_STORAGE_MKDIR_FAILED || ArtifactStorageErrorCodes.MKDIR_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to create directory for artifact ${artifact_id} at ${nestedPath}.`,
        source_component: `${this.source_component}.uploadArtifact`,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, nestedPath }
      });
    }

    try {
      await fsPromises.writeFile(filePathInStorage, params.fileBuffer);
    } catch (error: any) {
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_STORAGE_UPLOAD_FAILED || ArtifactStorageErrorCodes.UPLOAD_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to write artifact file for ${artifact_id} to ${filePathInStorage}.`,
        source_component: `${this.source_component}.uploadArtifact`,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, filePathInStorage }
      });
    }

    const metadata: ArtifactMetadata = {
      artifact_id,
      original_filename: params.original_filename,
      mime_type: params.mime_type,
      size_bytes: params.fileBuffer.length,
      uploaded_at_utc: new Date().toISOString(),
      storage_path: filePathInStorage,
      uploaded_by: params.uploaded_by,
    };

    const metadataFilePath = path.join(nestedPath, 'metadata.json');
    try {
      await fsPromises.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));
    } catch (error: any) {
      try { await fsPromises.unlink(filePathInStorage); } catch (cleanupError) { console.error(`[${trace_id}] Failed to cleanup artifact file ${filePathInStorage} after metadata write failure:`, cleanupError); }
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_FILE_METADATA_WRITE_FAILED || ArtifactStorageErrorCodes.METADATA_WRITE_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to write metadata for artifact ${artifact_id}. Artifact file was cleaned up.`,
        source_component: `${this.source_component}.uploadArtifact`,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, metadataFilePath }
      });
    }

    console.log(`[${trace_id}] Artifact ${artifact_id} uploaded successfully by ${params.uploaded_by}. Path: ${filePathInStorage}`);
    return metadata;
  }

  async getArtifactMetadata(artifact_id: string, trace_id_param?: string): Promise<ArtifactMetadata | null> {
    const trace_id = trace_id_param || uuidv4();
    let nestedPath;
    try {
        nestedPath = this._getNestedStoragePath(artifact_id);
    } catch (pathError: any) {
        generateStructuredError({
            error_code: GlobalErrorCodes.ARTIFACT_ID_INVALID_FORMAT || ArtifactStorageErrorCodes.ARTIFACT_ID_TOO_SHORT,
            severity: ErrorSeverity.WARNING,
            message: `Invalid artifact_id format for metadata lookup: ${artifact_id}. ${pathError.message}`,
            source_component: `${this.source_component}.getArtifactMetadata`,
            original_error: pathError,
            trace_id_param: trace_id,
            contextual_info: { artifact_id }
        });
        return null;
    }
    const metadataFilePath = path.join(nestedPath, 'metadata.json');

    try {
      await fsPromises.stat(metadataFilePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_FILE_METADATA_READ_FAILED || ArtifactStorageErrorCodes.METADATA_READ_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to access metadata for artifact ${artifact_id} at ${metadataFilePath}. Error checking file existence.`,
        source_component: `${this.source_component}.getArtifactMetadata`,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, metadataFilePath }
      });
    }

    try {
      const metadataContent = await fsPromises.readFile(metadataFilePath, 'utf-8');
      return JSON.parse(metadataContent) as ArtifactMetadata;
    } catch (error: any) {
      const isParseError = error instanceof SyntaxError;
      throw generateStructuredError({
        error_code: isParseError ? (GlobalErrorCodes.ARTIFACT_METADATA_PARSE_FAILED || ArtifactStorageErrorCodes.METADATA_PARSE_FAILED) : (GlobalErrorCodes.ARTIFACT_FILE_METADATA_READ_FAILED || ArtifactStorageErrorCodes.METADATA_READ_FAILED),
        severity: ErrorSeverity.ERROR,
        message: `Failed to ${isParseError ? 'parse' : 'read'} metadata for artifact ${artifact_id} from ${metadataFilePath}.`,
        source_component: `${this.source_component}.getArtifactMetadata`,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, metadataFilePath }
      });
    }
  }

  async getArtifactReadStream(artifact_id: string, trace_id_param?: string): Promise<{ stream: fs.ReadStream, metadata: ArtifactMetadata } | null> {
    const trace_id = trace_id_param || uuidv4();
    const source_component_stream = `${this.source_component}.getArtifactReadStream`;

    const metadata = await this.getArtifactMetadata(artifact_id, trace_id);
    if (!metadata) {
      return null;
    }

    try {
      await fsPromises.stat(metadata.storage_path);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw generateStructuredError({
          error_code: GlobalErrorCodes.ARTIFACT_FILE_NOT_FOUND_DESPITE_METADATA || ArtifactStorageErrorCodes.FILE_NOT_FOUND_DESPITE_METADATA,
          severity: ErrorSeverity.CRITICAL,
          message: `CRITICAL: Artifact file not found at ${metadata.storage_path} for artifact ${artifact_id}, but its metadata exists. Data inconsistency.`,
          source_component: source_component_stream,
          original_error: error,
          trace_id_param: trace_id,
          contextual_info: { artifact_id, storage_path: metadata.storage_path }
        });
      }
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_FILE_READ_FAILED || ArtifactStorageErrorCodes.FILE_READ_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to access artifact file at ${metadata.storage_path} for artifact ${artifact_id}. Error checking file existence.`,
        source_component: source_component_stream,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, storage_path: metadata.storage_path }
      });
    }

    try {
      const stream = fs.createReadStream(metadata.storage_path);
      stream.on('error', (err) => {
        console.error(`[${trace_id}] Error on read stream for artifact ${artifact_id}:`, err);
      });
      return { stream, metadata };
    } catch (error: any) {
      throw generateStructuredError({
        error_code: GlobalErrorCodes.ARTIFACT_FILE_READ_FAILED || ArtifactStorageErrorCodes.FILE_READ_FAILED,
        severity: ErrorSeverity.ERROR,
        message: `Failed to create read stream for artifact ${artifact_id} at ${metadata.storage_path}.`,
        source_component: source_component_stream,
        original_error: error,
        trace_id_param: trace_id,
        contextual_info: { artifact_id, storage_path: metadata.storage_path }
      });
    }
  }
}