export interface MissionStatistics {
    llmCalls: number;
    agentCountByStatus: Object;
    runningAgents: Array<AgentStatistics>;
    engineerStatistics: EngineerStatistics;
}

export interface EngineerStatistics {
    newPlugins: Array<string>;
}

export interface AgentSetManagerStatistics {
    agentSetsCount: number;
    totalAgentsCount: number;
    agentsByStatus: Map<string, Array<AgentStatistics>>;
}

export interface AgentSetStatistics {
    agentsCount: number;
    agentsByStatus: Map<string, Array<AgentStatistics>>;
}

export interface AgentStatistics {
    id: string;
    status: string;
    taskCount : number;
    currenTaskNo : number;
    currentTaskVerb: string;
}

export interface TrafficManagerStatistics {
    agentStatisticsByType: {
        totalAgents: Number,
        agentCountByStatus: Object,
        agentSetCount: Number
    },
    runningAgentStatistics: {
        runningAgentsCount: Number,
        runningAgents: Array<AgentStatistics>
    }
}