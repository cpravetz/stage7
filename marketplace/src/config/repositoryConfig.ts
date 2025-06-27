export const repositoryConfig = {
    defaultRepository: process.env.DEFAULT_PLUGIN_REPOSITORY || 'mongo',
    Repositories: [
        {
            type: 'local',
            options: {
                localPath: process.env.LOCAL_PLUGIN_PATH || '/usr/src/app/services//capabilitiesmanager/src/plugins'
            }
        },
        {
            type: 'mongo',
            url: process.env.LIBRARIAN_URL || 'librarian:5040',
            options: {
                collection: process.env.MONGO_COLLECTION || 'plugins'
            }
        },
        {
            type: 'git',
            url: process.env.GIT_REPOSITORY_URL || '',
            credentials: {
                username: process.env.GITHUB_USERNAME || '',
                token: process.env.GITHUB_TOKEN || '',
                email: process.env.GITHUB_EMAIL || ''
            },
            options: {
                defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main'
            }
        },
        {
            type: 'github',
            url: process.env.GIT_REPOSITORY_URL || '',
            credentials: {
                username: process.env.GITHUB_USERNAME || '',
                token: process.env.GITHUB_TOKEN || '',
                email: process.env.GITHUB_EMAIL || ''
            },
            options: {
                defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main'
            }
        },
        {
            type: 'librarian-definition',
            url: process.env.LIBRARIAN_URL || 'librarian:5040', // Matches the MongoRepository URL for Librarian
            options: {
                // These are the default collections the LibrarianDefinitionRepository will use
                // if not overridden by more specific configurations or logic within the repo itself.
                openApiToolsCollection: 'openApiTools',
                mcpToolsCollection: 'mcpTools',
                // Optionally, if a single collection is preferred for all definitions:
                // actionHandlersCollection: 'actionHandlers'
            }
        }
    ]
};