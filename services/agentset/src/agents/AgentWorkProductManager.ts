import { Step } from './Step';
import { PluginOutput, PluginParameterType, OutputType, MissionFile, MessageType, BaseEntity, MapSerializer } from '@cktmcs/shared';
import { WorkProduct } from '../utils/WorkProduct';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handles work product saving, classification, and sharing for agents
 */
export class AgentWorkProductManager {
    private agentId: string;
    private missionId: string;
    private baseEntity: BaseEntity;
    private agentPersistenceManager: any;

    constructor(agentId: string, missionId: string, baseEntity: BaseEntity, agentPersistenceManager: any) {
        this.agentId = agentId;
        this.missionId = missionId;
        this.baseEntity = baseEntity;
        this.agentPersistenceManager = agentPersistenceManager;
    }

    /**
     * Saves work product with proper classification and sharing
     */
    async saveWorkProductWithClassification(stepId: string, data: PluginOutput[], isAgentEndpoint: boolean, allSteps: Step[]): Promise<void> {
        if (!data || data.length === 0) {
            console.log(`Agent ${this.agentId}: No data to save for step ${stepId}.`);
            return;
        }

        const serializedData = MapSerializer.transformForSerialization(data);
        const workProduct = new WorkProduct(this.agentId, stepId, serializedData);
        
        try {
            await this.agentPersistenceManager.saveWorkProduct(workProduct);

            const step = allSteps.find(s => s.id === stepId);
            if (!step) {
                console.error(`Step with id ${stepId} not found in agent ${this.agentId}`);
                return;
            }

            const outputType = step.getOutputType(allSteps);
            const type = outputType === OutputType.FINAL ? 'Final' : outputType === OutputType.PLAN ? 'Plan' : 'Interim';
            console.log(`Agent ${this.agentId}: Step ${stepId} outputType=${outputType}, type=${type}, step.result=${JSON.stringify(step.result?.map(r => ({name: r.name, resultType: r.resultType})))}`);

            let scope: string;
            if (isAgentEndpoint) {
                scope = 'AgentOutput';
            } else {
                scope = 'AgentStep';
            }

            // Upload outputs to shared file space for Final steps AND steps that generate user-referenced data
            const shouldUploadToSharedSpace = (outputType === 'Final' && data && data.length > 0) ||
                (data && data.length > 0 && this.stepGeneratesUserReferencedData(stepId, data, allSteps));

            if (shouldUploadToSharedSpace) {
                try {
                    const librarianUrl = await this.baseEntity.getServiceUrl('Librarian');
                    if (librarianUrl) {
                        const uploadedFiles = await this.uploadStepOutputsToSharedSpace(
                            step,
                            librarianUrl
                        );
                        if (uploadedFiles.length > 0) {
                            console.log(`Uploaded ${uploadedFiles.length} final step outputs to shared space for step ${stepId}`);
                        }
                    } else {
                        console.warn('Librarian URL not available for uploading final step outputs');
                    }
                } catch (error) {
                    console.error('Error uploading final step outputs to shared space:', error);
                    // Don't fail the entire operation if file upload fails
                }
            }

            const workProductPayload = {
                id: stepId,
                type: type,
                scope: scope,
                name: data[0] ? data[0].resultDescription : 'Step Output',
                agentId: this.agentId,
                stepId: stepId,
                missionId: this.missionId,
                mimeType: data[0]?.mimeType || 'text/plain',
                fileName: data[0]?.fileName,
                workproduct: (type === 'Plan' && data[0]?.result) ?
                    `Plan with ${Array.isArray(data[0].result) ? data[0].result.length : Object.keys(data[0].result).length} steps` : data[0]?.result     
            };
            console.log('[AgentWorkProductManager] WORK_PRODUCT_UPDATE payload:', JSON.stringify(workProductPayload, null, 2));

            this.baseEntity.sendMessage(MessageType.WORK_PRODUCT_UPDATE, 'user', workProductPayload);
        } catch (error) {
            console.error('Error saving work product:', error instanceof Error ? error.message : error);
        }
    }

    /**
     * Uploads step outputs to the shared file space for final steps
     */
    private async uploadStepOutputsToSharedSpace(
        step: Step,
        librarianUrl: string
    ): Promise<MissionFile[]> {
        if (!step.result || step.result.length === 0) {
            return [];
        }

        const uploadedFiles: MissionFile[] = [];

        for (const output of step.result) {
            try {
                // Only upload outputs that have meaningful content
                if (!output.result || output.result === '') {
                    continue;
                }

                // Generate filename based on step and output
                let fileName: string;
                let mimeType: string;
                let fileContent: string;

                if (output.fileName) {
                    // If output specifies a filename, use it
                    fileName = output.fileName;
                } else {
                    // Generate filename based on step and output
                    const sanitizedName = output.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const extension = this.getFileExtensionForOutput(output);
                    fileName = `step_${step.stepNo}_${sanitizedName}${extension}`;
                }

                // Set MIME type
                mimeType = output.mimeType || this.getMimeTypeForOutput(output);

                // Convert result to string content
                if (typeof output.result === 'string') {
                    fileContent = output.result;
                } else {
                    // For objects, serialize to JSON
                    fileContent = JSON.stringify(output.result, null, 2);
                    if (!fileName.endsWith('.json')) {
                        fileName = fileName.replace(/\.[^.]*$/, '') + '.json';
                    }
                    mimeType = 'application/json';
                }

                // Create a MissionFile object
                const missionFile: MissionFile = {
                    id: uuidv4(),
                    originalName: fileName,
                    mimeType: mimeType,
                    size: Buffer.byteLength(fileContent, 'utf8'),
                    uploadedAt: new Date(),
                    uploadedBy: `agent-${this.agentId}`,
                    storagePath: `step-outputs/${this.missionId}/${fileName}`,
                    description: `Output from step ${step.stepNo}: ${step.actionVerb} - ${output.resultDescription}`
                };

                // Store the file content in Librarian
                await this.baseEntity.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                    id: `step-output-${step.id}-${output.name}`,
                    data: {
                        fileContent: fileContent,
                        missionFile: missionFile
                    },
                    storageType: 'mongo',
                    collection: 'step-outputs'
                });

                // Load the current mission to update its attached files
                const missionResponse = await this.baseEntity.authenticatedApi.get(`http://${librarianUrl}/loadData/${this.missionId}`, {
                    params: { collection: 'missions', storageType: 'mongo' }
                });

                if (missionResponse.data && missionResponse.data.data) {
                    const mission = missionResponse.data.data;
                    const existingFiles = mission.attachedFiles || [];
                    const updatedMission = {
                        ...mission,
                        attachedFiles: [...existingFiles, missionFile],
                        updatedAt: new Date()
                    };

                    // Save the updated mission
                    await this.baseEntity.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                        id: this.missionId,
                        data: updatedMission,
                        collection: 'missions',
                        storageType: 'mongo'
                    });

                    uploadedFiles.push(missionFile);
                    console.log(`Uploaded step output to shared space: ${fileName}`);
                }

            } catch (error) {
                console.error(`Failed to upload step output to shared space:`, error);
                // Continue with other outputs even if one fails
            }
        }

        // Notify frontend about shared files update if any files were uploaded
        if (uploadedFiles.length > 0) {
            try {
                // Get all mission files to send complete list to frontend
                const missionResponse = await this.baseEntity.authenticatedApi.get(`http://${librarianUrl}/loadData/${this.missionId}`, {
                    params: { collection: 'missions', storageType: 'mongo' }
                });

                if (missionResponse.data && missionResponse.data.data) {
                    const mission = missionResponse.data.data;
                    const allFiles = mission.attachedFiles || [];
                    
                    // Send shared files update to frontend
                    this.baseEntity.sendMessage(MessageType.SHARED_FILES_UPDATE, 'user', {
                        missionId: this.missionId,
                        files: allFiles,
                        newFiles: uploadedFiles
                    });
                    
                    console.log(`Notified frontend about ${uploadedFiles.length} new shared files`);
                }
            } catch (notifyError) {
                console.error('Failed to notify frontend about shared files update:', notifyError);
                // Don't fail the operation if notification fails
            }
        }

        return uploadedFiles;
    }

    /**
     * Determines if a step generates data that will be referenced by user-facing steps
     */
    private stepGeneratesUserReferencedData(stepId: string, data: PluginOutput[], allSteps: Step[]): boolean {
        // Check if any future ASK_USER_QUESTION steps reference this step's outputs
        const futureAskSteps = allSteps.filter(step =>
            step.actionVerb === 'ASK_USER_QUESTION' &&
            step.dependencies.some(dep => dep.sourceStepId === stepId)
        );

        if (futureAskSteps.length > 0) {
            console.log(`Step ${stepId} generates user-referenced data (referenced by ${futureAskSteps.length} ASK_USER_QUESTION steps)`);
            return true;
        }

        // Check if the data contains file-like content
        const hasFileContent = data.some(output =>
            output.fileName ||
            output.mimeType ||
            (typeof output.result === 'string' && output.result.length > 500)
        );

        if (hasFileContent) {
            console.log(`Step ${stepId} generates user-referenced data (contains file-like content)`);
            return true;
        }

        return false;
    }

    private getFileExtensionForOutput(output: PluginOutput): string {
        if (output.mimeType) {
            switch (output.mimeType) {
                case 'text/plain': return '.txt';
                case 'application/json': return '.json';
                case 'text/html': return '.html';
                case 'text/markdown': return '.md';
                case 'text/csv': return '.csv';
                default: return '.txt';
            }
        }

        if (output.resultType === PluginParameterType.JSON) {
            return '.json';
        }

        return '.txt';
    }

    private getMimeTypeForOutput(output: PluginOutput): string {
        if (output.resultType === PluginParameterType.JSON) {
            return 'application/json';
        }
        if (output.fileName || output.mimeType) {
            return 'application/octet-stream';
        }
        return 'text/plain';
    }
}
