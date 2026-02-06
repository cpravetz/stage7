import { Tool, HttpCoreEngineClient, JsonSchema, CloudSpend } from '../../index';


export class AWSTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'AWSTool',
            description: 'Manages and retrieves information from Amazon Web Services (AWS), including cost analysis and resource status.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with AWS.',
                        enum: ['getCloudSpend', 'getResourceStatus'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific AWS action.',
                        properties: {
                            period: {
                                type: 'string',
                                description: 'The time period for cost analysis (e.g., "MONTHLY", "DAILY").',
                                enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
                            },
                            resourceType: {
                                type: 'string',
                                description: 'The type of AWS resource to get status for (e.g., "EC2", "RDS", "S3").',
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
     * Retrieves AWS cloud spend data.
     * @param period The time period for cost analysis (e.g., "MONTHLY", "DAILY").
     * @param conversationId The ID of the conversation context.
     * @returns AWS cloud spend data.
     */
    public async getCloudSpend(period: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY', conversationId?: string): Promise<CloudSpend> {
        const result = await this.execute({ action: 'getCloudSpend', payload: { period } }, conversationId);
        return result.cloudSpend || {};
    }

    /**
     * Retrieves the status of a specific AWS resource type.
     * @param resourceType The type of AWS resource to get status for (e.g., "EC2", "RDS", "S3").
     * @param conversationId The ID of the conversation context.
     * @returns Resource status information.
     */
    public async getResourceStatus(resourceType: string, conversationId?: string): Promise<any> {
        const result = await this.execute({ action: 'getResourceStatus', payload: { resourceType } }, conversationId);
        return result.resourceStatus || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: AWSTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getCloudSpend') {
            return {
                cloudSpend: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [
                      { label: 'This Year', data: [12500, 13200, 14100, 13900, 15800, 16200], color: '#1976d2' },
                      { label: 'Last Year', data: [10000, 10500, 11000, 11200, 11800, 12500], color: '#757575' },
                    ],
                }
            };
        } else if (args.action === 'getResourceStatus') {
            return {
                resourceStatus: {
                    resourceType: args.payload.resourceType,
                    count: 50,
                    running: 48,
                    stopped: 2,
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
