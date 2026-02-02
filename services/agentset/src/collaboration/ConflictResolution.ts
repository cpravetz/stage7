import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import { Agent } from '../agents/Agent';
import { CollaborationMessageType, ConflictResolutionRequest, ConflictResolutionResponse, createCollaborationMessage } from './CollaborationProtocol';
import { ServiceTokenManager, createAuthenticatedAxios } from '@cktmcs/shared';

/**
 * Conflict status
 */
export enum ConflictStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  FAILED = 'failed',
  ESCALATED = 'escalated'
}

/**
 * Conflict resolution strategy
 */
export enum ConflictResolutionStrategy {
  VOTING = 'voting',
  CONSENSUS = 'consensus',
  AUTHORITY = 'authority',
  NEGOTIATION = 'negotiation',
  EXTERNAL = 'external'
}

/**
 * Conflict
 */
export interface Conflict {
  id: string;
  description: string;
  conflictingData: any[];
  initiatedBy: string;
  participants: string[];
  status: ConflictStatus;
  strategy: ConflictResolutionStrategy;
  resolution?: any;
  explanation?: string;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  votes?: Record<string, any>;
  escalatedTo?: string;
}

/**
 * Conflict resolution system
 */
export class ConflictResolution {
  private conflicts: Map<string, Conflict> = new Map();
  private agents: Map<string, Agent>;
  private brainUrl: string;
  private tokenManager: ServiceTokenManager;
  private missionControlUrl: string;
  private authenticatedApi: any;

  constructor(agents: Map<string, Agent>, brainUrl: string) {
    this.agents = agents;
    this.brainUrl = brainUrl;

    // Initialize token manager for service-to-service authentication
    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const serviceId = 'ConflictResolution';
    const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
    this.tokenManager = ServiceTokenManager.getInstance(
        `http://${securityManagerUrl}`,
        serviceId,
        serviceSecret
    );

    this.authenticatedApi = createAuthenticatedAxios({
        serviceId: serviceId,
        securityManagerUrl: `http://${securityManagerUrl}`,
        clientSecret: serviceSecret,
    });

    this.missionControlUrl = process.env.MISSIONCONTROL_URL?.startsWith('http') ? process.env.MISSIONCONTROL_URL : `http://${process.env.MISSIONCONTROL_URL || 'missioncontrol:5030'}`;
  }

  /**
   * Create a new conflict
   * @param initiatorId Initiator agent ID
   * @param request Conflict resolution request
   * @param participants Participant agent IDs
   * @param strategy Resolution strategy
   * @returns Created conflict
   */
  async createConflict(
    initiatorId: string,
    request: ConflictResolutionRequest,
    participants: string[],
    strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.CONSENSUS
  ): Promise<Conflict> {
    // Create conflict
    const conflict: Conflict = {
      id: request.conflictId || uuidv4(),
      description: request.description,
      conflictingData: request.conflictingData,
      initiatedBy: initiatorId,
      participants: [initiatorId, ...participants.filter(id => id !== initiatorId)],
      status: ConflictStatus.PENDING,
      strategy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadline: request.deadline
    };

    // Store conflict
    this.conflicts.set(conflict.id, conflict);

    // Notify participants
    await this.notifyParticipants(conflict);

    return conflict;
  }

  /**
   * Notify participants about a conflict
   * @param conflict Conflict
   */
  private async notifyParticipants(conflict: Conflict): Promise<void> {
    for (const participantId of conflict.participants) {
      if (participantId === conflict.initiatedBy) {
        continue; // Skip initiator
      }

      try {
        const participantAgent = this.agents.get(participantId);

        if (participantAgent) {
          // Send conflict notification to participant agent
          const message = {
            type: CollaborationMessageType.CONFLICT_RESOLUTION,
            sender: conflict.initiatedBy,
            recipient: participantId,
            content: {
              conflictId: conflict.id,
              description: conflict.description,
              conflictingData: conflict.conflictingData,
              strategy: conflict.strategy,
              deadline: conflict.deadline
            }
          };

          const properMessage = createCollaborationMessage(
            message.type,
            message.sender,
            message.recipient,
            message.content
          );
          await participantAgent.handleCollaborationMessage(properMessage);
        } else {
          // Try to find participant agent in other agent sets
          const agentLocation = await this.findAgentLocation(participantId, this.agents.get(conflict.initiatedBy)?.missionId || '');

          if (agentLocation) {
            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            // Forward conflict notification to the agent's location
            await axios.post(`http://${agentLocation}/conflictNotification`, {
              conflictId: conflict.id,
              initiatorId: conflict.initiatedBy,
              description: conflict.description,
              conflictingData: conflict.conflictingData,
              strategy: conflict.strategy,
              deadline: conflict.deadline
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
          }
        }
      } catch (error) {
        analyzeError(error as Error);
        console.error(`Error notifying participant ${participantId} about conflict ${conflict.id}:`, error);
      }
    }
  }

  /**
   * Find the location of an agent
   * @param agentId Agent ID
   * @param missionId Mission ID
   * @returns Agent set URL or undefined if not found
   */
  private async findAgentLocation(agentId: string, missionId: string): Promise<string | undefined> {
    try {
        const response = await this.authenticatedApi.get(`${this.missionControlUrl}/agentSetUrlForAgent/${agentId}`, {
            params: {
                missionId: missionId
            }
        });
        if (response.status === 200 && response.data.url) {
            return response.data.url;
        }
        return undefined;
    } catch (error) {
        analyzeError(error as Error);
        console.error(`Error finding agent location for ${agentId} via MissionControl:`, error instanceof Error ? error.message : error);
        return undefined;
    }
  }

  /**
   * Submit a vote for a conflict
   * @param conflictId Conflict ID
   * @param agentId Agent ID
   * @param vote Vote
   * @param explanation Explanation
   */
  async submitVote(
    conflictId: string,
    agentId: string,
    vote: any,
    explanation?: string
  ): Promise<void> {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Check if agent is a participant
    if (!conflict.participants.includes(agentId)) {
      throw new Error(`Agent ${agentId} is not a participant in conflict ${conflict.id}`);
    }

    // Check if conflict is still open
    if (conflict.status !== ConflictStatus.PENDING && conflict.status !== ConflictStatus.IN_PROGRESS) {
      throw new Error(`Conflict ${conflict.id} is already ${conflict.status}`);
    }

    // Initialize votes if needed
    if (!conflict.votes) {
      conflict.votes = {};
    }

    // Record vote
    conflict.votes[agentId] = {
      vote,
      explanation,
      timestamp: new Date().toISOString()
    };

    // Update conflict status
    conflict.status = ConflictStatus.IN_PROGRESS;
    conflict.updatedAt = new Date().toISOString();

    // Check if all participants have voted
    const allVoted = conflict.participants.every(participantId =>
      conflict.votes && conflict.votes[participantId]
    );

    if (allVoted) {
      // Resolve conflict
      await this.resolveConflict(conflictId);
    }
  }

  /**
   * Resolve a conflict
   * @param conflictId Conflict ID
   */
  async resolveConflict(conflictId: string): Promise<void> {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Check if conflict is still open
    if (conflict.status !== ConflictStatus.PENDING && conflict.status !== ConflictStatus.IN_PROGRESS) {
      return; // Already resolved
    }

    try {
      let resolution: any;
      let explanation: string;

      switch (conflict.strategy) {
        case ConflictResolutionStrategy.VOTING:
          ({ resolution, explanation } = this.resolveByVoting(conflict));
          break;

        case ConflictResolutionStrategy.CONSENSUS:
          ({ resolution, explanation } = this.resolveByConsensus(conflict));
          break;

        case ConflictResolutionStrategy.AUTHORITY:
          ({ resolution, explanation } = this.resolveByAuthority(conflict));
          break;

        case ConflictResolutionStrategy.NEGOTIATION:
          ({ resolution, explanation } = await this.resolveByNegotiation(conflict));
          break;

        case ConflictResolutionStrategy.EXTERNAL:
          // External resolution requires human intervention
          conflict.status = ConflictStatus.ESCALATED;
          conflict.escalatedTo = 'human';
          conflict.updatedAt = new Date().toISOString();

          // Notify about escalation
          await this.notifyEscalation(conflict);
          return;

        default:
          throw new Error(`Unknown resolution strategy: ${conflict.strategy}`);
      }

      // Update conflict
      conflict.resolution = resolution;
      conflict.explanation = explanation;
      conflict.status = ConflictStatus.RESOLVED;
      conflict.updatedAt = new Date().toISOString();

      // Notify participants about resolution
      await this.notifyResolution(conflict);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Error resolving conflict ${conflictId}:`, error);

      // Update conflict
      conflict.status = ConflictStatus.FAILED;
      conflict.explanation = error instanceof Error ? error.message : String(error);
      conflict.updatedAt = new Date().toISOString();

      // Notify participants about failure
      await this.notifyResolution(conflict);
    }
  }

  /**
   * Resolve conflict by voting
   * @param conflict Conflict
   * @returns Resolution and explanation
   */
  private resolveByVoting(conflict: Conflict): { resolution: any, explanation: string } {
    if (!conflict.votes) {
      throw new Error('No votes available');
    }

    // Count votes
    const voteCounts: Record<string, number> = {};

    for (const participantId of Object.keys(conflict.votes)) {
      const vote = JSON.stringify(conflict.votes[participantId].vote);
      voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    }

    // Find the most popular vote
    let maxCount = 0;
    let winningVote: string | undefined;

    for (const [vote, count] of Object.entries(voteCounts)) {
      if (count > maxCount) {
        maxCount = count;
        winningVote = vote;
      }
    }

    if (!winningVote) {
      throw new Error('No winning vote found');
    }

    // Calculate percentage
    const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    const percentage = (maxCount / totalVotes) * 100;

    return {
      resolution: JSON.parse(winningVote),
      explanation: `Resolved by voting with ${percentage.toFixed(1)}% agreement (${maxCount}/${totalVotes} votes)`
    };
  }

  /**
   * Resolve conflict by consensus
   * @param conflict Conflict
   * @returns Resolution and explanation
   */
  private resolveByConsensus(conflict: Conflict): { resolution: any, explanation: string } {
    if (!conflict.votes) {
      throw new Error('No votes available');
    }

    // Check if all votes are the same
    const votes = Object.values(conflict.votes).map(v => JSON.stringify(v.vote));
    const uniqueVotes = new Set(votes);

    if (uniqueVotes.size === 1) {
      // Consensus reached
      return {
        resolution: JSON.parse(votes[0]),
        explanation: `Resolved by consensus with 100% agreement (${votes.length}/${votes.length} votes)`
      };
    }

    // No consensus, fall back to voting
    return this.resolveByVoting(conflict);
  }

  /**
   * Resolve conflict by authority
   * @param conflict Conflict
   * @returns Resolution and explanation
   */
  private resolveByAuthority(conflict: Conflict): { resolution: any, explanation: string } {
    if (!conflict.votes) {
      throw new Error('No votes available');
    }

    // Use initiator's vote as authoritative
    const initiatorVote = conflict.votes[conflict.initiatedBy];

    if (!initiatorVote) {
      throw new Error('Initiator has not voted');
    }

    return {
      resolution: initiatorVote.vote,
      explanation: `Resolved by authority (initiator's decision)`
    };
  }

  /**
   * Resolve conflict by negotiation
   * @param conflict Conflict
   * @returns Resolution and explanation
   */
  private async resolveByNegotiation(conflict: Conflict): Promise<{ resolution: any, explanation: string }> {
    if (!conflict.votes) {
      throw new Error('No votes available');
    }

    // Collect all votes and explanations
    const votesWithExplanations = Object.entries(conflict.votes).map(([agentId, voteInfo]) => ({
      agentId,
      vote: voteInfo.vote,
      explanation: voteInfo.explanation || 'No explanation provided'
    }));

    // Use LLM to negotiate a resolution
    try {
      // Get a token for authentication
      const token = await this.tokenManager.getToken();

      const response = await axios.post(`http://${this.brainUrl}/chat`, {
        exchanges: [
          {
            role: 'system',
            content: 'You are a conflict resolution expert. Your task is to analyze different perspectives and propose a fair resolution. Respond with a JSON object containing two keys: "resolution" (the proposed solution) and "explanation" (your reasoning).'
          },
          {
            role: 'user',
            content: `Please help resolve the following conflict:\n\nDescription: ${conflict.description}\n\nConflicting data: ${JSON.stringify(conflict.conflictingData, null, 2)}\n\nVotes and explanations:\n${votesWithExplanations.map(v => `- Agent ${v.agentId}: ${JSON.stringify(v.vote)}\n  Explanation: ${v.explanation}`).join('\n\n')}\n\nPlease provide a JSON response with a "resolution" and "explanation".`
          }
        ],
        optimization: 'accuracy',
        responseType: 'text'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Parse LLM response
      const llmResponse = response.data.response;

      let resolution: any;
      let explanation: string;

      try {
        const parsedResponse = JSON.parse(llmResponse);
        resolution = parsedResponse.resolution || llmResponse;
        explanation = parsedResponse.explanation || 'Resolved by AI-assisted negotiation.';
      } catch (e) {
        console.warn('Could not parse LLM response as JSON, falling back to text.', e);
        resolution = llmResponse;
        explanation = 'Resolved by AI-assisted negotiation (response was not valid JSON).';
      }

      return { resolution, explanation };
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error using LLM for negotiation:', error);

      // Fall back to voting
      return this.resolveByVoting(conflict);
    }
  }

  /**
   * Notify participants about conflict resolution
   * @param conflict Resolved conflict
   */
  private async notifyResolution(conflict: Conflict): Promise<void> {
    for (const participantId of conflict.participants) {
      try {
        const participantAgent = this.agents.get(participantId);

        if (participantAgent) {
          // Send resolution notification to participant agent
          const message = {
            type: CollaborationMessageType.CONFLICT_RESOLUTION,
            sender: 'conflict-resolver',
            recipient: participantId,
            content: {
              conflictId: conflict.id,
              status: conflict.status,
              resolution: conflict.resolution,
              explanation: conflict.explanation
            }
          };

          const properResolutionMessage = createCollaborationMessage(
            message.type,
            message.sender,
            message.recipient,
            message.content
          );
          await participantAgent.handleCollaborationMessage(properResolutionMessage);

        } else {
          // Try to find participant agent in other agent sets
          const agentLocation = await this.findAgentLocation(participantId, this.agents.get(conflict.initiatedBy)?.missionId || '');

          if (agentLocation) {
            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            // Forward resolution notification to the agent's location
            await axios.post(`http://${agentLocation}/conflictResolution`, {
              conflictId: conflict.id,
              status: conflict.status,
              resolution: conflict.resolution,
              explanation: conflict.explanation
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
          }
        }
      } catch (error) {
        analyzeError(error as Error);
        console.error(`Error notifying participant ${participantId} about conflict resolution:`, error);
      }
    }
  }

  /**
   * Notify about conflict escalation
   * @param conflict Escalated conflict
   */
  private async notifyEscalation(conflict: Conflict): Promise<void> {
    try {
      // Send escalation notification to MissionControl
      await this.authenticatedApi.post(`${this.missionControlUrl}/escalateConflict`, {
        conflictId: conflict.id,
        missionId: this.agents.get(conflict.initiatedBy)?.missionId || '',
        status: conflict.status,
        escalatedTo: conflict.escalatedTo,
        description: conflict.description,
        conflictingData: conflict.conflictingData,
        initiatedBy: conflict.initiatedBy
      });

      // Notify participants about escalation
      for (const participantId of conflict.participants) {
        const participantAgent = this.agents.get(participantId);

        if (participantAgent) {
          // Send escalation notification to participant agent
          const message = {
            type: CollaborationMessageType.CONFLICT_RESOLUTION,
            sender: 'conflict-resolver',
            recipient: participantId,
            content: {
              conflictId: conflict.id,
              status: conflict.status,
              escalatedTo: conflict.escalatedTo
            }
          };

          const properEscalationMessage = createCollaborationMessage(
            message.type,
            message.sender,
            message.recipient,
            message.content
          );
          await participantAgent.handleCollaborationMessage(properEscalationMessage);
        } else {
            const agentLocation = await this.findAgentLocation(participantId, this.agents.get(conflict.initiatedBy)?.missionId || '');
            if (agentLocation) {
                const token = await this.tokenManager.getToken();
                await axios.post(`http://${agentLocation}/escalateConflictNotification`, {
                    conflictId: conflict.id,
                    status: conflict.status,
                    escalatedTo: conflict.escalatedTo
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
        }
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error notifying about conflict escalation:', error);
    }
  }

  /**
   * Get conflict by ID
   * @param conflictId Conflict ID
   * @returns Conflict or undefined if not found
   */
  getConflict(conflictId: string): Conflict | undefined {
    return this.conflicts.get(conflictId);
  }

  /**
   * Get conflicts involving an agent
   * @param agentId Agent ID
   * @returns Conflicts involving the agent
   */
  getConflictsInvolvingAgent(agentId: string): Conflict[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => conflict.participants.includes(agentId));
  }

  /**
   * Get unresolved conflicts
   * @returns Unresolved conflicts
   */
  getUnresolvedConflicts(): Conflict[] {
    return Array.from(this.conflicts.values())
      .filter(conflict =>
        conflict.status !== ConflictStatus.RESOLVED &&
        conflict.status !== ConflictStatus.FAILED
      );
  }

  /**
   * Check for expired conflicts
   */
  async checkExpiredConflicts(): Promise<void> {
    const now = new Date();

    for (const conflict of this.conflicts.values()) {
      if (conflict.deadline &&
          conflict.status !== ConflictStatus.RESOLVED &&
          conflict.status !== ConflictStatus.FAILED) {

        const deadline = new Date(conflict.deadline);

        if (now > deadline) {
          // Escalate expired conflict
          conflict.status = ConflictStatus.ESCALATED;
          conflict.escalatedTo = 'human';
          conflict.explanation = 'Conflict deadline expired';
          conflict.updatedAt = new Date().toISOString();

          // Notify about escalation
          await this.notifyEscalation(conflict);
        }
      }
    }
  }
}