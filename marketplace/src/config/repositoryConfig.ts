// Build repositories array conditionally
const repositories: any[] = [
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
        type: 'librarian-definition',
        librarianUrl: process.env.LIBRARIAN_URL || 'librarian:5040', // Matches the MongoRepository URL for Librarian
        openApiToolsCollection: 'openApiTools',
        mcpToolsCollection: 'mcpTools',
    }
];

// Only add GitHub repositories if properly configured
if (process.env.ENABLE_GITHUB === 'true' && process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME) {
    repositories.push(
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
        }
    );
    console.log('GitHub repositories enabled in configuration');
} else {
    console.log('GitHub repositories disabled - missing ENABLE_GITHUB=true, GITHUB_TOKEN, or GITHUB_USERNAME');
}

export const repositoryConfig = {
    defaultRepository: process.env.DEFAULT_PLUGIN_REPOSITORY || 'local',
    Repositories: repositories
};