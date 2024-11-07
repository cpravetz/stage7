import axios from 'axios';
import { PluginInput, PluginOutput, PluginParameterType, ActionVerbTask } from '@cktmcs/shared';

export async function execute(input: PluginInput): Promise<PluginOutput[]> {
  return [{
    success: false,
    name: 'error',
    resultType: PluginParameterType.ERROR,
    result: 'This plugin is just a stub',
    resultDescription: ''
  }];
}
