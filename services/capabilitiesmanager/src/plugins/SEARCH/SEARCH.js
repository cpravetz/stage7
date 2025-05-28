const axios = require('axios');

async function execute(input) {
    try {
        const { searchTerm } = input.args;
        if (!searchTerm) {
            throw new Error('Search term is required');
        }

        const response = await axios.get('https://api.duckduckgo.com/', {
            params: {
                q: searchTerm,
                format: 'json'
            }
        });

        const results = response.data.RelatedTopics.map(topic => ({
            title: topic.Text,
            url: topic.FirstURL
        }));

        return {
            success: true,
            resultType: 'array',
            resultDescription: 'Search results from DuckDuckGo',
            result: results,
            mimeType: 'application/json'
        };
    } catch (error) {
        console.error('SEARCH plugin failed:', error instanceof Error ? error.message : error);
        return {
            success: false,
            resultType: 'error',
            resultDescription: 'Error performing search',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
            mimeType: 'text/plain'
        };
    }
}

module.exports = { execute };
