import fs from 'fs/promises';
import { PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';

export async function execute(operation: 'read' | 'write' | 'append', path: string, content?: string): Promise<PluginOutput> {
        try {
            switch (operation) {
                case 'read':
                    const data = await fs.readFile(path, 'utf-8');
                    return {
                        success: true,
                        resultType: PluginParameterType.ANY,
                        resultDescription: `Read content from ${path}`,
                        result: data
                    };
        
                case 'write':
                    await fs.writeFile(path, content || '');
                    return {
                        success: true,
                        resultType: PluginParameterType.ANY,
                        resultDescription: `Saved content to ${path}`,
                        result: null
                    };
                case 'append':
                    await fs.appendFile(path, content || '');
                    return {
                        success: true,
                        resultType: PluginParameterType.ANY,
                        resultDescription: `Appended content to ${path}`,
                        result: null
                    };
                default:
                    return {
                        success: false,
                        resultType: PluginParameterType.ERROR,
                        resultDescription: `Unknown operation ${operation}`,
                        result: null,
                        error: `Unknown operation ${operation}`
                    };

            }
        } catch (error) {
            return {
                success: false,
                resultType: PluginParameterType.ERROR,
                resultDescription: `An error occured for operation ${operation}`,
                result: null,
                error: error instanceof Error ? error.message : 'An unknown error occurred'
            };
    }
    }