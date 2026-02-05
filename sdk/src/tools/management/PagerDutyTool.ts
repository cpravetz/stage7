import { Tool, HttpCoreEngineClient, JsonSchema, Incident } from '../../index';


export class PagerDutyTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'PagerDutyTool',
            description: 'Manages and retrieves incident and on-call information from PagerDuty.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with PagerDuty.',
                        enum: ['getActiveIncidents', 'getOnCallSchedule'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific PagerDuty action.',
                        properties: {
                            team: {
                                type: 'string',
                                description: 'Optional: Filter by team name.',
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
     * Retrieves a list of active incidents.
     * @param team Optional: Filter incidents by team name.
     * @param conversationId The ID of the conversation context.
     * @returns A list of active incidents.
     */
    public async getActiveIncidents(team?: string, conversationId?: string): Promise<Incident[]> {
        const payload: any = {};
        if (team) {
            payload.team = team;
        }
        const result = await this.execute({ action: 'getActiveIncidents', payload }, conversationId);
        return result.incidents || [];
    }

    /**
     * Retrieves the on-call schedule for a given team.
     * @param team The name of the team.
     * @param conversationId The ID of the conversation context.
     * @returns The on-call schedule.
     */
    public async getOnCallSchedule(team: string, conversationId?: string): Promise<any> {
        const result = await this.execute({ action: 'getOnCallSchedule', payload: { team } }, conversationId);
        return result.schedule || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: PagerDutyTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getActiveIncidents') {
            return {
                incidents: [
                    { id: 'INC-125', severity: 'High', title: 'API Gateway Latency Spike', assignee: 'On-Call Platform' },
                    { id: 'INC-126', severity: 'Medium', title: 'Database connection errors', assignee: 'On-Call Backend' },
                ]
            };
        } else if (args.action === 'getOnCallSchedule') {
            return {
                schedule: {
                    team: args.payload.team,
                    primary: 'Jane Doe',
                    secondary: 'John Smith',
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
