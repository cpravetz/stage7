export interface EngineerStatistics {
    newPlugins: Array<string>;
}

// Define StepStat before AgentStatistics as AgentStatistics uses it.
export interface StepStat {
    id: string;
    verb: string;
    status: string; // This will store the string value of StepStatus enum
    dependencies: string[];
    stepNo: number;
}

export interface AgentStatistics {
    id: string;
    status: string; // This will store the string value of AgentStatus enum
    taskCount: number;
    currentTaskNo: number;
    currentTaskVerb: string;
    steps: StepStat[]; // Array of StepStat
    color: string;
}

export interface MissionStatistics {
    llmCalls: number;
    agentCountByStatus: Record<string, number>; // Changed from Object
    agentStatistics: Map<string, Array<AgentStatistics>>; // Implicitly uses new AgentStatistics
    engineerStatistics: EngineerStatistics;
}

export interface AgentSetManagerStatistics {
    agentSetsCount: number;
    totalAgentsCount: number;
    agentsByStatus: Map<string, Array<AgentStatistics>>; // Implicitly uses new AgentStatistics
}

export interface AgentSetStatistics {
    agentsCount: number;
    agentValuesCount: number; 
    agentsByStatus: Map<string, Array<AgentStatistics>>; // Implicitly uses new AgentStatistics
}

export interface TrafficManagerStatistics {
    agentStatisticsByType: {
        totalAgents: number; // Changed from Number
        agentCountByStatus: Record<string, number>; // Changed from Object
        agentSetCount: number; // Changed from Number
    };
    agentStatisticsByStatus: Map<string, Array<AgentStatistics>>; // Implicitly uses new AgentStatistics
}