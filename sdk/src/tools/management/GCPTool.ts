import { Tool, HttpCoreEngineClient, JsonSchema, CloudSpend } from '../../index';


export class GCPTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'GCPTool',
            description: 'Manages and retrieves information from Google Cloud Platform (GCP), including cost analysis and resource status.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with GCP.',
                        enum: ['getCloudSpend', 'getResourceStatus'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific GCP action.',
                        properties: {
                            period: {
                                type: 'string',
                                description: 'The time period for cost analysis (e.g., "MONTHLY", "DAILY").',
                                enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
                            },
                            resourceType: {
                                type: 'string',
                                description: 'The type of GCP resource to get status for (e.g., "ComputeEngine", "CloudStorage").',
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
     * Retrieves GCP cloud spend data.
     * @param period The time period for cost analysis (e.g., "MONTHLY", "DAILY").
     * @param conversationId The ID of the conversation context.
     * @returns GCP cloud spend data.
     */
    public async getCloudSpend(period: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY', conversationId?: string): Promise<CloudSpend> {
        const result = await this.execute({ action: 'getCloudSpend', payload: { period } }, conversationId);
        return result.cloudSpend || {};
    }

    /**
     * Retrieves the status of a specific GCP resource type.
     * @param resourceType The type of GCP resource to get status for (e.g., "ComputeEngine", "CloudStorage").
     * @param conversationId The ID of the conversation context.
     * @returns Resource status information.
     */
    public async getResourceStatus(resourceType: string, conversationId?: string): Promise<any> {
        const result = await this.execute({ action: 'getResourceStatus', payload: { resourceType } }, conversationId);
        return result.resourceStatus || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: GCPTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getCloudSpend') {
            return {
                cloudSpend: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [
                      { label: 'This Year', data: [8000, 8500, 9000, 8800, 9500, 9700], color: '#3f51b5' },
                      { label: 'Last Year', data: [6000, 6200, 6500, 6300, 6800, 7000], color: '#9e9e9e' },
                    ],
                }
            };
        } else if (args.action === 'getResourceStatus') {
            return {
                resourceStatus: {
                    resourceType: args.payload.resourceType,
                    count: 30,
                    running: 28,
                    stopped: 2,
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
