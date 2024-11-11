import { BaseService } from './baseService';


export class GGService extends BaseService {
    constructor() {
        super('GGService', process.env.GEMINI_API_KEY || '', process.env.GEMINI_API_URL || '', ['gemini']);
    }
}

export const ggService = new GGService();
export default ggService;