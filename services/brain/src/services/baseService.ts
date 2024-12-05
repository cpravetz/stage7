export type ExchangeType = Array<{ role: string, content: string }>;

export class BaseService {
    public serviceName: string;
    public apiKey: string = '';
    public apiUrl: string = '';
    public interfaces: string[];

    constructor(serviceName: string, apiKey: string, apiUrl: string, interfaces: string[]) {
        this.apiKey = apiKey || '';
        this.apiUrl = apiUrl || '';
        this.interfaces = interfaces;
        this.serviceName = serviceName;
    }

    isAvailable(): boolean {
        return (this.apiKey !== '' && this.apiUrl !== '');
    }

}