
const scrapePlugin = {
    id: 'plugin-SCRAPE',
    verb: 'SCRAPE',
    description: 'Scrapes content from a given URL',
    explanation: 'This plugin takes a URL and optional configuration to scrape specific content from a web page',
    inputs: [
        {
            name: 'url',
            type: 'string',
            description: 'The URL to scrape content from'
        },
        {
            name: 'selector',
            type: 'string',
            description: 'CSS selector to target specific elements (optional)'
        },
        {
            name: 'attribute',
            type: 'string',
            description: 'Attribute to extract from the selected elements (optional)'
        },
        {
            name: 'limit',
            type: 'number',
            description: 'Maximum number of results to return (optional)'
        }
    ],
    outputs: [
        {
            name: 'result',
            type: 'array',
            description: 'Array of scraped content'
        }
    ],
    language: 'javascript',
    entryPoint: {
        main: 'SCRAPE.js',
        files: [
            {
                'main.js': `
const axios = require('axios');
const cheerio = require('cheerio');

async function execute(input) {
    try {
        const url = input.inputValue || input.args.url;
        if (!url) {
            throw new Error('URL is required for SCRAPE plugin');
        }
        console.log('SCRAPE Fetching HTML from URL:', url);
        const config = parseConfig(input);
        const html = await fetchHtml(url);
        const scrapedData = scrapeContent(html, config);

        return {
            success: true,
            resultType: 'array',
            resultDescription: \`Scraped content from \${url}\`,
            result: scrapedData,
            mimeType: 'application/json'
        };
    } catch (error) {
        console.error('SCRAPE plugin failed', error);
        return {
            success: false,
            resultType: 'error',
            resultDescription: \`Error scraping \${input.inputValue || input.args.url}\`,
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
            mimeType: 'text/plain'
        };
    }
}

function parseConfig(input) {
    const config = {};

    // Parse from args
    if (input.args.selector) config.selector = input.args.selector;
    if (input.args.attribute) config.attribute = input.args.attribute;
    if (input.args.limit) config.limit = parseInt(input.args.limit, 10);

    // Parse from inputValue (if provided in format "url|selector|attribute|limit")
    const parts = input.inputValue.split('|');
    if (parts.length > 1) {
        if (parts[1]) config.selector = parts[1];
        if (parts[2]) config.attribute = parts[2];
        if (parts[3]) config.limit = parseInt(parts[3], 10);
    }

    return config;
}

async function fetchHtml(url) {
    const response = await axios.get(url);
    return response.data;
}

function scrapeContent(html, config) {
    try {
        const $ = cheerio.load(html);
        const elements = config.selector ? $(config.selector) : $('body');

        if (elements.length === 0) {
            console.warn(\`No elements found for selector: \${config.selector || 'body'}\`);
            return [];
        }

        let result = elements.map((_, el) => {
            if (config.attribute) {
                return $(el).attr(config.attribute) || '';
            } else {
                return $(el).text().trim();
            }
        }).get();

        // Filter out empty strings
        result = result.filter(item => item !== '');

        // Apply limit if specified
        if (config.limit && config.limit > 0) {
            result = result.slice(0, config.limit);
        }

        return result;
    } catch (error) {
        console.error('Error in scrapeContent:', error);
        return [];
    }
}

module.exports = { execute };
                `
            }
        ]
    }
};

export default scrapePlugin;