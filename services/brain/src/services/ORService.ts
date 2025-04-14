import { BaseService } from './baseService';


export class ORService extends BaseService {
    constructor() {
        super('ORService', process.env.OPENROUTER_API_KEY || '', 'https://api.openrouter.ai/api/v1/', ['openrouter']);
    }
}

export const orService = new ORService();
export default orService;