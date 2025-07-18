import { BaseService, ExchangeType } from '../services/baseService';
import { BaseInterface, ConvertParamsType } from '../interfaces/baseInterface';
import { LLMConversationType } from '@cktmcs/shared';

export interface ModelScore {
    costScore: number;
    accuracyScore: number;
    creativityScore: number;
    speedScore: number;
}

export class BaseModel {
    public name: string;
    public modelName: string;
    public llminterface: BaseInterface | undefined = undefined;
    public service: BaseService | undefined = undefined;
    public interfaceName: string;
    public serviceName: string;
    tokenLimit: number;
    scoresByConversationType: Map<LLMConversationType, ModelScore>;
    public contentConversation: LLMConversationType[];

    constructor(options: {
            name: string,
            modelName: string,
            interfaceName: string,
            serviceName: string,
            tokenLimit: number,
            scoresByConversationType: Map<LLMConversationType, ModelScore>,
            contentConversation: LLMConversationType[] })
    {
        this.name = options.name;
        this.modelName = options.modelName;
        this.interfaceName = options.interfaceName;
        this.serviceName = options.serviceName;
        this.tokenLimit = options.tokenLimit;
        this.scoresByConversationType = options.scoresByConversationType;
        this.contentConversation = options.contentConversation;
    }

    getScoreForConversationType(conversationType: LLMConversationType): number {
        return this.getCostScore(conversationType) + this.getAccuracyScore(conversationType) + this.getCreativityScore(conversationType) + this.getSpeedScore(conversationType);
    }

    getScoresForConversationType(conversationType: LLMConversationType): ModelScore {
        return this.getScore(conversationType);
    }

    getScore(conversationType: LLMConversationType): ModelScore {
        return this.scoresByConversationType.get(conversationType) || {
            costScore: 0,
            accuracyScore: 0,
            creativityScore: 0,
            speedScore: 0
        };
    }

    getCostScore(conversationType: LLMConversationType): number {
        return this.getScore(conversationType).costScore;
    }

    getAccuracyScore(conversationType: LLMConversationType): number {
        return this.getScore(conversationType).accuracyScore;
    }

    getCreativityScore(conversationType: LLMConversationType): number {
        return this.getScore(conversationType).creativityScore;
    }

    getSpeedScore(conversationType: LLMConversationType): number {
        return this.getScore(conversationType).speedScore;
    }

    chat(messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, timeout?: number, response_format?: any, [key: string]: any }): Promise<string> {
        if (!this.llminterface || !this.service) {
            console.log(`No interface or service set for model ${this.name} `);
            return Promise.resolve('');
        }
        options.modelName = options.modelName || this.modelName;
        return this.llminterface.chat(this.service, messages, options);
    }
    convert(conversationType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        if (!this.llminterface || !this.service) {
            console.log(`No interface or service set for model ${this.name} `);
            return Promise.resolve('');
        }
        if (!this.llminterface.convert || !this.contentConversation.includes(conversationType)) {
            console.log(`No convert function set for interface for model ${this.llminterface.interfaceName} `);
            return Promise.resolve('');
        }
        convertParams.service = this.service;
        return this.llminterface.convert(this.service, conversationType, convertParams);
    }

    setProviders( llminterface: BaseInterface, service: BaseService) {
        this.llminterface = llminterface;
        this.service = service;
    }

    isAvailable(): boolean {
        // First check if the service is available and the model name is valid
        if (!this.service?.isAvailable() || this.modelName === '') {
            return false;
        }

        // Check if this is a Huggingface model and if there's a global blacklist
        if (this.name.toLowerCase().includes('hf/') || this.name.toLowerCase().includes('huggingface')) {
            const globalBlacklistUntil = (global as any).huggingfaceBlacklistedUntil;
            if (globalBlacklistUntil) {
                const blacklistDate = new Date(globalBlacklistUntil);
                const now = new Date();
                if (now < blacklistDate) {
                    console.log(`Huggingface model ${this.name} is globally blacklisted until ${blacklistDate.toISOString()}`);
                    return false;
                }
            }
        }

        return true;
    }
}