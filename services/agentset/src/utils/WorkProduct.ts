export class WorkProduct {
    constructor(
        public agentId: string,
        public stepId: string,
        public type: string,
        public data: any,
        public mimeType: string
    ) {}
}