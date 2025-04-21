# GitHub Integration for Plugin Ecosystem

## Overview

This document outlines the implementation of GitHub integration for the Stage7 plugin ecosystem. The integration enables storing, retrieving, and managing plugins directly from GitHub repositories, providing a more robust and collaborative way to manage plugins.

## Components

### Backend

1. **GitHubRepository**
   - Implements the `PluginRepository` interface for GitHub
   - Uses GitHub API to interact with repositories
   - Supports storing, fetching, and deleting plugins
   - Handles plugin versioning and compatibility

2. **GitHub API Routes**
   - `/github/config`: Get and update GitHub configuration
   - `/github/plugins`: List plugins from GitHub
   - `/github/plugins/:id`: Get a specific plugin from GitHub
   - `/plugins`: Generic endpoint for listing plugins from any repository
   - `/plugins/:id`: Generic endpoint for getting a specific plugin from any repository

3. **PluginMarketplace**
   - Enhanced to support GitHub as a repository type
   - Provides access to repositories through `getRepositories()` method
   - Handles plugin storage, retrieval, and management across different repository types

### Frontend

1. **GitHubPluginManager**
   - UI component for managing GitHub plugins
   - Allows configuring GitHub credentials and repository
   - Displays plugins from GitHub repository
   - Supports viewing, deleting, and navigating to plugins on GitHub

## Features

### Plugin Storage in GitHub

Plugins are stored in a GitHub repository with the following structure:

```
plugins/
  ├── plugin-id-1/
  │   ├── plugin-manifest.json
  │   └── [plugin files]
  ├── plugin-id-2/
  │   ├── plugin-manifest.json
  │   └── [plugin files]
  └── ...
```

Each plugin has its own directory containing:
- `plugin-manifest.json`: Contains plugin metadata, including ID, verb, version, and security information
- Plugin files: JavaScript, Python, or other files needed for the plugin

### Plugin Versioning and Compatibility

The system checks plugin compatibility when updating existing plugins:

1. **Version Comparison**: Ensures new plugin version is higher than existing version
2. **Compatibility Check**: Verifies that the new plugin is compatible with the existing one
3. **Signature Verification**: Validates plugin signature for security

### GitHub API Integration

The implementation uses GitHub's REST API to:

1. **List Repositories**: Get a list of plugins in the repository
2. **Get File Contents**: Retrieve plugin manifest and files
3. **Create/Update Files**: Store new plugins or update existing ones
4. **Delete Files**: Remove plugins from the repository

### Security

1. **Token-Based Authentication**: Uses GitHub personal access tokens for authentication
2. **Signature Verification**: Verifies plugin signatures before execution
3. **Permission Validation**: Checks plugin permissions for security

## Configuration

### Environment Variables

The following environment variables are used for GitHub integration:

- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_USERNAME`: GitHub username
- `GIT_REPOSITORY_URL`: URL of the GitHub repository (format: `https://github.com/owner/repo.git`)
- `GIT_DEFAULT_BRANCH`: Default branch of the repository (default: `main`)
- `DEFAULT_PLUGIN_REPOSITORY`: Default repository type (e.g., `github`, `mongo`, `local`)

### Repository Configuration

The repository configuration in `repositoryConfig.ts` includes GitHub as a repository type:

```typescript
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
```

## Usage

### Accessing the GitHub Plugin Manager

The GitHub Plugin Manager is available at `/github-plugins` in the web interface. It provides:

1. **GitHub Configuration**: Set up GitHub credentials and repository
2. **Plugin Listing**: View all plugins in the GitHub repository
3. **Plugin Management**: Delete plugins or navigate to them on GitHub

### API Endpoints

The following API endpoints are available for GitHub integration:

- `GET /github/config`: Get GitHub configuration
- `POST /github/config`: Update GitHub configuration
- `GET /github/plugins`: List plugins from GitHub
- `GET /github/plugins/:id`: Get a specific plugin from GitHub
- `DELETE /github/plugins/:id`: Delete a plugin from GitHub

### Using GitHub as the Default Repository

To use GitHub as the default repository for plugins, set the `DEFAULT_PLUGIN_REPOSITORY` environment variable to `github`.

## Future Enhancements

1. **Pull Request Integration**: Allow creating and reviewing pull requests for plugin changes
2. **Webhook Support**: Automatically update plugins when changes are pushed to GitHub
3. **Multi-Repository Support**: Support multiple GitHub repositories for different plugin categories
4. **Branch Management**: Support different branches for development, staging, and production plugins
5. **Collaborative Editing**: Enable collaborative editing of plugins through GitHub's collaboration features
