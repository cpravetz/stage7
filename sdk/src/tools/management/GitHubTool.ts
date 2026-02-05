import { Tool, HttpCoreEngineClient, JsonSchema, SecurityAlert } from '../../index';
import { RepositoryStats } from '../../types';


export class GitHubTool extends Tool {
    constructor(client: HttpCoreEngineClient) {
        super({
            name: 'GitHubTool',
            description: 'Manages and retrieves data from GitHub repositories, including security alerts and repository statistics.',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform with GitHub.',
                        enum: ['getSecurityAlerts', 'getRepositoryStats'],
                    },
                    payload: {
                        type: 'object',
                        description: 'The payload for the specific GitHub action.',
                        properties: {
                            repository: {
                                type: 'string',
                                description: 'The name of the GitHub repository (e.g., "my-org/my-repo").',
                            },
                            severity: {
                                type: 'string',
                                description: 'Filter alerts by severity (e.g., "Critical", "High").',
                                enum: ['Critical', 'High', 'Medium', 'Low'],
                            },
                        },
                        required: ['repository'],
                    },
                },
                required: ['action', 'payload'],
            } as JsonSchema,
            coreEngineClient: client,
        });
    }

    /**
     * Retrieves security alerts for a given GitHub repository.
     * @param repository The name of the GitHub repository (e.g., "my-org/my-repo").
     * @param severity Optional: Filter alerts by severity (e.g., "Critical", "High").
     * @param conversationId The ID of the conversation context.
     * @returns A list of security alerts.
     */
    public async getSecurityAlerts(repository: string, severity?: 'Critical' | 'High' | 'Medium' | 'Low', conversationId?: string): Promise<SecurityAlert[]> {
        const payload: any = { repository };
        if (severity) {
            payload.severity = severity;
        }
        const result = await this.execute({ action: 'getSecurityAlerts', payload }, conversationId);
        // Assuming the L1 plugin returns an object with a 'securityAlerts' key
        return result.securityAlerts || [];
    }

    /**
     * Retrieves statistics for a given GitHub repository.
     * @param repository The name of the GitHub repository (e.g., "my-org/my-repo").
     * @param conversationId The ID of the conversation context.
     * @returns Repository statistics.
     */
    public async getRepositoryStats(repository: string, conversationId?: string): Promise<RepositoryStats> {
        const result = await this.execute({ action: 'getRepositoryStats', payload: { repository } }, conversationId);
        // Assuming the L1 plugin returns an object with 'repositoryStats' key
        return result.repositoryStats || {};
    }

    // Overriding the base execute method to provide stubbed responses for demonstration
    // In a real scenario, this would interact with the Core Engine to trigger L1 plugins.
    public async execute(args: any, conversationId?: string): Promise<any> {
        console.warn(`WARN: GitHubTool's execute method is returning stubbed data for action '${args.action}' in conversation ${conversationId}.`);
        if (args.action === 'getSecurityAlerts') {
            const allAlerts: SecurityAlert[] = [
                { cve: 'CVE-2023-44487', severity: 'Critical', title: 'HTTP/2 Rapid Reset Attack', project: args.payload.repository },
                { cve: 'CVE-2024-2961', severity: 'High', title: 'Remote Code Execution in glibc', project: args.payload.repository },
                { cve: 'CVE-2023-38545', severity: 'Medium', title: 'SOCKS5 buffer overflow', project: args.payload.repository },
            ];
            const filteredAlerts = args.payload.severity ? allAlerts.filter(a => a.severity === args.payload.severity) : allAlerts;
            return { securityAlerts: filteredAlerts };
        } else if (args.action === 'getRepositoryStats') {
            return {
                repositoryStats: {
                    totalCommits: 12345,
                    openPullRequests: 15,
                    closedPullRequests: 80,
                    branches: 30,
                }
            };
        }
        return { status: 'pending_implementation', tool: this.name, action: args.action };
    }
}
