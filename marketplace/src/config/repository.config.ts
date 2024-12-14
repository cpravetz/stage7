export const repositoryConfig = {
    defaultRepository: {
        type: process.env.DEFAULT_PLUGIN_REPOSITORY || 'mongo',
        url: process.env.DEFAULT_REPOSITORY_URL,
        credentials: {
            username: process.env.REPOSITORY_USERNAME,
            token: process.env.REPOSITORY_TOKEN,
            email: process.env.REPOSITORY_EMAIL
        },
        options: {
            collection: process.env.MONGO_COLLECTION || 'plugins',
            defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main'
        }
    },
    additionalRepositories: [
        {
            type: 'git',
            url: process.env.GIT_REPOSITORY_URL,
            credentials: {
                username: process.env.GITHUB_USERNAME,
                token: process.env.GITHUB_TOKEN,
                email: process.env.GITHUB_EMAIL
            }
        },
        // Add other repository configurations
    ]
};