import express from 'express';
import { PluginOutput, PluginParameterType, InputValue } from '@cktmcs/shared';
import { AgentStatus } from '../utils/agentStatus';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Interface for the agent context needed by UserInteractionManager
 */
export interface UserInteractionAgentContext {
    id: string;
    status: AgentStatus;
    questions: string[];
    
    // Methods the agent must provide
    say: (message: string, isImportant?: boolean) => void;
    logAndSay: (message: string) => void;
    ask: (question: string, answerType: string, choices?: string[]) => void;
}

/**
 * Manages user interaction flows (ASK, CHAT verbs)
 */
export class UserInteractionManager {
    private agent: UserInteractionAgentContext;
    private currentQuestionResolve: ((value: string) => void) | null = null;

    constructor(agent: UserInteractionAgentContext) {
        this.agent = agent;
    }

    /**
     * Truncate large strings for logging
     */
    private truncateLargeStrings(obj: any, maxLength: number = 500): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.truncateLargeStrings(item, maxLength));
        }
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (typeof value === 'string' && value.length > maxLength) {
                    newObj[key] = `[Truncated string, length: ${value.length}]`;
                } else if (typeof value === 'object') {
                    newObj[key] = this.truncateLargeStrings(value, maxLength);
                } else {
                    newObj[key] = value;
                }
            }
        }
        return newObj;
    }

    /**
     * Handle ASK or CHAT step
     */
    public async handleAskStep(inputs: Map<string, InputValue>): Promise<PluginOutput[]> {
        if (this.agent.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.agent.id} is not RUNNING, aborting handleAskStep.`);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Agent not running',
                result: null,
                error: 'Agent is not in RUNNING state.'
            }];
        }

        // Handle CHAT verb by checking for 'message' input
        if (inputs.has('message')) {
            const messageInput = inputs.get('message');
            const message = messageInput?.value;
            console.log(`[Agent ${this.agent.id}] Sending CHAT message to user: ${message} from input: ${JSON.stringify(this.truncateLargeStrings(messageInput))}`);

            if (typeof message === 'string' && message) {
                this.agent.say(message, true);
                return [{
                    success: true,
                    name: 'success',
                    resultType: PluginParameterType.STRING,
                    resultDescription: 'Message sent to user.',
                    result: 'Message sent successfully.'
                }];
            } else {
                this.agent.logAndSay('Error in CHAT: message is empty or not a string.');
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Error in CHAT: message is empty or not a string.',
                    result: null,
                    error: 'CHAT requires a non-empty string "message" input.'
                }];
            }
        }

        // Handle ASK verb
        const input = inputs.get('question');
        if (!input) {
            this.agent.logAndSay('Question is required for ASK plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in handleAskStep',
                result: null,
                error: 'Question is required for ASK plugin'
            }];
        }
        
        let question = input.value || input.args?.question;
        inputs.forEach((value, key) => {
            if (key !== 'question') {
                const regex = new RegExp(`{${key}}`, 'g');
                question = question.replace(regex, value.value);
            }
        });
        const choices = input.args?.choices;
        const answerType = input.args?.answerType || 'text';
        
        try {
            const response = await this.askUser(question, choices, answerType);
            return [{
                success: true,
                name: 'answer',
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            }];
        } catch (error) {
            analyzeError(error as Error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: 'Error in handleAskStep',
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }];
        }
    }

    /**
     * Ask user a question and wait for response
     */
    private async askUser(question: string, choices?: string[], answerType: string = 'text'): Promise<string> {
        return new Promise((resolve) => {
            this.currentQuestionResolve = resolve;
            this.agent.ask(question, answerType, choices);
        });
    }

    /**
     * Handle answer received from user
     */
    public onAnswer(answer: express.Request): void {
        if (answer.body.questionGuid && this.agent.questions.includes(answer.body.questionGuid)) {
            this.agent.questions = this.agent.questions.filter(q => q !== answer.body.questionGuid);
        }
        if (this.currentQuestionResolve) {
            this.currentQuestionResolve(answer.body.answer);
            this.currentQuestionResolve = null;
        }
    }

    /**
     * Check if there's a pending question
     */
    public hasPendingQuestion(): boolean {
        return this.currentQuestionResolve !== null;
    }

    /**
     * Resolve pending question with empty answer (for pause/abort)
     */
    public resolveWithEmpty(): void {
        if (this.currentQuestionResolve) {
            this.currentQuestionResolve('');
            this.currentQuestionResolve = null;
        }
    }
}
