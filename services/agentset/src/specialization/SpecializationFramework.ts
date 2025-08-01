import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import { Agent } from '../agents/Agent';
import { AgentStatus } from '../utils/agentStatus';
import { AgentRole, PredefinedRoles, AuthenticatedApiClient } from '@cktmcs/shared';



export interface TaskPerformanceMetrics {
    successRate: number;
    taskCount: number;
    averageTaskDuration: number;
    lastEvaluation: string;
    qualityScore: number;
}

/**
 * Agent specialization
 */
export interface AgentSpecialization {
  agentId: string;
  roleId: string;
  assignedAt: string;
  performanceByTask: Map<string, TaskPerformanceMetrics>;
    customizations?: {
    capabilities?: string[];
    responsibilities?: string[];
    knowledgeDomains?: string[];
    systemPrompt?: string;
  };
}

/**
 * Knowledge domain
 */
export interface KnowledgeDomain {
  id: string;
  name: string;
  description: string;
  parentDomain?: string;
  subdomains?: string[];
  keywords: string[];
  resources: {
    type: 'document' | 'api' | 'database' | 'model' | 'tool';
    id: string;
    name: string;
    description: string;
    accessMethod: string;
  }[];
}

/**
 * Specialization framework
 */
export class SpecializationFramework {
  private roles: Map<string, AgentRole> = new Map();
  private specializations: Map<string, AgentSpecialization> = new Map();
    private knowledgeDomains: Map<string, KnowledgeDomain> = new Map();
  private agents: Map<string, Agent>;
  private librarianUrl: string;
  private brainUrl: string;
  private authenticatedApi: AuthenticatedApiClient;

  constructor(agents: Map<string, Agent>, librarianUrl: string, brainUrl: string) {
    this.agents = agents;
    this.librarianUrl = librarianUrl;
    this.brainUrl = brainUrl;

    // Create a temporary BaseEntity for authentication
    const tempEntity = {
      id: 'specialization-framework',
      componentType: 'AgentSet',
      url: 'agentset:5100',
      port: '5100',
      postOfficeUrl: 'postoffice:5020'
    };

    // Create authenticated API client
    this.authenticatedApi = new AuthenticatedApiClient(tempEntity);

        // Initialize predefined roles
    for (const [id, role] of Object.entries(PredefinedRoles)) {
      this.roles.set(role.id.toLowerCase(), role);
    }

    console.log(`Initialized ${this.roles.size} predefined roles: ${Array.from(this.roles.keys()).join(', ')}`);

    // Load specializations and knowledge domains
    this.loadSpecializations();
    this.loadKnowledgeDomains();
  }

    /**
   * Load specializations from persistent storage
   */
  private async loadSpecializations(): Promise<void> {
    try {
      // Use queryData instead of loadData to get the document by ID
      const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
        collection: 'agent_specializations',
        query: { _id: 'agent_specializations' },
        limit: 1
      });

      // Check if we got data back
      if (response.data && response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
        const document = response.data.data[0];
        // The actual specializations array should be in the document's data field
        const specializations = Array.isArray(document) ? document : (document.data || document);

        if (Array.isArray(specializations)) {
            for (const specialization of specializations) {
            if (specialization && specialization.agentId) {
              this.specializations.set(specialization.agentId, specialization);
            }
          }
          console.log(`Loaded ${this.specializations.size} agent specializations`);
        } else {
          console.log('No valid specializations array found in document');
        }
      } else {
        console.log('No agent specializations found in storage');
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error loading agent specializations:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Save specializations to persistent storage
   */
  private async saveSpecializations(): Promise<void> {
    try {
      const specializations = Array.from(this.specializations.values());

      await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
        id: 'agent_specializations',
        data: specializations,
        storageType: 'mongo',
        collection: 'agent_specializations'
      });

      console.log(`Saved ${specializations.length} agent specializations`);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error saving agent specializations:', error);
    }
  }

  /**
   * Load knowledge domains from persistent storage
   */
  private async loadKnowledgeDomains(): Promise<void> {
    try {
      // Use queryData instead of loadData to get the document by ID
      const response = await this.authenticatedApi.post(`http://${this.librarianUrl}/queryData`, {
        collection: 'knowledge_domains',
        query: { _id: 'knowledge_domains' },
        limit: 1
      });

      // Check if we got data back
      if (response.data && response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
        const document = response.data.data[0];
        // The actual domains array should be in the document's data field
        const domains = Array.isArray(document) ? document : (document.data || document);

        if (Array.isArray(domains)) {
          for (const domain of domains) {
            if (domain && domain.id) {
              this.knowledgeDomains.set(domain.id, domain);
            }
          }
          console.log(`Loaded ${this.knowledgeDomains.size} knowledge domains`);
        } else {
          console.log('No valid domains array found in document');
        }
      } else {
        console.log('No knowledge domains found in storage');
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error loading knowledge domains:', error);
    }
  }

  /**
   * Save knowledge domains to persistent storage
   */
  private async saveKnowledgeDomains(): Promise<void> {
    try {
      const domains = Array.from(this.knowledgeDomains.values());

      await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
        id: 'knowledge_domains',
        data: domains,
        storageType: 'mongo',
        collection: 'knowledge_domains'
      });

      console.log(`Saved ${domains.length} knowledge domains`);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error saving knowledge domains:', error);
    }
  }

  /**
   * Assign a role to an agent
   * @param agentId Agent ID
   * @param roleId Role ID
   * @param customizations Role customizations
   * @returns Agent specialization
   */
  async assignRole(
    agentId: string,
    roleId: string,
    customizations?: AgentSpecialization['customizations']
  ): Promise<AgentSpecialization> {
    // Check if role exists
    const role = this.roles.get(roleId);

    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    // Check if agent exists
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Create specialization
    const specialization: AgentSpecialization = {
      agentId,
      roleId,
      assignedAt: new Date().toISOString(),
      performanceByTask: new Map(),
      customizations
    };

    // Store specialization
    this.specializations.set(agentId, specialization);
    await this.saveSpecializations();

    // Apply role to agent
    await this.applyRoleToAgent(agent, role, customizations);

    return specialization;
  }

  /**
   * Apply a role to an agent
   * @param agent Agent
   * @param role Role
   * @param customizations Role customizations
   */
  private async applyRoleToAgent(
    agent: Agent,
    role: AgentRole,
    customizations?: AgentSpecialization['customizations']
  ): Promise<void> {
    try {
      // Combine role and customizations
      const capabilities = customizations?.capabilities || role.capabilities;
      const responsibilities = customizations?.responsibilities || role.responsibilities;
      const knowledgeDomains = customizations?.knowledgeDomains || role.knowledgeDomains;
      const systemPrompt = customizations?.systemPrompt || role.systemPrompt;

      // Set agent properties
      agent.setRole(role.id);
      agent.setSystemPrompt(systemPrompt);
      agent.setCapabilities(capabilities);

      // Store role information in agent's context
      await agent.storeInContext('role', {
        id: role.id,
        name: role.name,
        description: role.description,
        capabilities,
        responsibilities,
        knowledgeDomains,
        systemPrompt
      });

      console.log(`Applied role ${role.name} to agent ${agent.id}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Error applying role ${role.id} to agent ${agent.id}:`, error);
      throw error;
    }
  }

  /**
   * Get agent specialization
   * @param agentId Agent ID
   * @returns Agent specialization or undefined if not found
   */
  getAgentSpecialization(agentId: string): AgentSpecialization | undefined {
    return this.specializations.get(agentId);
  }

  /**
   * Get agents with a specific role
   * @param roleId Role ID
   * @returns Agents with the role
   */
  getAgentsWithRole(roleId: string): AgentSpecialization[] {
    return Array.from(this.specializations.values())
      .filter(spec => spec.roleId === roleId);
  }

  /**
   * Create a new role
   * @param role Role to create
   * @returns Created role
   */
  createRole(role: Omit<AgentRole, 'id'>): AgentRole {
    const id = role.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const newRole: AgentRole = {
      ...role,
      id
    };

    this.roles.set(id, newRole);
    return newRole;
  }

  /**
   * Get role by ID
   * @param roleId Role ID
   * @returns Role or undefined if not found
   */
  getRole(roleId: string): AgentRole | undefined {
    return this.roles.get(roleId);
  }

  /**
   * Get all roles
   * @returns All roles
   */
  getAllRoles(): AgentRole[] {
    return Array.from(this.roles.values());
  }

  /**
   * Update agent performance
   * @param agentId Agent ID
   * @param success Whether the task was successful
   * @param duration Task duration in seconds
   */
  async updateAgentPerformance(
    agentId: string,
    actionVerb: string, 
    success: boolean,
    duration: number
  ): Promise<void> {

   const specialization = this.specializations.get(agentId);

    if (!specialization) {
      return; // Agent has no specialization
    }

  
    let taskPerformance = specialization.performanceByTask.get(actionVerb);

        if (!taskPerformance) {
            taskPerformance = {
                successRate: 0,
                taskCount: 0,
                averageTaskDuration: 0,
                lastEvaluation: new Date().toISOString(),
                qualityScore: 50 // Start with neutral quality
            };
        }

        // Update metrics using a weighted average for stability
        const weight = 0.1;
        taskPerformance.successRate = (taskPerformance.successRate * (1 - weight)) + (success ? 100 : 0) * weight;
        taskPerformance.taskCount += 1;
        taskPerformance.averageTaskDuration = (taskPerformance.averageTaskDuration * (taskPerformance.taskCount - 1) + duration) / taskPerformance.taskCount;
        taskPerformance.lastEvaluation = new Date().toISOString();

        specialization.performanceByTask.set(actionVerb, taskPerformance);
        
        await this.saveSpecializations();
        console.log(`Updated performance for agent ${agentId} on task '${actionVerb}'.`);
  }

/**
     * Records feedback from a critic agent to adjust the quality score for a task.
     * @param agentId The ID of the agent who performed the original task.
     * @param actionVerb The action verb of the original task.
     * @param qualityScore A score from 0 to 100 indicating the quality of the work.
     */
    async recordFeedback(agentId: string, actionVerb: string, qualityScore: number): Promise<void> {
        const specialization = this.specializations.get(agentId);
        if (!specialization) {
            console.warn(`Cannot record feedback. Agent ${agentId} has no specialization.`);
            return;
        }

        let taskPerformance = specialization.performanceByTask.get(actionVerb);
        if (!taskPerformance) {
            taskPerformance = {
                successRate: 75, // Assume success if it's being reviewed
                taskCount: 1,
                averageTaskDuration: 0,
                lastEvaluation: new Date().toISOString(),
                qualityScore: 50
            };
        }

        // Update quality score using a weighted average
        const feedbackWeight = 0.25;
        taskPerformance.qualityScore = (taskPerformance.qualityScore * (1 - feedbackWeight)) + (qualityScore * feedbackWeight);
        taskPerformance.lastEvaluation = new Date().toISOString();

        specialization.performanceByTask.set(actionVerb, taskPerformance);
        await this.saveSpecializations();
        console.log(`Recorded feedback for agent ${agentId} on task '${actionVerb}'. New quality score: ${taskPerformance.qualityScore.toFixed(2)}`);
    }

    /**
     * Calculates a dynamic proficiency score for a given task.
     * @param taskPerformance The performance metrics for the task.
     * @returns A proficiency score from 0 to 100.
     */
    private getTaskProficiency(taskPerformance: TaskPerformanceMetrics): number {
        if (!taskPerformance) return 50; // Default proficiency for unknown tasks

        const successFactor = taskPerformance.successRate / 100;
        const experienceFactor = Math.min(1, taskPerformance.taskCount / 20); // Full experience at 20 tasks
        const qualityFactor = taskPerformance.qualityScore / 100;

        // Weighted average of different factors
        const proficiency = (successFactor * 0.4) + (experienceFactor * 0.2) + (qualityFactor * 0.4);

        return Math.max(0, Math.min(100, proficiency * 100));
    }
    
  /**
   * Find the best agent for a task
   * @param roleId Required role
   * @param knowledgeDomains Required knowledge domains
   * @param missionId Mission ID
   * @returns Best agent ID or undefined if none found
   */
  findBestAgentForTask(
    roleId: string,
    actionVerb?: string,
    knowledgeDomains: string[] = [],
    missionId?: string
  ): string | undefined {
    // Get all agents with the required role
    const candidates = Array.from(this.specializations.values())
      .filter(spec => spec.roleId === roleId)
      .filter(spec => {
        const agent = this.agents.get(spec.agentId);
        return agent && agent.status !== AgentStatus.COMPLETED && agent.status !== AgentStatus.ABORTED;
      });

    if (candidates.length === 0) {
      return undefined;
    }

    // Filter by mission if provided
    const missionCandidates = missionId
      ? candidates.filter(spec => {
          const agent = this.agents.get(spec.agentId);
          return agent && agent.missionId === missionId;
        })
      : candidates;

    // Use mission-specific candidates if available, otherwise use all candidates
    const finalCandidates = missionCandidates.length > 0 ? missionCandidates : candidates;

    // Score candidates
    const scoredCandidates = finalCandidates.map(spec => {
      const taskPerformance = spec.performanceByTask.get(actionVerb || 'ACCOMPLISH');
      // If no specific performance data, use an average of all tasks for that agent or a default.
      const proficiency = taskPerformance ? this.getTaskProficiency(taskPerformance) : 50;
      let score = proficiency;

      // Bonus for knowledge domain match
      if (knowledgeDomains.length > 0) {
        const role = this.roles.get(spec.roleId);

        if (role) {
          const domainMatches = knowledgeDomains.filter(domain =>
            role.knowledgeDomains.includes(domain)
          ).length;

          const domainMatchRatio = domainMatches / knowledgeDomains.length;
          score += domainMatchRatio * 20; // Up to 20 points bonus
        }
      }

      // Bonus for mission match
      if (missionId) {
        const agent = this.agents.get(spec.agentId);

        if (agent && agent.missionId === missionId) {
          score += 30; // 30 points bonus for mission match
        }
      }

      return { agentId: spec.agentId, score };
    });

    // Sort by score (descending)
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Return the best candidate
    return scoredCandidates.length > 0 ? scoredCandidates[0].agentId : undefined;
  }

  /**
   * Create a knowledge domain
   * @param domain Knowledge domain to create
   * @returns Created domain
   */
  async createKnowledgeDomain(domain: Omit<KnowledgeDomain, 'id'>): Promise<KnowledgeDomain> {
    const id = domain.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const newDomain: KnowledgeDomain = {
      ...domain,
      id
    };

    this.knowledgeDomains.set(id, newDomain);
    await this.saveKnowledgeDomains();

    return newDomain;
  }

  /**
   * Get knowledge domain by ID
   * @param domainId Domain ID
   * @returns Knowledge domain or undefined if not found
   */
  getKnowledgeDomain(domainId: string): KnowledgeDomain | undefined {
    return this.knowledgeDomains.get(domainId);
  }

  /**
   * Get all knowledge domains
   * @returns All knowledge domains
   */
  getAllKnowledgeDomains(): KnowledgeDomain[] {
    return Array.from(this.knowledgeDomains.values());
  }

  /**
   * Generate a specialized system prompt for an agent
   * @param agentId Agent ID
   * @param taskDescription Task description
   * @returns Specialized system prompt
   */
  async generateSpecializedPrompt(
    agentId: string,
    taskDescription: string
  ): Promise<string> {
    const specialization = this.specializations.get(agentId);

    if (!specialization) {
      // Return a generic prompt if no specialization
      return `You are an AI agent tasked with: ${taskDescription}. Complete this task to the best of your abilities.`;
    }

    const role = this.roles.get(specialization.roleId);

    if (!role) {
      // Return a generic prompt if role not found
      return `You are an AI agent tasked with: ${taskDescription}. Complete this task to the best of your abilities.`;
    }

    // Start with the role's system prompt
    let prompt = specialization.customizations?.systemPrompt || role.systemPrompt;

    // Add task-specific instructions
        prompt += `\n\nCurrent Task: ${taskDescription}\n\n`;
    
    // Add relevant knowledge domains
    const relevantDomains = (specialization.customizations?.knowledgeDomains || role.knowledgeDomains)
      .map(domainId => this.knowledgeDomains.get(domainId))
      .filter(domain => domain !== undefined);

    if (relevantDomains.length > 0) {
      prompt += 'Relevant Knowledge Domains:\n';

      for (const domain of relevantDomains) {
        prompt += `- ${domain!.name}: ${domain!.description}\n`;
      }

      prompt += '\n';
    }

    // Add capabilities
    const capabilities = specialization.customizations?.capabilities || role.capabilities;

    if (capabilities.length > 0) {
      prompt += 'Your Capabilities:\n';

      for (const capability of capabilities) {
        prompt += `- ${capability}\n`;
      }

      prompt += '\n';
    }

    // Add responsibilities
    const responsibilities = specialization.customizations?.responsibilities || role.responsibilities;

    if (responsibilities.length > 0) {
      prompt += 'Your Responsibilities:\n';

      for (const responsibility of responsibilities) {
        prompt += `- ${responsibility}\n`;
      }

      prompt += '\n';
    }

    return prompt;
  }
}
