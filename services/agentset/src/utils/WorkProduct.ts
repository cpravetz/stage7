import { PluginOutput } from '@cktmcs/shared';

export class WorkProduct {
    constructor(
        public agentId: string,
        public stepId: string,
        public data: PluginOutput[]
    ) {}
}