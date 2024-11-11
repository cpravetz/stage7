import { BaseService } from './baseService';


export class OAService extends BaseService {
    constructor() {
        super('OAService', process.env.OPENAI_API_KEY || '', 'https://api.openai.com/v1/', ['openai']);
    }
}

export const oaService = new OAService();
export default oaService;