export interface WorkProduct {
    id: string;
    agentId: string;
    stepId: string;
    data: any;
    timestamp: string;
}

export interface Deliverable extends WorkProduct {
    isDeliverable: true;
}
