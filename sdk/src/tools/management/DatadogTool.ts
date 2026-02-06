import { Tool, HttpCoreEngineClient, JsonSchema, DoraMetrics } from '../../index';


export class DatadogTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'DatadogTool',
            description: 'Monitors system health, performance, and DORA metrics via Datadog integration.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with Datadog.',
                        enum: ['getDoraMetrics', 'getSystemHealth'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific Datadog action.',
                        properties: {
                            service: {
                                type: 'string',
                                description: 'Optional: The name of the service to query.',
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
     * Retrieves key DORA metrics.
     * @param service Optional: Filter metrics by a specific service.
     * @param conversationId The ID of the conversation context.
     * @returns DORA metrics data.
     */
    public async getDoraMetrics(service?: string, conversationId?: string): Promise<DoraMetrics> {
        const payload: any = {};
        if (service) {
            payload.service = service;
        }
        const result = await this.execute({ action: 'getDoraMetrics', payload }, conversationId);
        return result.doraMetrics || {};
    }

    /**
     * Retrieves a high-level summary of system health.
     * @param conversationId The ID of the conversation context.
     * @returns System health summary.
     */
    public async getSystemHealth(conversationId?: string): Promise<any> {
        const result = await this.execute({ action: 'getSystemHealth', payload: {} }, conversationId);
        return result.systemHealth || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: DatadogTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getDoraMetrics') {
            return {
                doraMetrics: {
                    deploymentFrequency: { value: '1.8/day', trend: 0.15 },
                    leadTime: { value: '1.9 days', trend: -0.1 },
                    changeFailureRate: { value: '2.8%', trend: -0.07 },
                    timeToRestore: { value: '1.2 hours', trend: -0.2 },
                }
            };
        } else if (args.action === 'getSystemHealth') {
            return {
                systemHealth: {
                    status: 'operational',
                    issues: 0,
                    uptimePercentage: '99.98%',
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
