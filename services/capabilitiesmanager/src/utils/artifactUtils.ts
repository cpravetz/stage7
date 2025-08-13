import * as fsPromises from 'fs/promises';
// import * as path from 'path'; // Not strictly needed for this file's logic if filePath is absolute
import { v4 as uuidv4 } from 'uuid';

import { 
    ArtifactStorageService, 
    ArtifactMetadata as ServiceArtifactMetadata // Alias to distinguish from PluginOutput version
} from './artifactStorageService'; 

import { 
    generateStructuredError, 
    ErrorSeverity, 
    GlobalErrorCodes, 
    StructuredError 
} from './errorReporter';

/**
 * Parameters for uploading a file to artifact storage via this utility.
 */
export interface UploadFileParams {
  filePath: string;               // Absolute path to the file to be uploaded.
  original_filename: string;      // Original name of the file (as provided by the plugin or user).
  mime_type: string;              // MIME type of the file.
  uploaded_by: string;            // Identifier of the uploader (e.g., "plugin:[plugin_id]@[plugin_version]").
  description?: string;            // Optional description of the artifact.
  artifact_type_name?: string;     // Optional type name (e.g., 'report', 'dataset', 'log', 'intermediate_file').
  trace_id?: string;               // Optional trace ID for logging and debugging.
}

/**
 * Metadata structure returned to the plugin after successful upload,
 * intended to be part of a plugin's output.
 */
export interface ArtifactMetadataForPluginOutput {
  storage_id: string;             // The artifact_id from ArtifactStorageService.
  filename: string;               // The original_filename provided by the uploader.
  mime_type: string;
  size_bytes: number;
  description?: string;
  artifact_type_name?: string;
  // Note: uploaded_at_utc and full storage_path are in the full ServiceArtifactMetadata
  // but are not directly exposed in this simplified output for plugins.
}

const SOURCE_COMPONENT = "CapabilitiesManager.ArtifactUtils";

/**
 * Reads a file from a local path and uploads it to the ArtifactStorageService.
 * This function is intended for use by plugin executors or capabilities within the CapabilitiesManager
 * to abstract the direct interaction with the ArtifactStorageService.
 * 
 * @param params - The parameters for the file upload.
 * @returns A Promise that resolves to ArtifactMetadataForPluginOutput.
 * @throws {StructuredError} If any step of the process fails (e.g., file reading, service instantiation, upload call).
 */
export async function uploadFileToArtifactStorage(
  params: UploadFileParams
): Promise<ArtifactMetadataForPluginOutput> {
  const trace_id = params.trace_id || uuidv4();
  const operation = "uploadFileToArtifactStorage";

  let artifactStorageService: ArtifactStorageService;
  try {
    // Assumes ArtifactStorageService constructor handles its own base path configuration (e.g., via env vars or defaults).
    artifactStorageService = new ArtifactStorageService(); 
  } catch (error: any) {
    // This error occurs if ArtifactStorageService constructor fails (e.g., base path creation)
    throw generateStructuredError({
      error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, // Or a more specific code like ARTIFACT_SERVICE_INIT_FAILED if added to GlobalErrorCodes
      severity: ErrorSeverity.CRITICAL,
      message: `Failed to instantiate ArtifactStorageService: ${error.message}`,
      source_component: `${SOURCE_COMPONENT}.${operation}`,
      original_error: error,
      trace_id_param: trace_id,
      contextual_info: { detail: "ArtifactStorageService constructor failed during artifact upload process." }
    });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fsPromises.readFile(params.filePath);
  } catch (error: any) {
    throw generateStructuredError({
      error_code: GlobalErrorCodes.FILE_READ_ERROR, 
      severity: ErrorSeverity.ERROR,
      message: `Failed to read file for artifact upload from path: ${params.filePath}. Error: ${error.message}`,
      source_component: `${SOURCE_COMPONENT}.${operation}`,
      original_error: error,
      trace_id_param: trace_id,
      contextual_info: { 
        filePath: params.filePath, 
        original_filename: params.original_filename,
        uploader: params.uploaded_by 
      }
    });
  }

  let serviceMetadata: ServiceArtifactMetadata;
  try {
    serviceMetadata = await artifactStorageService.uploadArtifact({
      fileBuffer,
      original_filename: params.original_filename, // Pass the original filename
      mime_type: params.mime_type,
      uploaded_by: params.uploaded_by,
      trace_id: trace_id, 
    });
  } catch (error: any) {
    // If error is already structured (expected from ArtifactStorageService), re-throw after augmenting source.
    if (error.error_id && error.trace_id) {
        error.source_component = `${SOURCE_COMPONENT}.${operation} (via ${error.source_component})`;
        throw error;
    }
    // Otherwise, wrap it as a new structured error.
    throw generateStructuredError({
      error_code: GlobalErrorCodes.INTERNAL_ERROR_CM, // Or a more specific ARTIFACT_SERVICE_UPLOAD_FAILED
      severity: ErrorSeverity.ERROR,
      message: `ArtifactStorageService failed to upload artifact. Original message: ${error.message}`,
      source_component: `${SOURCE_COMPONENT}.${operation}`,
      original_error: error,
      trace_id_param: trace_id,
      contextual_info: { 
        original_filename: params.original_filename, 
        mime_type: params.mime_type,
        uploader: params.uploaded_by 
      }
    });
  }

  const pluginOutputMetadata: ArtifactMetadataForPluginOutput = {
    storage_id: serviceMetadata.artifact_id,
    filename: serviceMetadata.original_filename, // This is the name as stored by ArtifactStorageService
    mime_type: serviceMetadata.mime_type,
    size_bytes: serviceMetadata.size_bytes,
    description: params.description, 
    artifact_type_name: params.artifact_type_name,
  };

  console.log(`[${trace_id}] ${SOURCE_COMPONENT}.${operation}: Artifact '${pluginOutputMetadata.filename}' (ID: ${pluginOutputMetadata.storage_id}) uploaded successfully by ${params.uploaded_by}.`);
  return pluginOutputMetadata;
}