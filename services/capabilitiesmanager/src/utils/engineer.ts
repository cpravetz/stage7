import axios from 'axios';
import { PluginOutput, PluginParameterType, Step } from '@cktmcs/shared';


export const requestPluginFromEngineer = async (step: Step, accomplishGuidance: String): Promise<PluginOutput> => {
    try {
        const engineerUrl = process.env.ENGINEER_URL || 'engineer:5070';
        const response = await axios.post(`http://${engineerUrl}/createPlugin`, {
            verb: step.actionVerb,
            context: step.inputs,
            accomplishGuidance: accomplishGuidance
        });

        if (response.data.success) {
            console.log('Engineer created new plugin:', response.data.plugin);
            return {
                success: true,
                name: 'plugin_created',
                resultType: PluginParameterType.PLUGIN,
                result: response.data.plugin,
                resultDescription: 'Created new plugin for ' + step.actionVerb
            };
        }
        console.error('Failed to create plugin:', response.data.error);
        return {
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            error: response.data.error || 'Failed to create plugin',
            resultDescription: 'Failed to create plugin',
            result: null
        };
    } catch (error) {
        console.error('Failed to create plugin:', error instanceof Error ? error.message : error);
        return {
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            error: error instanceof Error ? error.message : 'Failed to create plugin',
            resultDescription: 'Failed to create plugin',
            result: null
        };
    }
}
