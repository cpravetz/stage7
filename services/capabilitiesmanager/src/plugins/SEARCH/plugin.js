const searchPlugin = {
    id: 'plugin-SEARCH',
    verb: 'SEARCH',
    description: 'Searches DuckDuckGo for a given term and returns a list of links',
    explanation: 'This plugin takes a search term and returns a JSON array of search results from DuckDuckGo, including titles and URLs.',
    inputDefinitions: [
        {
            name: 'searchTerm',
            required: true,
            type: 'string',
            description: 'The term to search for on DuckDuckGo'
        }
    ],
    outputDefinitions: [
        {
            name: 'results',
            required: false,
            type: 'array',
            description: 'Array of search results, each containing a title and URL'
        }
    ],
    language: 'javascript',
    entryPoint: {
        main: 'SEARCH.js'
    }
};

export default searchPlugin;