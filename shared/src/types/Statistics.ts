export interface MissionStatistics {
    llmCalls: number;
    agentCountByStatus: Object;
    agentStatistics: Map<string, Array<AgentStatistics>>,
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
    currentTaskNo : number;
    currentTaskVerb: string;
    steps: Array<{
        id: string;
        verb: string;
        status: string;
        dependencies: string[];
        stepNo: number;
    }>;
    color: string; 
}

export interface TrafficManagerStatistics {
    agentStatisticsByType: {
        totalAgents: Number,
        agentCountByStatus: Object,
        agentSetCount: Number
    },
    agentStatisticsByStatus: Map<string, Array<AgentStatistics>>
}