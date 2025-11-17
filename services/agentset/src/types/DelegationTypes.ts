export interface DelegationRecord {
  fromAgentId: string;
  toAgentId: string;
  timestamp: string;
  reason: string;
  transferId: string;
}

export interface StepLocation {
  stepId: string;
  currentOwnerAgentId: string;
  agentSetUrl: string;
  lastUpdated: string;
  delegationChain: DelegationRecord[];
}
