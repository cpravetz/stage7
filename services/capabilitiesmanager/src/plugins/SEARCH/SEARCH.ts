import axios from 'axios';
import { load } from 'cheerio';
import { PluginInput, PluginOutput, PluginParameterType, createAuthenticatedAxios, MapSerializer } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

// Create an authenticated API client for service-to-service communication
const authenticatedApi = createAuthenticatedAxios(
    'SEARCH_Plugin',
    process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
    process.env.CLIENT_SECRET || 'stage7AuthSecret'
);

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
    console.log('SEARCH plugin execute() CALLED.'); // General marker
    try {
        console.log('SEARCH plugin execute(): Received inputs (raw Map object):', inputs);
        // Attempt to serialize for better readability if MapSerializer is available and inputs is a Map
        if (inputs && typeof inputs.entries === 'function') { // Basic check if it's Map-like
            console.log('SEARCH plugin execute(): Received inputs (serialized by MapSerializer):', MapSerializer.transformForSerialization(inputs));
            const searchInputObject = inputs.get('searchTerm');
            console.log(`SEARCH plugin execute(): result of inputs.get('searchTerm'): ${JSON.stringify(searchInputObject)}`);
            if (searchInputObject && typeof searchInputObject === 'object' && searchInputObject !== null) {
                console.log(`SEARCH plugin execute(): searchInputObject.inputValue is: "${searchInputObject.inputValue}"`);
                console.log(`SEARCH plugin execute(): typeof searchInputObject.inputValue is: ${typeof searchInputObject.inputValue}`);
            } else if (searchInputObject) {
                console.log(`SEARCH plugin execute(): searchInputObject is not a typical PluginInput object. Value: ${JSON.stringify(searchInputObject)}`);
            } else {
                console.log("SEARCH plugin execute(): inputs.get('searchTerm') returned undefined or null.");
            }
        } else {
            console.log('SEARCH plugin execute(): Received inputs is not a Map or not serializable by MapSerializer. Raw inputs:', inputs);
        }
    } catch (e: any) {
        console.error('SEARCH plugin execute(): Error during initial diagnostic logging:', e.message, e.stack);
    }
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