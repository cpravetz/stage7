import axios from 'axios';
import { load } from 'cheerio';
import { PluginInput, PluginOutput, PluginParameterType, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

// Create an authenticated API client for service-to-service communication
const authenticatedApi = createAuthenticatedAxios(
    'SEARCH_Plugin',
    process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
    process.env.CLIENT_SECRET || 'stage7AuthSecret'
);

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
    console.log('SEARCH plugin execute(): Received inputs:', inputs);
    // Also log the stringified version for easier inspection of the Map contents
    // Note: MapSerializer might not be available here, so using a simpler approach if needed.
    // For now, let's assume console.log handles Map stringification reasonably.
    // If MapSerializer is needed, it must be imported: import { MapSerializer } from '@cktmcs/shared';
    // For this exercise, we'll log the raw inputs and if complex objects are Maps, their default toString might be used.
    // A more robust solution would involve ensuring MapSerializer is available or doing a custom serialization.
    try {
        const searchTerm = inputs.get('searchTerm')?.inputValue;
        if (!searchTerm) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: `no search term provided to SEARCH plugin`,
                result: null,
                error: `no search term provided to SEARCH plugin`
            }];
            }

        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`;
        // DuckDuckGo is a public API that doesn't require authentication
        // Using direct axios for external public APIs is acceptable
        const response = await axios.get(url);
        const $ = load(response.data);

        const results = $('.result__url').map((_: number, element: any) => {
            return {
                title: $(element).parent().find('.result__title').text().trim(),
                url: $(element).attr('href')
            };
        }).get();

        return [{
            success: true,
            name: 'results',
            resultType: PluginParameterType.ARRAY,
            resultDescription: `Search results for "${searchTerm}"`,
            result: results
        }];
    } catch (error) { analyzeError(error as Error);
        console.error('SEARCH plugin failed', error instanceof Error ? error.message : error);
        return [{
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            resultDescription: `Error searching for "${inputs.get('searchTerm')?.inputValue || 'undefined search term'}"`,
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        }];
    }
}