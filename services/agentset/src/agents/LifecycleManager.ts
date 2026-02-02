import { AgentStatus } from '../utils/agentStatus';
import { StateManager } from '../utils/StateManager';

/**
 * Interface for the agent context needed by LifecycleManager
 */
export interface LifecycleAgentContext {
    id: string;
    status: AgentStatus;
    stateManager: StateManager;
    executionAbortController: AbortController | null;
    
    // Methods the agent must provide
    setAgentStatus: (status: AgentStatus, logData: any) => Promise<void>;
    saveAgentState: () => Promise<void>;
    runAgent: () => Promise<void>;
    toAgentState: () => any;
}

/**
 * Manages agent lifecycle operations: pause, abort, resume, and checkpointing
 */
export class LifecycleManager {
    private agent: LifecycleAgentContext;
    private checkpointInterval: NodeJS.Timeout | null = null;
    
    // Callbacks for resolving pending questions
    private resolveQuestionCallback: (() => void) | null = null;

    constructor(agent: LifecycleAgentContext) {
        this.agent = agent;
    }

    /**
     * Set a callback to resolve pending questions during pause/abort
     */
    public setResolveQuestionCallback(callback: () => void): void {
        this.resolveQuestionCallback = callback;
    }

    /**
     * Clear the checkpoint interval
     */
    private clearCheckpointInterval(): void {
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
            this.checkpointInterval = null;
            console.log(`Agent ${this.agent.id} checkpoint interval cleared.`);
        }
    }

    /**
     * Abort any in-flight execution requests
     */
    private abortInFlightRequests(): void {
        try {
            if (this.agent.executionAbortController) {
                this.agent.executionAbortController.abort();
                // Note: The agent is responsible for nulling this after abort
                console.log(`Agent ${this.agent.id} aborted in-flight execution.`);
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * Resolve any pending user questions
     */
    private resolveQuestions(): void {
        if (this.resolveQuestionCallback) {
            this.resolveQuestionCallback();
            console.log(`Agent ${this.agent.id} resolved pending question.`);
        }
    }

    /**
     * Pause the agent
     */
    public async pause(): Promise<void> {
        console.log(`Pausing agent ${this.agent.id}`);
        this.clearCheckpointInterval();
        this.resolveQuestions();
        this.abortInFlightRequests();
        await this.agent.setAgentStatus(AgentStatus.PAUSED, { eventType: 'agent_paused' });
        await this.agent.saveAgentState();
    }

    /**
     * Abort the agent
     */
    public async abort(): Promise<void> {
        console.log(`Aborting agent ${this.agent.id}`);
        await this.agent.setAgentStatus(AgentStatus.ABORTED, { eventType: 'agent_aborted' });
        await this.agent.saveAgentState();
        this.clearCheckpointInterval();
        this.resolveQuestions();
        this.abortInFlightRequests();
    }

    /**
     * Resume the agent
     */
    public async resume(): Promise<void> {
        if (this.agent.status === AgentStatus.PAUSED || this.agent.status === AgentStatus.INITIALIZING) {
            console.log(`Resuming agent ${this.agent.id}`);
            await this.agent.setAgentStatus(AgentStatus.RUNNING, { eventType: 'agent_resumed' });
            this.setupCheckpointing(15);
            console.log(`Agent ${this.agent.id} re-setup checkpoint interval due to resume.`);
            await this.agent.runAgent();
        }
    }

    /**
     * Setup checkpointing interval
     */
    public setupCheckpointing(intervalMinutes: number = 15): void {
        // Clear existing interval if any
        this.clearCheckpointInterval();

        if (typeof intervalMinutes !== 'number' || intervalMinutes <= 0) {
            console.warn(`[Agent ${this.agent.id}] Invalid checkpoint interval: ${intervalMinutes}. Checkpointing disabled.`);
            return;
        }

        // Set up new interval
        this.checkpointInterval = setInterval(() => {
            this.agent.saveAgentState()
                .catch(error => {
                    if (error instanceof Error) {
                        console.error(`[Agent ${this.agent.id}] Failed to create checkpoint: ${error.message}`, error.stack);
                    } else {
                        console.error(`[Agent ${this.agent.id}] Failed to create checkpoint with unknown error:`, error);
                    }
                });
        }, intervalMinutes * 60 * 1000);
        console.log(`[Agent ${this.agent.id}] Set up checkpointing interval for ${intervalMinutes} minutes.`);
    }

    /**
     * Cleanup resources
     */
    public cleanup(): void {
        this.clearCheckpointInterval();
    }
}
