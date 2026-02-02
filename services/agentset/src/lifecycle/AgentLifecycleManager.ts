import { Agent } from '../agents/Agent';
import { AgentStatus } from '../utils/agentStatus'; // Import AgentStatus enum
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import { MessageType, ServiceTokenManager } from '@cktmcs/shared';

/**
 * Agent version information
 */
export interface AgentVersion {
  version: string;
  createdAt: string;
  description: string;
  changes: string[];
  stateId: string; // ID of the saved state for this version
}

/**
 * Agent lifecycle event
 */
export interface AgentLifecycleEvent {
  id: string;
  agentId: string;
  eventType: 'created' | 'started' | 'paused' | 'resumed' | 'completed' | 'failed' | 'aborted' | 'checkpointed' | 'migrated' | 'upgraded';
  timestamp: string;
  details: Record<string, any>;
}

/**
 * Agent diagnostic information
 */
export interface AgentDiagnostics {
  agentId: string;
  status: AgentStatus;
  memoryUsage: number;
  cpuUsage: number;
  stepCount: number;
  errorCount: number;
  lastError?: string;
  lastActivity: string;
  runningTime: number;
  healthScore: number;
}

/**
 * Agent lifecycle manager
 */
export class AgentLifecycleManager {
  private agents: Map<string, Agent> = new Map();
  private agentVersions: Map<string, AgentVersion[]> = new Map();
  private lifecycleEvents: Map<string, AgentLifecycleEvent[]> = new Map();
  private diagnostics: Map<string, AgentDiagnostics> = new Map();
  private persistenceManager: AgentPersistenceManager;
  private checkpointIntervals: Map<string, NodeJS.Timeout> = new Map();
  private monitoringInterval: NodeJS.Timeout;
  private tokenManager: ServiceTokenManager;

  constructor(persistenceManager: AgentPersistenceManager) {
    this.persistenceManager = persistenceManager;

    // Initialize token manager for service-to-service authentication
    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const serviceId = 'AgentLifecycleManager';
    const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
    this.tokenManager = ServiceTokenManager.getInstance(
        `http://${securityManagerUrl}`,
        serviceId,
        serviceSecret
    );

    // Set up monitoring interval
    this.monitoringInterval = setInterval(() => this.monitorAgents(), 60000); // Monitor every minute
  }

  /**
   * Register an agent with the lifecycle manager
   * @param agent Agent to register
   */
  async registerAgent(agent: Agent): Promise<void> {
    this.agents.set(agent.id, agent);

    // Save agent state to persistence layer
    this.persistenceManager.saveAgent(agent.toAgentState());

    // Initialize agent versions
    if (!this.agentVersions.has(agent.id)) {
      this.agentVersions.set(agent.id, [{
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        description: 'Initial version',
        changes: ['Initial agent creation'],
        stateId: `${agent.id}-v1.0.0`
      }]);
    }

    // Initialize lifecycle events
    if (!this.lifecycleEvents.has(agent.id)) {
      this.lifecycleEvents.set(agent.id, [{
        id: uuidv4(),
        agentId: agent.id,
        eventType: 'created',
        timestamp: new Date().toISOString(),
        details: {
          missionId: agent.missionId,
          actionVerb: agent.steps[0]?.actionVerb || 'UNKNOWN'
        }
      }]);
    }

    // Initialize diagnostics
    this.updateDiagnostics(agent);

    // Set up automatic checkpointing
    this.setupCheckpointing(agent);
  }

  /**
   * Unregister an agent from the lifecycle manager
   * @param agentId Agent ID
   */
  unregisterAgent(agentId: string): void {
    // Clear checkpoint interval
    const interval = this.checkpointIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.checkpointIntervals.delete(agentId);
    }

    // Remove agent
    this.agents.delete(agentId);
  }

  /**
   * Set up automatic checkpointing for an agent
   * @param agent Agent to checkpoint
   * @param intervalMinutes Checkpoint interval in minutes
   */
  private setupCheckpointing(agent: Agent, intervalMinutes: number = 15): void {
    // Clear existing interval if any
    const existingInterval = this.checkpointIntervals.get(agent.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval
    const interval = setInterval(() => {
      this.createCheckpoint(agent.id)
        .catch(error => console.error(`Failed to create checkpoint for agent ${agent.id}:`, error));
    }, intervalMinutes * 60 * 1000);

    this.checkpointIntervals.set(agent.id, interval);
  }

  /**
   * Create a checkpoint for an agent
   * @param agentId Agent ID
   */
  async createCheckpoint(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Save agent state
      await agent.saveAgentState();

      // Record checkpoint event
      this.recordLifecycleEvent(agentId, 'checkpointed', {
        timestamp: new Date().toISOString(),
        status: agent.getStatus()
      });

      console.log(`Created checkpoint for agent ${agentId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to create checkpoint for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new version of an agent
   * @param agentId Agent ID
   * @param description Version description
   * @param changes Changes in this version
   * @returns New version information
   */
  async createVersion(agentId: string, description: string, changes: string[]): Promise<AgentVersion> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Get current versions
    const versions = this.agentVersions.get(agentId) || [];

    // Determine new version number
    const currentVersion = versions.length > 0
      ? versions[versions.length - 1].version
      : '0.0.0';

    const versionParts = currentVersion.split('.');
    const newVersion = `${versionParts[0]}.${versionParts[1]}.${parseInt(versionParts[2]) + 1}`;

    // Create state ID for this version
    const stateId = `${agentId}-v${newVersion}`;

    // Save agent state with this state ID, ensuring the full state is captured
    await this.persistenceManager.saveAgent(agent.toAgentState());
    // Create new version
    const version: AgentVersion = {
      version: newVersion,
      createdAt: new Date().toISOString(),
      description,
      changes,
      stateId
    };

    // Add to versions
    versions.push(version);
    this.agentVersions.set(agentId, versions);

    // Record version event
    this.recordLifecycleEvent(agentId, 'checkpointed', {
      version: newVersion,
      description,
      changes
    });

    return version;
  }

  /**
   * Restore an agent to a specific version
   * @param agentId Agent ID
   * @param version Version to restore
   */
  async restoreVersion(agentId: string, version: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Find the version
    const versions = this.agentVersions.get(agentId) || [];
    const versionInfo = versions.find(v => v.version === version);

    if (!versionInfo) {
      throw new Error(`Version ${version} not found for agent ${agentId}`);
    }

    try {
      // Pause the agent
      await this.pauseAgent(agentId);

      // Load the state from this version
      const loadedState = await this.persistenceManager.loadAgent(versionInfo.stateId);
      Object.assign(agent, loadedState);

      // Resume the agent
      await this.resumeAgent(agentId);

      // Record restore event
      this.recordLifecycleEvent(agentId, 'migrated', {
        version,
        description: `Restored to version ${version}`
      });

      console.log(`Restored agent ${agentId} to version ${version}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to restore agent ${agentId} to version ${version}:`, error);
      throw error;
    }
  }

  /**
   * Pause an agent
   * @param agentId Agent ID
   */
  async pauseAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Send pause message to agent
      agent.status = AgentStatus.PAUSED;
      await agent.handleMessage({
        type: MessageType.PAUSE,
        sender: 'lifecycle-manager',
        recipient: agentId,
        content: {},
        timestamp: new Date().toISOString()
      });

      // Record pause event
      this.recordLifecycleEvent(agentId, 'paused', {
        timestamp: new Date().toISOString()
      });

      await this.persistenceManager.saveAgent(agent.toAgentState());
      console.log(`Paused agent ${agentId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to pause agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Resume an agent
   * @param agentId Agent ID
   */
  async resumeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Send resume message to agent
      agent.status = AgentStatus.RUNNING;
      await agent.handleMessage({
        type: MessageType.RESUME,
        sender: 'lifecycle-manager',
        recipient: agentId,
        content: {},
        timestamp: new Date().toISOString()
      });

      // Record resume event
      this.recordLifecycleEvent(agentId, 'resumed', {
        timestamp: new Date().toISOString()
      });

      await this.persistenceManager.saveAgent(agent.toAgentState());
      console.log(`Resumed agent ${agentId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to resume agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Abort an agent
   * @param agentId Agent ID
   */
  async abortAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Send abort message to agent
      agent.status = AgentStatus.ABORTED;
      await agent.handleMessage({
        type: MessageType.ABORT,
        sender: 'lifecycle-manager',
        recipient: agentId,
        content: {},
        timestamp: new Date().toISOString()
      });

      // Record abort event
      this.recordLifecycleEvent(agentId, 'aborted', {
        timestamp: new Date().toISOString()
      });

      await this.persistenceManager.saveAgent(agent.toAgentState());
      console.log(`Aborted agent ${agentId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to abort agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Migrate an agent to another agent set
   * @param agentId Agent ID
   * @param targetAgentSetUrl URL of the target agent set
   */
  async migrateAgent(agentId: string, targetAgentSetUrl: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Pause the agent
      await this.pauseAgent(agentId);

      // Create checkpoint
      await this.createCheckpoint(agentId);

      // Get agent state
      const state = await this.persistenceManager.loadAgent(agentId);

      // Get a token for authentication
      const token = await this.tokenManager.getToken();

      // Send state to target agent set
      const response = await axios.post(`http://${targetAgentSetUrl}/migrateAgent`, {
        agentId,
        state
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status >= 300) {
        throw new Error(`Failed to migrate agent: ${response.data.error || 'Unknown error'}`);
      }

      // Record migration event
      this.recordLifecycleEvent(agentId, 'migrated', {
        targetAgentSetUrl,
        timestamp: new Date().toISOString()
      });

      // Unregister agent from this agent set
      this.unregisterAgent(agentId);

      console.log(`Migrated agent ${agentId} to ${targetAgentSetUrl}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to migrate agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Record a lifecycle event for an agent
   * @param agentId Agent ID
   * @param eventType Event type
   * @param details Event details
   */
  recordLifecycleEvent(agentId: string, eventType: AgentLifecycleEvent['eventType'], details: Record<string, any>): void {
    // Get or create events array
    const events = this.lifecycleEvents.get(agentId) || [];

    // Add new event
    events.push({
      id: uuidv4(),
      agentId,
      eventType,
      timestamp: new Date().toISOString(),
      details
    });

    // Update events
    this.lifecycleEvents.set(agentId, events);
  }

  /**
   * Updates the status of an agent and persists the change.
   * @param agentId The ID of the agent to update.
   * @param status The new status for the agent.
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`Attempted to update status for non-existent agent ${agentId}`);
      return;
    }

    agent.status = status;
    try {
      await this.persistenceManager.saveAgent(agent.toAgentState());
    } catch (error) {
      console.error(`Failed to save agent ${agentId} state after status update:`, error);
    }
  }

  /**
   * Update diagnostics for an agent
   * @param agent Agent to update diagnostics for
   */
  updateDiagnostics(agent: Agent): void {
    const status = agent.getStatus();
    const steps = agent.getSteps();
    const errorCount = steps.filter(step => step.status === 'error').length;

    // Calculate health score (0-100)
    let healthScore = 100;

    // Reduce score for errors
    healthScore -= errorCount * 10;

    // Reduce score for non-running status
    if (status !== AgentStatus.RUNNING) {
      healthScore -= 20;
    }

    // Ensure score is within bounds
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Update diagnostics
    this.diagnostics.set(agent.id, {
      agentId: agent.id,
      status: status as AgentStatus,
      memoryUsage: process.memoryUsage().heapUsed, // Simplified - in a real system, would measure per-agent
      cpuUsage: 0, // Simplified - in a real system, would measure per-agent
      stepCount: steps.length,
      errorCount,
      lastError: errorCount > 0 ? 'Error in step execution' : undefined,
      lastActivity: new Date().toISOString(),
      runningTime: 0, // Simplified - in a real system, would calculate from creation time
      healthScore
    });
  }

  /**
   * Monitor agents for health and performance
   */
  private async monitorAgents(): Promise<void> {
    for (const [agentId, agent] of this.agents.entries()) {
      try {
        // Update diagnostics
        this.updateDiagnostics(agent);

        // Get diagnostics
        const diagnostics = this.diagnostics.get(agentId);

        if (!diagnostics) continue;

        // Check for unhealthy agents
        if (diagnostics.healthScore < 50) {
          console.warn(`Agent ${agentId} has low health score: ${diagnostics.healthScore}`);

          // Create checkpoint for unhealthy agent
          await this.createCheckpoint(agentId);

          //Do we need an error handler here?
        }
      } catch (error) {
        analyzeError(error as Error);
        console.error(`Error monitoring agent ${agentId}:`, error);
      }
    }
  }

  /**
   * Get lifecycle events for an agent
   * @param agentId Agent ID
   * @returns Lifecycle events
   */
  getLifecycleEvents(agentId: string): AgentLifecycleEvent[] {
    return this.lifecycleEvents.get(agentId) || [];
  }

  /**
   * Get versions for an agent
   * @param agentId Agent ID
   * @returns Agent versions
   */
  getAgentVersions(agentId: string): AgentVersion[] {
    return this.agentVersions.get(agentId) || [];
  }

  /**
   * Get diagnostics for an agent
   * @param agentId Agent ID
   * @returns Agent diagnostics
   */
  getAgentDiagnostics(agentId: string): AgentDiagnostics | undefined {
    return this.diagnostics.get(agentId);
  }

  /**
   * Get all agent diagnostics
   * @returns All agent diagnostics
   */
  getAllAgentDiagnostics(): AgentDiagnostics[] {
    return Array.from(this.diagnostics.values());
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Clear intervals
    clearInterval(this.monitoringInterval);

    for (const interval of this.checkpointIntervals.values()) {
      clearInterval(interval);
    }

    this.checkpointIntervals.clear();
  }
}
