import axios from 'axios';
import cheerio from 'cheerio';
import { PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
    try {
        const searchTerm = inputs.get('searchTerm')?.inputValue;
        if (!searchTerm) {
            throw new Error('Search term is required for SEARCH plugin');
        }

        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const results = $('.result__url').map((_, element) => {
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