import { BaseService } from './baseService';

export class AntService extends BaseService {
    constructor() {
        super('AntService', process.env.ANTHROPIC_API_KEY || '', 
                            process.env.ANTHROPIC_API_URL || '', ['anthoropic']);
    }
}

export const antService = new AntService();
export default antService;