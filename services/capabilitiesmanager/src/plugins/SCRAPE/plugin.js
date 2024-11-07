
const scrapePlugin = {
    id: 'plugin-SCRAPE',
    verb: 'SCRAPE',
    description: 'Scrapes content from a given URL',
    explanation: 'This plugin takes a URL and optional configuration to scrape specific content from a web page',
    inputDefinitions: [
        {
            name: 'url',
            required: true,
            type: 'string',
            description: 'The URL to scrape content from'
        },
        {
            name: 'selector',
            required: false,
            type: 'string',
            description: 'CSS selector to target specific elements (optional)'
        },
        {
            name: 'attribute',
            required: false,
            type: 'string',
            description: 'Attribute to extract from the selected elements (optional)'
        },
        {
            name: 'limit',
            required: false,
            type: 'number',
            description: 'Maximum number of results to return (optional)'
        }
    ],
    outputDefinitions: [
        {
            name: 'content',
            required: false,
            type: 'array',
            description: 'Array of scraped content'
        }
    ],
    language: 'javascript',
    entryPoint: {
        main: 'SCRAPE.js',
        files: []
    }
};

export default scrapePlugin;