import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

interface MissionFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  storagePath: string;
  description?: string;
}

export class FileManagementTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'FileManagementTool',
      description: 'Manages files within the mission context, allowing reading, writing, appending, listing, and deleting of files stored in the Librarian service.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The file operation to perform.',
            enum: ['read', 'write', 'append', 'list', 'delete'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific file operation.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  /**
   * Reads the content of a file from the Librarian service.
   * Either `filePath` or `fileId` must be provided.
   * @param filePath The path/name of the file within the mission.
   * @param fileId The ID of the file in the Librarian.
   * @param conversationId The ID of the conversation/mission context.
   * @returns A Promise resolving with the file content as a string.
   */
  public async readFile(filePath: string | undefined, fileId: string | undefined, conversationId: string): Promise<string> {
    const payload: { path?: string; fileId?: string; missionId: string } = { missionId: conversationId };
    if (filePath) {
      payload.path = filePath;
    } else if (fileId) {
      payload.fileId = fileId;
    } else {
      throw new Error("Either 'filePath' or 'fileId' must be provided to read a file.");
    }

    const result = await this.execute({ action: 'read', payload }, conversationId);
    // Assuming the FILE_OPERATION plugin returns the content directly in the 'result' field of its output.
    return result.content || '';
  }

  /**
   * Writes content to a file in the Librarian service. If the file exists, it will be overwritten.
   * @param filePath The path/name for the file within the mission.
   * @param content The content to write to the file.
   * @param conversationId The ID of the conversation/mission context.
   * @returns A Promise resolving with metadata about the written file.
   */
  public async writeFile(filePath: string, content: string, conversationId: string): Promise<MissionFile> {
    const payload = { path: filePath, content, missionId: conversationId };
    const result = await this.execute({ action: 'write', payload }, conversationId);
    return result.file;
  }

  /**
   * Appends content to an existing file in the Librarian service. If the file does not exist, it will be created.
   * @param filePath The path/name for the file within the mission.
   * @param content The content to append to the file.
   * @param conversationId The ID of the conversation/mission context.
   * @returns A Promise resolving with metadata about the modified file.
   */
  public async appendFile(filePath: string, content: string, conversationId: string): Promise<MissionFile> {
    const payload = { path: filePath, content, missionId: conversationId };
    const result = await this.execute({ action: 'append', payload }, conversationId);
    return result.file;
  }

  /**
   * Lists all files attached to the current mission.
   * @param conversationId The ID of the conversation/mission context.
   * @returns A Promise resolving with an array of file names.
   */
  public async listFiles(conversationId: string): Promise<string[]> {
    const payload = { missionId: conversationId };
    const result = await this.execute({ action: 'list', payload }, conversationId);
    return result.files;
  }

  /**
   * Deletes a file from the Librarian service.
   * Either `filePath` or `fileId` must be provided.
   * @param filePath The path/name of the file to delete.
   * @param fileId The ID of the file to delete.
   * @param conversationId The ID of the conversation/mission context.
   * @returns A Promise resolving with a status message.
   */
  public async deleteFile(filePath: string | undefined, fileId: string | undefined, conversationId: string): Promise<string> {
    const payload: { path?: string; fileId?: string; missionId: string } = { missionId: conversationId };
    if (filePath) {
      payload.path = filePath;
    } else if (fileId) {
      payload.fileId = fileId;
    } else {
      throw new Error("Either 'filePath' or 'fileId' must be provided to delete a file.");
    }
    const result = await this.execute({ action: 'delete', payload }, conversationId);
    return result.status;
  }
}
