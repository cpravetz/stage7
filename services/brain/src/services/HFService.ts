import { BaseService } from './baseService';


export class HFService extends BaseService {
    constructor() {
        super('HFService', process.env.HUGGINGFACE_API_KEY || '', process.env.HUGGINGFACE_API_URL || '', ['huggingface']);
    }
}

export const hfService = new HFService();
export default hfService;