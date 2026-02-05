import { Tool, HttpCoreEngineClient, JsonSchema, CloudSpend } from '../../index';


export class AzureTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'AzureTool',
            description: 'Manages and retrieves information from Microsoft Azure, including cost analysis and resource status.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with Azure.',
                        enum: ['getCloudSpend', 'getResourceStatus'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific Azure action.',
                        properties: {
                            period: {
                                type: 'string',
                                description: 'The time period for cost analysis (e.g., "MONTHLY", "DAILY").',
                                enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
                            },
                            resourceType: {
                                type: 'string',
                                description: 'The type of Azure resource to get status for (e.g., "VirtualMachine", "StorageAccount").',
                            },
                        },
                    },
                },
                required: ['action'],
            } as JsonSchema,
            coreEngineClient: client,
        });
    }

    /**
     * Retrieves Azure cloud spend data.
     * @param period The time period for cost analysis (e.g., "MONTHLY", "DAILY").
     * @param conversationId The ID of the conversation context.
     * @returns Azure cloud spend data.
     */
    public async getCloudSpend(period: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY', conversationId?: string): Promise<CloudSpend> {
        const result = await this.execute({ action: 'getCloudSpend', payload: { period } }, conversationId);
        return result.cloudSpend || {};
    }

    /**
     * Retrieves the status of a specific Azure resource type.
     * @param resourceType The type of Azure resource to get status for (e.g., "VirtualMachine", "StorageAccount").
     * @param conversationId The ID of the conversation context.
     * @returns Resource status information.
     */
    public async getResourceStatus(resourceType: string, conversationId?: string): Promise<any> {
        const result = await this.execute({ action: 'getResourceStatus', payload: { resourceType } }, conversationId);
        return result.resourceStatus || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: AzureTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getCloudSpend') {
            return {
                cloudSpend: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [
                      { label: 'This Year', data: [9000, 9500, 10000, 9800, 10500, 10700], color: '#0078d4' },
                      { label: 'Last Year', data: [7000, 7200, 7500, 7300, 7800, 8000], color: '#a8a8a8' },
                    ],
                }
            };
        } else if (args.action === 'getResourceStatus') {
            return {
                resourceStatus: {
                    resourceType: args.payload.resourceType,
                    count: 40,
                    running: 38,
                    stopped: 2,
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
