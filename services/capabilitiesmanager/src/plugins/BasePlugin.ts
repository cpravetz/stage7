import axios from 'axios';
import { InputValue, PluginOutput, PluginParameterType, ActionVerbTask } from '@cktmcs/shared';

export async function execute(input: InputValue): Promise<PluginOutput[]> {
  return [{
    success: false,
    name: 'error',
    resultType: PluginParameterType.ERROR,
    result: 'This plugin is just a stub',
    resultDescription: 'Called stub instead of real plugin'
  }];
}
