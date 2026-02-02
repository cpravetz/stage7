import { Step, StepStatus, createFromPlan } from './Step';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { MapSerializer, PluginOutput, PluginParameterType, InputValue, ActionVerbTask, StepDependency } from '@cktmcs/shared';
import { AgentStatus } from '../utils/agentStatus';

/**
 * Interface for the agent context needed by ReflectionManager
 */
export interface ReflectionAgentContext {
    id: string;
    missionId: string;
    role: string;
    status: AgentStatus;
    steps: Step[];
    agentPersistenceManager: AgentPersistenceManager;
    crossAgentResolver: CrossAgentDependencyResolver;
    
    // Methods the agent must provide
    createStep: (actionVerb: string, inputValues: Map<string, InputValue> | undefined, description: string, status: StepStatus, dependencies?: StepDependency[]) => Step;
    logEvent: (event: any) => Promise<void>;
    updateStatus: () => Promise<void>;
    say: (message: string, isImportant?: boolean) => void;
    setAgentStatus: (status: AgentStatus, logData: any) => Promise<void>;
    addStepsFromPlan: (plan: ActionVerbTask[], parentStep: Step) => void;
    addToConversation: (role: string, content: string) => void;
}

/**
 * Manages end-of-mission reflection and recovery plan generation
 */
export class ReflectionManager {
    private agent: ReflectionAgentContext;
    
    // REFLECT cycle detection to prevent infinite loops
    private reflectCycleTracker: Map<string, number> = new Map();
    private maxReflectCyclesPerError: number = 3;
    private lastReflectPlanSignature: string = '';
    
    // Flag to ensure end-of-mission reflection runs only once
    public reflectionDone: boolean = false;

    constructor(agent: ReflectionAgentContext) {
        this.agent = agent;
    }

    /**
     * Get a summary of all completed work products for reflection
     */
    public async getCompletedWorkProductsSummary(): Promise<string> {
        const completed = this.agent.steps.filter(s => s.status === StepStatus.COMPLETED);
        if (!completed || completed.length === 0) return 'No completed work products.';

        const parts: string[] = [];
        for (const step of completed) {
            try {
                const wp = await this.agent.agentPersistenceManager.loadStepWorkProduct(this.agent.id, step.id);
                if (wp && wp.data) {
                    const snippet = typeof wp.data === 'string' ? wp.data.substring(0, 1000) : JSON.stringify(wp.data).substring(0, 1000);
                    parts.push(`Step(${step.actionVerb} - ${step.id}): ${snippet}`);
                } else if (step.result && step.result.length > 0) {
                    const r = step.result[0];
                    const snippet = typeof r.result === 'string' ? r.result.substring(0, 1000) : JSON.stringify(r.result).substring(0, 1000);
                    parts.push(`Step(${step.actionVerb} - ${step.id}): ${snippet}`);
                } else {
                    parts.push(`Step(${step.actionVerb} - ${step.id}): (no work product)`);
                }
            } catch (e) {
                parts.push(`Step(${step.actionVerb} - ${step.id}): (error reading work product)`);
            }
        }

        return parts.join('\n\n');
    }

    /**
     * Create an end-of-mission REFLECT step
     */
    public async createEndOfMissionReflect(finalSteps: Step[]): Promise<void> {
        console.log(`[Agent ${this.agent.id}] createEndOfMissionReflect: Preparing REFLECT step at mission end.`);
        const workProductsSummary = await this.getCompletedWorkProductsSummary();

        // Build plan history from all steps
        const planHistory = this.agent.steps.map(step => ({
            id: step.id,
            actionVerb: step.actionVerb,
            description: step.description,
            status: step.status,
            inputs: step.inputValues ? MapSerializer.transformForSerialization(step.inputValues) : {},
            outputs: step.outputs || {},
            result: step.result || []
        }));

        const reflectQuestion = `Did we accomplish the mission? If YES, return an empty JSON array []. If NO, return a JSON array of step objects (a plan) that when executed will achieve the mission.`;

        const reflectInputs = new Map<string, InputValue>([
            ['missionId', { inputName: 'missionId', value: this.agent.missionId, valueType: PluginParameterType.STRING, args: {} }],
            ['plan_history', { inputName: 'plan_history', value: JSON.stringify(planHistory), valueType: PluginParameterType.STRING, args: {} }],
            ['work_products', { inputName: 'work_products', value: workProductsSummary, valueType: PluginParameterType.STRING, args: {} }],
            ['question', { inputName: 'question', value: reflectQuestion, valueType: PluginParameterType.STRING, args: {} }],
            ['agentId', { inputName: 'agentId', value: this.agent.id, valueType: PluginParameterType.STRING, args: {} }]
        ]);

        const dependencies: StepDependency[] = finalSteps.map(step => ({
            sourceStepId: step.id,
            inputName: `_dependency_${step.id}`,
            outputName: '_step_completed'
        }));

        const recoveryStep = this.agent.createStep(
            'REFLECT',
            reflectInputs,
            `End-of-mission reflection: did we accomplish the mission?`,
            StepStatus.PENDING,
            dependencies
        );

        recoveryStep.recommendedRole = this.agent.role;
        this.agent.steps.push(recoveryStep);
        await this.agent.logEvent({ eventType: 'step_created', ...recoveryStep.toJSON() });
        await this.agent.updateStatus();
        console.log(`[Agent ${this.agent.id}] createEndOfMissionReflect: REFLECT step ${recoveryStep.id} created with ${dependencies.length} dependencies and plan history of ${planHistory.length} steps.`);
    }

    /**
     * Extract a plan from REFLECT step result
     */
    public extractPlanFromReflectionResult(result: PluginOutput[]): ActionVerbTask[] | null {
        const planOutput = result.find(r => r.name === 'plan');
        const answerOutput = result.find(r => r.name === 'answer');

        if (planOutput && planOutput.result && Array.isArray(planOutput.result)) {
            return planOutput.result as ActionVerbTask[];
        }

        if (answerOutput && answerOutput.result) {
            try {
                const parsedResult = typeof answerOutput.result === 'string' ? JSON.parse(answerOutput.result) : answerOutput.result;
                if (Array.isArray(parsedResult)) {
                    return parsedResult as ActionVerbTask[];
                }
            } catch (e) {
                console.warn(`[Agent ${this.agent.id}] extractPlanFromReflectionResult: Failed to parse 'answer' as JSON plan, treating as prose.`);
            }
        }
                
        return null;
    }

    /**
     * Generate a signature for a plan to detect if the same plan is being regenerated repeatedly
     */
    public getPlanSignature(plan: ActionVerbTask[]): string {
        const signatureParts: string[] = [];

        for (const step of plan) {
            const verbPart = step.actionVerb || '';
            const descPart = (step.description || '').substring(0, 50);
            const inputPart = step.inputs ? Object.keys(step.inputs).sort().join(',') : '';
            signatureParts.push(`${verbPart}|${descPart}|${inputPart}`);
        }

        const fullSignature = signatureParts.join('::');

        let hash = 0;
        for (let i = 0; i < fullSignature.length; i++) {
            const char = fullSignature.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return `v1:${plan.length}:${Math.abs(hash)}`;
    }

    /**
     * Handle the result of a REFLECT step
     */
    public async handleReflectionResult(result: PluginOutput[], step: Step): Promise<void> {
        const newPlan = this.extractPlanFromReflectionResult(result);
        const directAnswerOutput = result.find(r => r.name === 'direct_answer');

        if (newPlan && newPlan.length > 0) {
            // Check for infinite REFLECT cycles
            const planSignature = this.getPlanSignature(newPlan);
            if (planSignature === this.lastReflectPlanSignature) {
                console.warn(`[Agent ${this.agent.id}] REFLECT cycle detection: Same plan generated again. Incrementing cycle counter.`);
                const cycleCount = (this.reflectCycleTracker.get(planSignature) || 0) + 1;
                this.reflectCycleTracker.set(planSignature, cycleCount);
                
                if (cycleCount >= this.maxReflectCyclesPerError) {
                    console.error(`[Agent ${this.agent.id}] REFLECT infinite loop detected: Plan signature repeated ${cycleCount} times. Aborting reflection and marking mission as unrecoverable.`);
                    this.agent.say(`ERROR: Infinite reflection loop detected. The reflection step keeps generating the same plan which fails validation. Mission aborted.`, true);
                    await this.agent.setAgentStatus(AgentStatus.ERROR, {
                        eventType: 'reflect_infinite_loop_detected',
                        planSignature,
                        cycleCount
                    });
                    return;
                }
            } else {
                this.reflectCycleTracker.clear();
                this.lastReflectPlanSignature = planSignature;
            }
            
            this.agent.say('Reflection resulted in a new plan. Updating plan.');
            const currentStepIndex = this.agent.steps.findIndex(s => s.id === step.id);
            if (currentStepIndex !== -1) {
                console.log(`[Agent ${this.agent.id}] handleReflectionResult: Cancelling ${this.agent.steps.length - (currentStepIndex + 1)} subsequent steps.`);
                for (let i = currentStepIndex + 1; i < this.agent.steps.length; i++) {
                    this.agent.steps[i].status = StepStatus.CANCELLED;
                }
            }
            
            // Clear recommendedRole from all steps so they stay with the current agent
            const reflectPlanWithoutRoles = newPlan.map(stepTask => {
                const copy = { ...stepTask };
                delete copy.recommendedRole;
                return copy;
            });
            
            this.agent.addStepsFromPlan(reflectPlanWithoutRoles, step);
            this.reflectionDone = false;
            await this.agent.updateStatus();
        } else if (newPlan && newPlan.length === 0) {
            this.agent.say('Reflection indicates the mission is complete.', true);
            await this.agent.setAgentStatus(AgentStatus.COMPLETED, {eventType: 'agent_mission_accomplished'});
            await this.agent.updateStatus();
        } else if (directAnswerOutput && directAnswerOutput.result) {
            const directAnswer = directAnswerOutput.result;
            console.log(`[Agent ${this.agent.id}] handleReflectionResult: Reflection provided a direct answer. Creating new ACCOMPLISH step.`);
            this.agent.say(`Reflection provided a direct answer. Creating new ACCOMPLISH step to pursue this direction.`);
            this.agent.addToConversation('system', `Reflection Direct Answer: ${directAnswer}`);
            
            const currentStepIndex = this.agent.steps.findIndex(s => s.id === step.id);
            if (currentStepIndex !== -1) {
                console.log(`[Agent ${this.agent.id}] handleReflectionResult: Cancelling ${this.agent.steps.length - (currentStepIndex + 1)} subsequent steps.`);
                for (let i = currentStepIndex + 1; i < this.agent.steps.length; i++) {
                    this.agent.steps[i].status = StepStatus.CANCELLED;
                }
            }
            
            const newAccomplishStep = this.agent.createStep(
                'ACCOMPLISH',
                new Map([['goal', { inputName: 'goal', value: directAnswer, valueType: PluginParameterType.STRING }]]),
                `Pursue direct answer from reflection: ${directAnswer.substring(0, 100)}${directAnswer.length > 100 ? '...' : ''}`,
                StepStatus.PENDING
            );
            this.agent.steps.push(newAccomplishStep);
            await this.agent.updateStatus();
        } else {
            this.agent.say('Reflection did not provide a clear plan or answer. Continuing with the current plan.');
        }
    }

    /**
     * Reset reflection state for a new interaction
     */
    public reset(): void {
        this.reflectionDone = false;
        this.reflectCycleTracker.clear();
        this.lastReflectPlanSignature = '';
    }
}
