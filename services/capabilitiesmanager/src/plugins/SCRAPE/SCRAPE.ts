import axios from 'axios';
import * as cheerio from 'cheerio';
import { PluginInput, PluginOutput, PluginParameterType, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

// Create an authenticated API client for service-to-service communication
const authenticatedApi = createAuthenticatedAxios(
    'SCRAPE_Plugin',
    process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
    process.env.CLIENT_SECRET || 'stage7AuthSecret'
);

interface ScrapeConfig {
    selector?: string;
    attribute?: string;
    limit?: number;
    transform?: (content: string) => string;
}

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        try {
            const url = inputs.get('url')?.inputValue || '';
            if (!url) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: `Url is required for SCRAPE plugin`,
                    result: null,
                    error: `Url is required for SCRAPE plugin`
                }];
                }
            console.log('SCRAPE Fetching HTML from URL:', url);
            const config = parseConfig(inputs);
            const html = await fetchHtml(url);
            const scrapedData = scrapeContent(html, config);

            return [{
                success: true,
                name: 'content',
                resultType: PluginParameterType.ARRAY,
                resultDescription: `Scraped content from ${url}`,
                result: scrapedData
            }];
        } catch (error) { analyzeError(error as Error);
            console.error('SCRAPE plugin failed', error instanceof Error ? error.message : error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: `Error scraping ${inputs.get('url')?.inputValue || 'undefined Url'}`,
                result: null,
                error: error instanceof Error ? error.message : 'An unknown error occurred'
            }];
        }
    }

function parseConfig(inputs: Map< string, PluginInput>): ScrapeConfig {
        const config: ScrapeConfig = {};

        // Parse from args
        config.selector = inputs.get('selector')?.inputValue || undefined;
        config.attribute = inputs.get('attribute')?.inputValue || undefined;
        config.limit = (inputs.get('limit')?.inputValue as number) || undefined;

        // Parse from inputValue (if provided in format "url|selector|attribute|limit")
        const parts = inputs.get('url')?.inputValue?.split('|') || [];
        if (parts.length > 1) {
            if (parts[1]) config.selector = parts[1];
            if (parts[2]) config.attribute = parts[2];
            if (parts[3]) config.limit = parseInt(parts[3], 10);
        }

        return config;
    }

async function fetchHtml(url: string): Promise<string> {
        // For external public websites, we use direct axios
        // For internal services, we would use authenticatedApi
        if (url.includes('localhost') ||
            url.includes('.local') ||
            /^https?:\/\/[^\/]+:\d+/.test(url)) {
            // This appears to be an internal URL, use authenticated API
            const response = await authenticatedApi.get(url);
            return response.data;
        } else {
            // This appears to be an external URL, use direct axios
            const response = await axios.get(url);
            return response.data;
        }
    }



function scrapeContent(html: string, config: ScrapeConfig): string[] {
        try {
            const $ = cheerio.load(html);
            const elements = config.selector ? $(config.selector) : $('body');

            if (elements.length === 0) {
                console.warn(`No elements found for selector: ${config.selector || 'body'}`);
                return [];
            }

            let result: string[] = elements.map((_, el) => {
                if (config.attribute) {
                    return $(el).attr(config.attribute) || '';
                } else {
                    return $(el).text().trim();
                }
            }).get();

            // Apply custom transform function if provided
            if (config.transform && typeof config.transform === 'function') {
                result = result.map(config.transform);
            }

            // Filter out empty strings
            result = result.filter(item => item !== '');

            // Apply limit if specified
            if (config.limit && config.limit > 0) {
                result = result.slice(0, config.limit);
            }

            return result;
        } catch (error) { analyzeError(error as Error);
            console.error('Error in scrapeContent:', error instanceof Error ? error.message : error);
            return [];
        }
    }


export default execute;