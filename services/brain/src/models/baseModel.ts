import { BaseService, ExchangeType } from '../services/baseService';
import { BaseInterface, LLMConversationType, ConvertParamsType } from '../interfaces/baseInterface';

export class BaseModel {
    public name: string;
    public modelName: string;
    public llminterface: BaseInterface | undefined = undefined;
    public service: BaseService | undefined = undefined;
    public interfaceName: string;
    public serviceName: string;
    public costScore: number;
    public accuracyScore: number;
    public creativityScore: number;
    public speedScore: number;
    public contentConversation: LLMConversationType[];

    constructor(options: {
            name: string,
            modelName: string,
            interfaceName: string,
            serviceName: string,
            costScore: number,
            accuracyScore: number,
            creativityScore: number,
            speedScore: number,
            contentConversation: LLMConversationType[] }) 
    {
        this.name = options.name;
        this.modelName = options.modelName;
        this.interfaceName = options.interfaceName;
        this.serviceName = options.serviceName;
        this.costScore = options.costScore;
        this.accuracyScore = options.accuracyScore;
        this.creativityScore = options.creativityScore;
        this.speedScore = options.speedScore;
        this.contentConversation = options.contentConversation;
    }

    chat(messages: ExchangeType, options: { max_length?: number, temperature?: number }): Promise<string> {
        if (!this.llminterface || !this.service) {
            console.log(`No interface or service set for model ${this.name} `);
            return Promise.resolve('');
        }
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
        return (this.service?.isAvailable() && this.modelName !== '') || false;
    }
}